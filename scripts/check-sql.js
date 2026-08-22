#!/usr/bin/env node
/**
 * Exercise the schema against a real, throwaway Postgres cluster.
 *
 * Everything worth trusting in this app is a trigger or a PL/pgSQL function,
 * so this is the test suite that matters. It checks that the rules REFUSE, not
 * just that the happy path works -- a money rule nobody has tried to break is
 * a money rule nobody has tested.
 *
 *   node scripts/check-sql.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'committee-check-'));
// mkdtemp gives 0700. When this runs as root, embedded-postgres creates a
// `postgres` OS user and runs initdb as it -- which then cannot traverse into
// a root-only directory. Never the case on the Windows laptop this ships to,
// but it is the difference between the checks running here and not.
fs.chmodSync(dir, 0o755);
process.env.APP_DATA_DIR = dir;

const { Client } = require('pg');
const { bootstrapDatabase } = require('../electron/bootstrap-db');

let passed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(`${label}${detail ? ` -- ${detail}` : ''}`);
    console.log(`  FAIL  ${label}${detail ? `  (${detail})` : ''}`);
  }
}

function near(a, b, tolerance = 1) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

/** Runs `fn`, returns the error message, or null if it unexpectedly succeeded. */
async function refuses(fn) {
  try {
    await fn();
    return null;
  } catch (error) {
    return error.message;
  }
}

const MEMBERS = [
  'Muhammad Arshad', 'Abdul Rehman', 'Iqbal Hussain', 'Naveed Akhtar', 'Tariq Mehmood',
  'Shahid Iqbal', 'Zulfiqar Ali', 'Kamran Yousaf', 'Rashid Minhas', 'Bilal Ahmed',
];

