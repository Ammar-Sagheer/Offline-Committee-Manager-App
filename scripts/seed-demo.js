#!/usr/bin/env node
/**
 * Fill the development database with a committee that looks like a real one.
 *
 * Not fixtures for a test -- data to LOOK at. Lorem ipsum hides exactly the
 * bugs worth finding, so this uses long names, seven-figure sums, a member who
 * has missed a month, a member repaying two withdrawals at once, an
 * over-payment, and a reversed entry. Every one of those has a different shape
 * on screen and at least one of them will break a layout.
 *
 *   node scripts/dev-db.js      (leave running)
 *   node scripts/seed-demo.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envFile = path.join(root, '.env.local');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach((line) => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  });
}

const { Client } = require('pg');

const MEMBERS = [
  'Muhammad Arshad',
  'Abdul Rehman Qureshi',
  'Muhammad Iqbal Hussain',
  'Naveed Akhtar',
  'Tariq Mehmood Chaudhry',
  'Shahid Iqbal',
  'Zulfiqar Ali Bhatti',
  'Kamran Yousaf',
  'Rashid Minhas',
  'Bilal Ahmed Sheikh',
];

(async () => {
  const db = new Client({
    host: process.env.PGHOST, port: process.env.PGPORT, database: process.env.PGDATABASE,
    user: process.env.PGUSER, password: process.env.PGPASSWORD,
  });
  await db.connect();
  const q = (sql, params) => db.query(sql, params).then((r) => r.rows);

  const [{ exists }] = await q('select exists (select 1 from members) as exists');
  if (exists) {
    console.log('\n  Already seeded. Delete .devdata/ and start the database again for a fresh one.\n');
    await db.end();
    return;
  }

  await q('select create_user($1, $2, $3, $4)', ['arshad', 'Muhammad Arshad', 'committee2026', 'manager']);
  await q('select create_user($1, $2, $3, $4)', ['ammar', 'Ammar Sagheer', 'viewer2026', 'viewer']);

  // Thirteen months collected, month 14 open -- the real starting position.
  await q('select bootstrap_committee($1, $2, $3, $4, $5, $6, $7)', [
    MEMBERS, '2025-05-01', 13, 4000, 15, 145000, 50000,
  ]);
  console.log('  13 months of history for 10 members');

  const members = await q('select id, full_name from members order by display_order');
  const byName = (name) => members.find((m) => m.full_name.startsWith(name)).id;
  const all = members.map((m) => m.id);

  const contributions = async (ids) => {
    for (const id of ids) await q('select record_contribution($1)', [id]);
  };

  // --- month 14: the first hand-over, at what the app says is affordable ----
  await q('select record_payout($1, $2)', [byName('Abdul Rehman'), 124000]);
  await contributions(all);
  await q('select close_cycle(14)');
  console.log('  month 14: Abdul Rehman took Rs 124,000');

  // --- month 15: one installment, and one man paying well over it ----------
  await q('select record_payout($1, $2)', [byName('Muhammad Iqbal'), 124000]);
  await contributions(all);
  await q('select record_repayment($1, $2, null, null, $3)',
    [byName('Abdul Rehman'), 20000, 'Paid extra to finish sooner']);
  await q('select close_cycle(15)');
  console.log('  month 15: Muhammad Iqbal took Rs 124,000; Abdul Rehman over-paid');

  // --- month 16: still open, deliberately half-finished --------------------
  // Two members have not paid yet and nobody has been given the committee, so
  // every "not done yet" state on the month screen has something in it.
  await contributions(all.slice(0, 8));
  await q('select record_repayment($1, $2)', [byName('Abdul Rehman'), 8267]);
  await q('select record_repayment($1, $2)', [byName('Muhammad Iqbal'), 8267]);

  // A mistake and its correction, so the reversal path has actually been
  // walked and both halves of a cancelled pair are on screen somewhere.
  const [slip] = await q(
    `select id from ledger_entries
      where member_id = $1 and cycle_no = current_cycle_no() and entry_type = 'contribution'`,
    [byName('Naveed')],
  );
  if (slip) {
    await q('select reverse_entry($1, $2)', [slip.id, 'Recorded against the wrong member']);
    await q("select record_contribution($1, null, null, null, 'Re-recorded correctly')",
      [byName('Naveed')]);
  }

  const [state] = await q(`
    select fund_balance() as balance, max_safe_payout() as safe,
           (select count(*) from ledger_entries) as entries
  `);

  console.log('  month 16: open, 8 of 10 paid, nobody has taken it yet');
  console.log('');
  console.log(`  Balance    Rs ${Number(state.balance).toLocaleString()}`);
  console.log(`  Safe now   Rs ${Number(state.safe).toLocaleString()} a month`);
  console.log(`  Entries    ${state.entries}`);
  console.log('');
  console.log('  Sign in as  arshad / committee2026   (manager)');
  console.log('          or  ammar  / viewer2026      (read-only)');
  console.log('');

  await db.end();
})().catch((error) => {
  console.error('\n  Seeding failed:\n ', error.message, '\n');
  process.exit(1);
});
