"use client";

import { useActionState, useState } from "react";
import { recordPayoutAction } from "@/app/_lib/actions";
import Field, { MoneyInput } from "@/app/_components/ui/Field";
import FormMessage from "@/app/_components/ui/FormMessage";
import SubmitButton from "@/app/_components/ui/SubmitButton";
import Icon from "@/app/_components/ui/Icon";
import { money } from "@/app/_lib/format-helpers";
import { today } from "@/app/_lib/date-helpers";

/**
 * The month's one big decision: who gets the committee, and how much.
 *
 * The override box does not exist until the database has actually refused
 * something. That ordering is the whole design: a manager cannot push past a
 * solvency refusal without first being told, in a sentence, exactly what he is
 * pushing past -- which month the account runs down to what, and what it could
 * afford instead. Then the reason he types is kept on the entry for good and
 * reprinted on the month's summary for the other nine to read.
 *
 * Overdrawing is a different matter and no box appears for it, because the
 * money is simply not in the account.
 */
export default function PayoutCard({
  members, cycleNo, suggested, maxSafe, ceiling, term, contribution, disabled,
}) {
  const [state, formAction] = useActionState(recordPayoutAction, null);
  const [amount, setAmount] = useState(String(Math.round(Math.min(maxSafe || ceiling, ceiling))));
  const [memberId, setMemberId] = useState(suggested?.id ?? "");
  const [override, setOverride] = useState("");

  const typed = Number(String(amount).replace(/[,\s]/g, "")) || 0;
  const refused = state?.ok === false && state?.refused;
  const overdrawn = refused && /cannot be overridden/i.test(state.message);
  const canOverride = refused && !overdrawn;

  const chosen = members.find((m) => m.id === memberId);

  return (
    <form action={formAction} className="card overflow-hidden">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-lg">Give this month&rsquo;s committee</h2>
        <p className="mt-1 text-base text-text-light">
          The account can afford <span className="num font-medium">{money(maxSafe)}</span> a month
          on its present course
          {maxSafe < ceiling ? (
            <>
              {" "}— below the agreed <span className="num">{money(ceiling)}</span>
            </>
          ) : null}
          .
        </p>
      </div>

      <div className="grid gap-5 px-6 py-5 md:grid-cols-2">
        <Field label="Who is getting it" name="member_id" required>
          <select
            id="member_id"
            name="member_id"
            required
            value={memberId}
            onChange={(event) => setMemberId(event.target.value)}
            className="input"
            disabled={disabled}
          >
            <option value="">Choose a member…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
                {m.turns_taken === 0 ? " — never taken it" : ` — last took it in month ${m.last_payout_cycle}`}
                {m.outstanding > 0 ? `, still owes ${money(m.outstanding)}` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="How much" name="amount" required>
          <MoneyInput
            name="amount"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={disabled}
          />
        </Field>

        <div className="md:col-span-2 -mt-2 flex flex-wrap gap-2">
          {[
            { value: maxSafe, label: "Most it can afford" },
            { value: ceiling, label: "The agreed amount" },
            { value: Math.round(ceiling * 0.75 / 500) * 500, label: "Three quarters" },
            { value: Math.round(ceiling * 0.5 / 500) * 500, label: "Half" },
          ]
            .filter((o) => o.value > 0)
            .filter((o, i, all) => all.findIndex((x) => x.value === o.value) === i)
            .map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setAmount(String(Math.round(option.value)))}
                disabled={disabled}
                className={`btn px-3 py-1.5 text-sm ${
                  typed === Math.round(option.value) ? "border-primary bg-primary-soft text-primary" : ""
                }`}
              >
                {option.label} · <span className="num">{money(option.value)}</span>
              </button>
            ))}
        </div>

        <Field label="Date handed over" name="entry_date" type="date" defaultValue={today()} disabled={disabled} />
        <Field label="Note" name="note" placeholder="Optional" disabled={disabled} />
        <input type="hidden" name="cycle_no" value={cycleNo} />

        {typed > 0 && chosen ? (
          <p className="md:col-span-2 flex items-start gap-2 rounded-xl bg-surface-alt px-4 py-3 text-base">
            <Icon name="info" className="mt-0.5 size-5 shrink-0 text-text-light" />
            <span>
              {chosen.full_name} would repay{" "}
              <span className="num font-semibold">{money(typed / term)}</span> a
              month for {term} months, on top of his{" "}
              <span className="num">{money(contribution)}</span> contribution — so{" "}
              <span className="num font-semibold">{money(typed / term + contribution)}</span>{" "}
              a month in total. He can pay more than that whenever he likes, and finish sooner.
            </span>
          </p>
        ) : null}
      </div>

      {refused ? (
        <div className="border-t border-border bg-danger-soft px-6 py-5">
          <p className="flex items-start gap-2 text-base text-danger">
            <Icon name={overdrawn ? "blocked" : "warning"} className="mt-0.5 size-5 shrink-0" />
            <span>{state.message}</span>
          </p>

          {canOverride ? (
            <div className="mt-4">
              <label htmlFor="override_reason" className="label text-danger">
                To go ahead anyway, say why
              </label>
              <textarea
                id="override_reason"
                name="override_reason"
                rows={2}
                value={override}
                onChange={(event) => setOverride(event.target.value)}
                placeholder="e.g. Members voted on 12 Aug to keep the amount at 145,000 this month"
                className="input"
              />
              <p className="hint text-danger">
                This is kept on the entry permanently and printed on the month&rsquo;s summary, so
                the other members can see it was a decision and not a slip.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {state?.ok ? <FormMessage state={state} className="mx-6 mb-5" /> : null}

      <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-alt px-6 py-4">
        <p className="text-sm text-text-light">
          {disabled
            ? "This month's committee has already been given out."
            : "Nothing is recorded until you press this."}
        </p>
        <SubmitButton
          disabled={disabled || (canOverride && override.trim().length < 5)}
          pendingLabel="Recording…"
          variant={canOverride ? "danger" : "primary"}
        >
          {canOverride ? "Record it anyway" : "Record the withdrawal"}
        </SubmitButton>
      </div>
    </form>
  );
}