(async () => {
  console.log('\nStarting a throwaway database...');
  const { env, stop } = await bootstrapDatabase({ log: () => {} });

  const db = new Client({
    host: env.PGHOST, port: env.PGPORT, database: env.PGDATABASE,
    user: env.PGUSER, password: env.PGPASSWORD,
  });
  await db.connect();
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const one = async (sql, params) => (await q(sql, params))[0];

  console.log('\nSetting the committee up the way Arshad\'s really is:\n');

  await q('select bootstrap_committee($1, $2, $3, $4, $5, $6, $7)', [
    MEMBERS, '2025-07-01', 13, 4000, 15, 145000, 50000,
  ]);

  // ---- the state it should be in --------------------------------------
  const bal = Number((await one('select fund_balance() as v')).v);
  check('13 months x 10 members x Rs 4,000 = Rs 520,000 in the account', bal === 520000, `got ${bal}`);

  const cyc = Number((await one('select current_cycle_no() as v')).v);
  check('the month now in progress is number 14', cyc === 14, `got ${cyc}`);

  const closed = Number((await one("select count(*) as v from cycles where status='closed'")).v);
  check('the 13 collected months are locked', closed === 13, `got ${closed}`);

  const pos = await q('select * from member_positions()');
  check('all ten members are on the books', pos.length === 10, `got ${pos.length}`);
  check('each has contributed Rs 52,000', pos.every((p) => Number(p.contributed) === 52000));
  check('nobody owes anything yet', pos.every((p) => Number(p.outstanding) === 0));

  const equitySum = pos.reduce((t, p) => t + Number(p.equity), 0);
  check('members\' equity adds up to exactly the bank balance', equitySum === bal,
    `equity ${equitySum} vs bank ${bal}`);

  // ---- the projection --------------------------------------------------
  console.log('');
  const sim = await q('select * from simulate_fund(30, 145000, 145000)');
  check('month 14 closes at Rs 415,000 if Rs 145,000 goes out', near(sim[0].closing, 415000),
    `got ${sim[0].closing}`);
  check('month 15 takes in the first Rs 9,666.67 installment', near(sim[1].repayments, 9666.67, 0.02),
    `got ${sim[1].repayments}`);
  const firstNegative = sim.find((r) => Number(r.closing) < 0);
  check('at Rs 145,000 a month the fund goes negative in month 20',
    firstNegative && firstNegative.cycle_no === 20, `got ${firstNegative && firstNegative.cycle_no}`);

  const maxSafe = Number((await one('select max_safe_payout() as v')).v);
  check('the largest sustainable payout is Rs 124,000', maxSafe === 124000, `got ${maxSafe}`);

  const safeSim = await q('select min(closing) as lowest from simulate_fund(36, 124000, 124000)');
  check('at Rs 124,000 the fund never drops below its Rs 50,000 cushion',
    Number(safeSim[0].lowest) >= 50000, `lowest ${safeSim[0].lowest}`);

  // ---- the levers ------------------------------------------------------
  const levers = await one('select * from payout_levers()');
  check('the agreed Rs 145,000 is reported as unaffordable', levers.is_affordable === false);
  check('...short by Rs 21,000 a month', near(levers.shortfall, 21000), `got ${levers.shortfall}`);
  // The term lever is checked on its BOUNDARY rather than against a number
  // copied out of this file, because the boundary is what the answer means:
  // 10 months holds the cushion (trough Rs 86,000), 11 misses it by Rs 909
  // (trough Rs 49,091 against a Rs 50,000 floor). Asserting both sides proves
  // the search found the real edge and not merely a safe-looking value.
  check('...and repaying over 10 months would fix it on its own', levers.needed_term === 10,
    `got ${levers.needed_term}`);
  check('...10 months really does hold the cushion',
    (await one('select terms_are_safe(145000, null, 10) as v')).v === true);
  check('...11 months really does not -- the search found the true edge',
    (await one('select terms_are_safe(145000, null, 11) as v')).v === false);

  check('...or raising everyone to Rs 5,450 a month', near(levers.needed_contribution, 5450),
    `got ${levers.needed_contribution}`);
  check('...which really does hold the cushion',
    (await one('select terms_are_safe(145000, 5450, null) as v')).v === true);
  check('...and Rs 50 less really does not',
    (await one('select terms_are_safe(145000, 5400, null) as v')).v === false);

  check('the fund grows Rs 40,000 a month once past the ramp',
    near(levers.growth_after_ramp, 40000), `got ${levers.growth_after_ramp}`);

  // ---- the refusals ----------------------------------------------------
  console.log('');
  const arshad = pos.find((p) => p.full_name === 'Muhammad Arshad');
  const rehman = pos.find((p) => p.full_name === 'Abdul Rehman');

  let msg = await refuses(() => q('select record_payout($1, $2)', [rehman.id, 145000]));
  check('Rs 145,000 is refused as unsafe', msg !== null);
  check('...and the refusal names the month it runs dry', msg && /2026|2027/.test(msg), msg);
  check('...and states the most it can afford', msg && msg.includes('124,000'), msg);

  msg = await refuses(() => q('select record_payout($1, $2)', [rehman.id, 900000]));
  check('a payout larger than the account holds is refused outright', msg !== null);
  check('...and says plainly it cannot be overridden',
    msg && msg.includes('cannot be overridden'), msg);

  msg = await refuses(() => q(
    'select record_payout($1, $2, null, null, null, null, $3)',
    [rehman.id, 900000, 'Arshad says the members agreed'],
  ));
  check('...and an override does not get past it either', msg !== null, msg);

  // ---- the override ----------------------------------------------------
  console.log('');
  const overridden = await one(
    'select record_payout($1, $2, null, null, null, null, $3) as id',
    [rehman.id, 145000, 'Members voted on 12 Aug to keep 145,000 this month'],
  );
  check('with a written reason, Rs 145,000 goes through', Boolean(overridden.id));

  const stored = await one('select override_reason from ledger_entries where id = $1', [overridden.id]);
  check('...and the reason is kept on the entry for the record',
    stored.override_reason.includes('12 Aug'), stored.override_reason);

  msg = await refuses(() => q('select record_payout($1, $2)', [arshad.id, 100000]));
  check('a second payout in the same month is refused', msg !== null);
  check('...and names who already has it', msg && msg.includes('Abdul Rehman'), msg);

  await q('select reverse_entry($1, $2)', [overridden.id, 'Recorded against the wrong person']);
  check('the reversed withdrawal is marked void, not left half-alive',
    (await one("select status, outstanding from loan_positions where member_id = $1", [rehman.id])).status === 'void');
  check('after reversing it, the balance is back to Rs 520,000',
    Number((await one('select fund_balance() as v')).v) === 520000);
  check('...and the month is free for the right person again',
    Number((await one("select count(*) as v from ledger_entries where cycle_no=14 and entry_type='payout' and reverses_entry_id is null and reversed_by_entry_id is null")).v) === 0);

  // ---- a real month ----------------------------------------------------
  console.log('');
  const payout = await one('select record_payout($1, $2) as id', [rehman.id, 124000]);
  check('Rs 124,000 to Abdul Rehman is accepted with no argument', Boolean(payout.id));

  const loan = await one("select * from loan_positions where member_id = $1 and status = 'active'", [rehman.id]);
  check('his installment is Rs 8,266.67 a month', near(loan.installment, 8266.67, 0.01), `got ${loan.installment}`);
  check('with 15 months to run', loan.months_remaining === 15, `got ${loan.months_remaining}`);

  for (const m of pos) await q('select record_contribution($1)', [m.id]);
  check('all ten contributions for month 14 recorded',
    Number((await one('select count(*) as v from ledger_entries where cycle_no=14 and entry_type=$1', ['contribution'])).v) === 10);

  msg = await refuses(() => q('select record_contribution($1)', [rehman.id]));
  check('marking the same person paid twice in a month is refused', msg !== null);
  check('...and says who', msg && msg.includes('Abdul Rehman'), msg);

  check('the account now holds Rs 436,000',
    Number((await one('select fund_balance() as v')).v) === 436000,
    `got ${(await one('select fund_balance() as v')).v}`);

  // ---- repayment, and paying extra -------------------------------------
  console.log('');
  await q('select close_cycle(14)');
  check('closing month 14 opens month 15',
    Number((await one('select current_cycle_no() as v')).v) === 15);

  msg = await refuses(() => q('select record_contribution($1, 14)', [arshad.id]));
  check('nothing can be posted into a closed month', msg !== null);
  check('...and it says to reopen it first', msg && msg.includes('Reopen'), msg);

  msg = await refuses(() => q('select record_repayment($1, $2)', [rehman.id, 500000]));
  check('repaying more than is owed is refused', msg !== null);
  check('...and states the exact figure owed', msg && msg.includes('124,000'), msg);

  await q('select record_repayment($1, $2)', [rehman.id, 20000]);
  const after = await one("select * from loan_positions where member_id = $1 and status = 'active'", [rehman.id]);
  check('paying Rs 20,000 instead of Rs 8,266.67 leaves Rs 104,000 owing',
    near(after.outstanding, 104000), `got ${after.outstanding}`);
  check('...the installment does NOT change', near(after.installment, 8266.67, 0.01), `got ${after.installment}`);
  check('...the committee just finishes 2 months earlier', after.months_remaining === 13,
    `got ${after.months_remaining}`);

  // ---- the projection must not lose a month of repayments --------------
  console.log('');
  const safeIn15 = Number((await one('select max_safe_payout() as v')).v);
  check('having taken Rs 124,000 in month 14 does not make month 15 unaffordable',
    safeIn15 >= 124000, `month 15 allows only ${safeIn15}`);

  const step1 = (await q('select * from simulate_fund(6, 124000, 124000)'))[0];
  check('...because the installment still due this month is counted in this month',
    near(step1.repayments, 8266.67 - 20000 > 0 ? 8266.67 - 20000 : 0, 0.02),
    `step 1 repayments ${step1.repayments}`);

  // ---- the ledger cannot be rewritten ----------------------------------
  console.log('');
  msg = await refuses(() => q('delete from ledger_entries where entry_type = $1', ['contribution']));
  check('ledger rows cannot be deleted', msg !== null);
  // Two independent fences stop this, and the GRANT is the outer one, so its
  // message is what comes back. The trigger below it is what protects the
  // superuser path that migrations and restores run on.
  check('...refused by the grant before the trigger is even reached',
    msg && msg.includes('permission denied'), msg);

  msg = await refuses(() => q('update ledger_entries set amount = 1 where entry_type = $1', ['contribution']));
  check('ledger rows cannot be edited', msg !== null);

  // ---- the identity that must never break ------------------------------
  const finalPos = await q('select * from member_positions()');
  const finalEquity = finalPos.reduce((t, p) => t + Number(p.equity), 0);
  const finalBal = Number((await one('select fund_balance() as v')).v);
  check('after all of that, equity still adds up to the bank balance exactly',
    near(finalEquity, finalBal, 0.001), `equity ${finalEquity} vs bank ${finalBal}`);

  const owed = Number((await one('select coalesce(sum(outstanding),0) as v from loan_positions')).v);
  const contributed = finalPos.reduce((t, p) => t + Number(p.contributed), 0);
  check('and contributions minus what is owed equals the bank balance',
    near(contributed - owed, finalBal, 0.001), `${contributed} - ${owed} vs ${finalBal}`);

  // ---- logins ----------------------------------------------------------
  console.log('');
  check('a fresh install knows it has nobody to sign in as',
    (await one('select any_users_exist() as v')).v === false);

  await q('select create_user($1, $2, $3, $4)', ['arshad', 'Muhammad Arshad', 'committee2026', 'viewer']);
  const firstUser = await one('select role from users limit 1');
  check('the first account is forced to be the manager', firstUser.role === 'manager', firstUser.role);

  const good = await q('select * from authenticate($1, $2)', ['ARSHAD', 'committee2026']);
  check('signing in works and is not fussy about capitals', good.length === 1);
  const bad = await q('select * from authenticate($1, $2)', ['arshad', 'wrong']);
  check('a wrong password gets nothing back', bad.length === 0);

  await db.end();
  await stop();
  fs.rmSync(dir, { recursive: true, force: true });

  console.log(`\n${passed} checks passed, ${failures.length} failed.\n`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  - ${f}`));
    console.log('');
    process.exit(1);
  }
})().catch(async (error) => {
  console.error('\nCheck run blew up:\n', error);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(1);
});
