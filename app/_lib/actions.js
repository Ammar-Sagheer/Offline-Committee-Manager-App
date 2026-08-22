"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asManager, asUser, requireManager, getSessionUser } from "./auth";
import { signIn, signOut } from "./auth";
import { query } from "./db";
import { describeError } from "./helpers";

/**
 * Every write in the app, and one return shape for all of them, so a single
 * <FormMessage> renders every result.
 *
 * These are deliberately thin. The rules live in Postgres -- the refusals, the
 * ceilings, the solvency check, the append-only ledger -- and this layer's job
 * is to pass what was typed and hand the database's own sentence back to the
 * screen. An application-side re-check would be a second, quieter copy of the
 * rules that could drift from the real ones.
 */

const ok = (message, extra = {}) => ({ ok: true, message, ...extra });
const fail = (message, extra = {}) => ({ ok: false, message, ...extra });

function text(formData, field) {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function number(formData, field) {
  const raw = text(formData, field).replace(/[,\s]/g, "");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function integer(formData, field) {
  const n = number(formData, field);
  return n === null ? null : Math.round(n);
}

function dateOrNull(formData, field) {
  const raw = text(formData, field);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

/* ------------------------------------------------------------- sign in -- */

export async function signInAction(_prev, formData) {
  const username = text(formData, "username");
  const password = formData.get("password");

  if (!username || !password) return fail("Enter your username and password.");

  try {
    const user = await signIn(username, String(password));
    if (!user) return fail("That username and password do not match.");
  } catch (error) {
    return fail(describeError(error, "Could not sign in."));
  }
  redirect("/");
}

export async function signOutAction() {
  await signOut();
  redirect("/login");
}

/* --------------------------------------------------------------- setup -- */

/**
 * First run. There is no dashboard anywhere to create the first account from,
 * so the app has to do it itself -- the most commonly forgotten piece of an
 * offline build.
 */
export async function setupAction(_prev, formData) {
  const username = text(formData, "username");
  const fullName = text(formData, "full_name") || "Committee Manager";
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const names = (formData.getAll("member_name") ?? [])
    .map((n) => String(n).trim())
    .filter(Boolean);

  const startMonth = text(formData, "start_month");
  const monthsCollected = integer(formData, "months_collected");
  const contribution = number(formData, "contribution");
  const term = integer(formData, "term_months");
  const maxPayout = number(formData, "max_payout");
  const buffer = number(formData, "safety_buffer") ?? 50000;
  const markPaid = formData.get("mark_all_paid") !== null;

  if (password !== confirm) return fail("The two passwords do not match.");
  if (names.length < 2) return fail("A committee needs at least two members.");
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
    return fail("Two members have the same name. Give them something to tell them apart.");
  }
  if (!/^\d{4}-\d{2}$/.test(startMonth)) return fail("Pick the month the committee started.");
  if (monthsCollected === null || monthsCollected < 0) return fail("Enter how many months have been collected.");
  if (!contribution || contribution <= 0) return fail("Enter the monthly contribution.");
  if (!term || term < 1) return fail("Enter how many months a withdrawal is repaid over.");
  if (!maxPayout || maxPayout <= 0) return fail("Enter the agreed withdrawal amount.");

  try {
    await query("select create_user($1, $2, $3, $4)", [username, fullName, password, "manager"]);
  } catch (error) {
    return fail(describeError(error, "Could not create the login."));
  }

  try {
    const user = await signIn(username, password);
    if (!user) return fail("The login was created but signing in failed. Try the sign-in screen.");

    await asManager((client) =>
      client.query("select bootstrap_committee($1, $2, $3, $4, $5, $6, $7, $8)", [
        names,
        `${startMonth}-01`,
        monthsCollected,
        contribution,
        term,
        maxPayout,
        buffer,
        markPaid,
      ]),
    );
  } catch (error) {
    return fail(describeError(error, "Could not set the committee up."));
  }

  redirect("/");
}

/* -------------------------------------------------------- the month's work -- */

export async function markContributionAction(_prev, formData) {
  const memberId = text(formData, "member_id");
  const cycleNo = integer(formData, "cycle_no");
  const amount = number(formData, "amount");
  const entryDate = dateOrNull(formData, "entry_date");

  if (!memberId) return fail("Pick a member.");
  if (amount !== null && amount <= 0) return fail("A contribution has to be more than nothing.");

  try {
    await asManager((client) =>
      client.query("select record_contribution($1, $2, $3, $4, $5)", [
        memberId,
        cycleNo,
        amount,
        entryDate,
        text(formData, "note") || null,
      ]),
    );
  } catch (error) {
    return fail(describeError(error, "Could not record that contribution."));
  }

  revalidatePath("/", "layout");
  return ok("Marked paid.");
}

export async function recordPayoutAction(_prev, formData) {
  const memberId = text(formData, "member_id");
  const amount = number(formData, "amount");
  const cycleNo = integer(formData, "cycle_no");
  const term = integer(formData, "term_months");
  const override = text(formData, "override_reason");

  if (!memberId) return fail("Choose who is getting the committee this month.");
  if (!amount || amount <= 0) return fail("Enter how much is being handed over.");

  try {
    await asManager((client) =>
      client.query("select record_payout($1, $2, $3, $4, $5, $6, $7)", [
        memberId,
        amount,
        cycleNo,
        term,
        dateOrNull(formData, "entry_date"),
        text(formData, "note") || null,
        override || null,
      ]),
    );
  } catch (error) {
    // A refusal is the most important message this app produces, so it goes
    // back untouched -- the database wrote it as a sentence for exactly this.
    // `refused` lets the dialog offer the override box instead of just crying.
    return fail(describeError(error, "Could not record that withdrawal."), { refused: true });
  }

  revalidatePath("/", "layout");
  return ok(`Recorded. ${override ? "The reason you gave is on the record." : ""}`.trim());
}

export async function recordRepaymentAction(_prev, formData) {
  const memberId = text(formData, "member_id");
  const amount = number(formData, "amount");

  if (!memberId) return fail("Pick a member.");
  if (!amount || amount <= 0) return fail("Enter how much has been repaid.");

  try {
    await asManager((client) =>
      client.query("select record_repayment($1, $2, $3, $4, $5, $6)", [
        memberId,
        amount,
        integer(formData, "cycle_no"),
        dateOrNull(formData, "entry_date"),
        text(formData, "note") || null,
        text(formData, "loan_id") || null,
      ]),
    );
  } catch (error) {
    return fail(describeError(error, "Could not record that repayment."));
  }

  revalidatePath("/", "layout");
  return ok("Repayment recorded.");
}

export async function reverseEntryAction(_prev, formData) {
  const entryId = text(formData, "entry_id");
  const note = text(formData, "note");

  if (!entryId) return fail("Nothing was selected to reverse.");
  if (note.length < 3) return fail("Say briefly why this is being reversed. It stays on the record.");

  try {
    await asManager((client) => client.query("select reverse_entry($1, $2)", [entryId, note]));
  } catch (error) {
    return fail(describeError(error, "Could not reverse that entry."));
  }

  revalidatePath("/", "layout");
  return ok("Reversed. Both entries stay on the statement and cancel each other out.");
}

export async function closeCycleAction(_prev, formData) {
  const cycleNo = integer(formData, "cycle_no");
  try {
    await asManager((client) => client.query("select close_cycle($1)", [cycleNo]));
  } catch (error) {
    return fail(describeError(error, "Could not close that month."));
  }
  revalidatePath("/", "layout");
  return ok(`Committee month ${cycleNo} is closed. Month ${cycleNo + 1} is now open.`);
}

export async function reopenCycleAction(_prev, formData) {
  const cycleNo = integer(formData, "cycle_no");
  try {
    await asManager((client) => client.query("select reopen_cycle($1)", [cycleNo]));
  } catch (error) {
    return fail(describeError(error, "Could not reopen that month."));
  }
  revalidatePath("/", "layout");
  return ok(`Committee month ${cycleNo} is open again.`);
}

/* -------------------------------------------------------------- members -- */

export async function addMemberAction(_prev, formData) {
  const name = text(formData, "full_name");
  if (!name) return fail("Enter the member's name.");

  try {
    await asManager((client) =>
      client.query(
        `insert into members (full_name, phone, notes, display_order)
         values ($1, $2, $3, coalesce((select max(display_order) from members), 0) + 1)`,
        [name, text(formData, "phone") || null, text(formData, "notes") || null],
      ),
    );
  } catch (error) {
    return fail(describeError(error, "Could not add that member."));
  }

  revalidatePath("/", "layout");
  return ok(`${name} added.`);
}

export async function updateMemberAction(_prev, formData) {
  const id = text(formData, "member_id");
  const name = text(formData, "full_name");
  if (!id) return fail("No member was selected.");
  if (!name) return fail("Enter the member's name.");

  try {
    await asManager((client) =>
      client.query("update members set full_name = $2, phone = $3, notes = $4 where id = $1", [
        id,
        name,
        text(formData, "phone") || null,
        text(formData, "notes") || null,
      ]),
    );
  } catch (error) {
    return fail(describeError(error, "Could not save those changes."));
  }

  revalidatePath("/", "layout");
  return ok("Saved.");
}

/**
 * Somebody leaves the committee.
 *
 * Never a delete: his thirteen months of contributions are the other nine
 * members' history too, and the bank balance is the sum of exactly those rows.
 */
export async function deactivateMemberAction(_prev, formData) {
  const id = text(formData, "member_id");
  if (!id) return fail("No member was selected.");

  try {
    await asManager(async (client) => {
      const { rows } = await client.query(
        "select full_name, (select coalesce(sum(outstanding),0) from loan_positions where member_id = $1) as owed from members where id = $1",
        [id],
      );
      if (Number(rows[0]?.owed ?? 0) > 0) {
        throw new Error(
          `${rows[0].full_name} still owes the committee. Settle that first -- once he is marked as left, nothing more can be recorded against him.`,
        );
      }
      await client.query(
        "update members set is_active = false, left_on = current_date where id = $1",
        [id],
      );
    });
  } catch (error) {
    return fail(describeError(error, "Could not mark that member as left."));
  }

  revalidatePath("/", "layout");
  return ok("Marked as left. His history stays on the books.");
}

/* ------------------------------------------------------------- settings -- */

export async function updateSettingsAction(_prev, formData) {
  const contribution = number(formData, "contribution_amount");
  const term = integer(formData, "repayment_term_months");
  const maxPayout = number(formData, "max_payout_amount");
  const buffer = number(formData, "safety_buffer");
  const horizon = integer(formData, "projection_horizon_months");

  if (!contribution || contribution <= 0) return fail("Enter the monthly contribution.");
  if (!term || term < 1) return fail("Enter how many months a withdrawal is repaid over.");
  if (!maxPayout || maxPayout <= 0) return fail("Enter the agreed withdrawal amount.");
  if (buffer === null || buffer < 0) return fail("Enter the cushion the account should never drop below.");

  try {
    await asManager((client) =>
      client.query(
        `update committee_settings
            set contribution_amount = $1, repayment_term_months = $2,
                max_payout_amount = $3, safety_buffer = $4, projection_horizon_months = $5
          where id = 1`,
        [contribution, term, maxPayout, buffer, horizon ?? 36],
      ),
    );
  } catch (error) {
    return fail(describeError(error, "Could not save the settings."));
  }

  revalidatePath("/", "layout");
  return ok("Saved. Everything already recorded keeps the terms it was recorded under.");
}

/* --------------------------------------------------------------- logins -- */

export async function createUserAction(_prev, formData) {
  const username = text(formData, "username");
  const fullName = text(formData, "full_name");
  const password = String(formData.get("password") ?? "");
  const role = text(formData, "role") === "manager" ? "manager" : "viewer";

  if (!username || !fullName) return fail("Enter a name and a username.");

  try {
    await requireManager();
    await asManager((client) =>
      client.query("select create_user($1, $2, $3, $4)", [username, fullName, password, role]),
    );
  } catch (error) {
    return fail(describeError(error, "Could not create that login."));
  }

  revalidatePath("/settings");
  return ok(`${fullName} can now sign in${role === "viewer" ? " and look at the books" : " with full control"}.`);
}

export async function changePasswordAction(_prev, formData) {
  const user = await getSessionUser();
  if (!user) return fail("Sign in first.");

  const oldPassword = String(formData.get("old_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (newPassword !== confirm) return fail("The two new passwords do not match.");

  try {
    await asUser((client) =>
      client.query("select change_password($1, $2, $3)", [user.id, oldPassword, newPassword]),
    );
  } catch (error) {
    return fail(describeError(error, "Could not change the password."));
  }

  return ok("Password changed.");
}

export async function resetPasswordAction(_prev, formData) {
  const userId = text(formData, "user_id");
  const newPassword = String(formData.get("new_password") ?? "");

  try {
    await asManager((client) =>
      client.query("select reset_password($1, $2)", [userId, newPassword]),
    );
  } catch (error) {
    return fail(describeError(error, "Could not reset that password."));
  }

  revalidatePath("/settings");
  return ok("Password reset. Tell them the new one.");
}

export async function setUserActiveAction(_prev, formData) {
  const userId = text(formData, "user_id");
  const active = formData.get("is_active") === "true";

  try {
    const me = await requireManager();
    if (me.id === userId && !active) {
      return fail("You cannot switch off your own login -- there would be no way back in.");
    }
    await asManager((client) =>
      client.query("update users set is_active = $2 where id = $1", [userId, active]),
    );
  } catch (error) {
    return fail(describeError(error, "Could not change that login."));
  }

  revalidatePath("/settings");
  return ok(active ? "Login switched back on." : "Login switched off.");
}
