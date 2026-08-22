import "server-only";
import { query, queryOne } from "./db";

/**
 * Every read in the app.
 *
 * A query written inline in a page is one nobody finds when the schema changes,
 * and when a figure looks wrong there needs to be exactly one file to search.
 *
 * Almost everything here calls a Postgres function rather than assembling a
 * query, because anything that adds numbers up belongs in the database: two
 * screens computing the same total from the same rows will eventually disagree.
 */

/* ---------------------------------------------------------------- setup -- */

export async function getSetupState() {
  const row = await queryOne(`
    select
      any_users_exist()                              as has_user,
      exists (select 1 from members)                 as has_members,
      exists (select 1 from committee_settings)      as has_settings
  `);
  return {
    hasUser: Boolean(row?.has_user),
    hasMembers: Boolean(row?.has_members),
    hasSettings: Boolean(row?.has_settings),
    isReady: Boolean(row?.has_user && row?.has_members && row?.has_settings),
  };
}

export async function getSettings() {
  return queryOne("select * from committee_settings where id = 1");
}

export async function getSettingsHistory(limit = 30) {
  return query(
    `select h.*, u.full_name as changed_by_name
       from settings_history h
       left join users u on u.id = h.changed_by
      order by h.changed_at desc
      limit $1`,
    [limit],
  );
}

/* ------------------------------------------------------------ dashboard -- */

export async function getDashboard() {
  return queryOne("select * from dashboard_summary()");
}

export async function getPayoutQueue() {
  return query("select * from payout_queue()");
}

/* -------------------------------------------------------------- members -- */

export async function getMemberPositions(cycleNo = null) {
  return query("select * from member_positions($1)", [cycleNo]);
}

export async function getMember(memberId) {
  return queryOne("select * from members where id = $1", [memberId]);
}

export async function getMemberPosition(memberId) {
  return queryOne("select * from member_positions() where id = $1", [memberId]);
}

export async function getMemberStatement(memberId) {
  return query("select * from member_statement($1)", [memberId]);
}

export async function getMemberLoans(memberId) {
  return query(
    `select lp.*, c.period_month
       from loan_positions lp
       join cycles c on c.cycle_no = lp.cycle_no
      where lp.member_id = $1 and lp.status <> 'void'
      order by lp.cycle_no desc`,
    [memberId],
  );
}

export async function getOpenLoans() {
  return query(
    `select lp.*, m.full_name, c.period_month
       from loan_positions lp
       join members m on m.id = lp.member_id
       join cycles  c on c.cycle_no = lp.cycle_no
      where lp.status = 'active' and lp.outstanding > 0
      order by lp.cycle_no`,
  );
}

/* --------------------------------------------------------------- months -- */

export async function getCurrentCycleNo() {
  const row = await queryOne("select current_cycle_no() as n");
  return row?.n ?? null;
}

export async function getCycle(cycleNo = null) {
  return queryOne("select * from cycle_summary($1)", [cycleNo]);
}

export async function getCycleHistory() {
  return query("select * from cycle_history()");
}

export async function getCycleEntries(cycleNo) {
  return query(
    `select e.*, m.full_name
       from ledger_entries e
       join members m on m.id = e.member_id
      where e.cycle_no = $1
      order by e.created_at desc`,
    [cycleNo],
  );
}

/* ----------------------------------------------------------- projection -- */

/**
 * The fund rolled forward month by month.
 *
 * `payout` is what is assumed to go out every month from here on. Passing a
 * different figure is how the projection screen answers "what if we lowered it
 * to 120,000" without writing anything down.
 */
export async function getProjection({ months = null, payout = null } = {}) {
  return query("select * from simulate_fund($1, $2)", [months, payout]);
}

export async function getMaxSafePayout(months = null) {
  const row = await queryOne("select max_safe_payout($1) as v", [months]);
  return row?.v ?? 0;
}

/**
 * What would have to change for the agreed withdrawal to be affordable.
 *
 * Three levers, each sized by simulating the committee under terms it does not
 * actually have: hand over less, repay faster, or contribute more. Any of them
 * can come back null, which honestly means that lever alone cannot get there.
 */
export async function getPayoutLevers() {
  return queryOne("select * from payout_levers()");
}

/** A projection under terms the committee has not agreed -- for the what-if screen. */
export async function getWhatIfProjection({ months = 36, payout, contribution = null, term = null }) {
  return query("select * from simulate_fund($1, $2, $2, $3, $4)", [months, payout, contribution, term]);
}

/** Everything needed to decide about one proposed withdrawal, in one round trip. */
export async function getPayoutSafety(amount) {
  return queryOne("select * from payout_safety($1)", [amount]);
}

/* --------------------------------------------------------------- logins -- */

export async function getUsers() {
  return query(
    "select id, username, full_name, role, is_active, created_at, last_login_at from users order by role, full_name",
  );
}
