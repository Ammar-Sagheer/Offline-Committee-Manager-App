# Committee Manager

An offline Windows desktop app for running a monthly committee. It installs like
a normal program, keeps its books in its own bundled Postgres, and never touches
the internet.

Built for Muhammad Arshad, who manages a committee of ten.

## What a committee is

Ten people each pay Rs 4,000 a month into a shared account. Each month the pot
is handed to one of them, in turn. The person who takes it repays it month by
month **on top of** his ordinary contribution, and when the rotation comes round
again he takes another. It runs indefinitely, until the members agree to wind it
up and divide what is left.

Two things make this one harder than it looks:

- **The repayment is flexible.** If a man's installment is Rs 8,266 he may pay
  Rs 20,000. That does not lower the installment — it ends the withdrawal
  sooner, which puts the money back in the account earlier.
- **The withdrawal is flexible.** He can take less than the agreed amount.

## The timing problem the app exists for

With ten members the turn comes round every ten months, but a withdrawal is
repaid over fifteen. So for the first year and a bit, full-size payouts go out
while the repayment stream behind them is still building up, and the savings
already banked have to cover the gap.

**This is invisible from the bank balance.** On the real figures — thirteen
months collected, Rs 520,000 in the account — handing over the agreed
Rs 145,000 a month empties it by month 20 and bottoms out at −103,333 around
month 24. Rs 124,000 holds. Half a million rupees looks like plenty right up to
the month it is not.

It is also temporary. Once every member is repaying more than one withdrawal at
a time, the repayments arriving each month add up to the whole payout going
out, and the account grows by the month's contributions — Rs 40,000 — whatever
the payout is. There is no permanent ceiling; there is only the ramp. So
"cannot afford this" and "cannot afford this yet" are different answers, and
the app says which one it means.

`max_safe_payout()` binary-searches the real month-by-month simulation for the
largest amount that never breaches the cushion. `payout_levers()` sizes the
three ways out: hand over less, repay faster, or everyone contributes more.

## What the database will not let you do

All of this is triggers, constraints and functions in `db/migrations/`, not
checks in the app. The error messages are written as sentences naming the
person and the figures, because they are what Arshad actually reads.

**The ledger is append-only.** No update, no delete, for anybody. A mistake is
corrected by writing the opposite entry; both stay visible and cancel out in
every total.

**A withdrawal larger than the account holds is refused outright**, and no
override gets past it. The money is not there.

**A withdrawal that would run the account below its cushion is refused too** —
but that one is policy rather than physics, so it goes through if the manager
types a reason. The reason is kept on the entry for good and reprinted on the
month's summary for the other nine to read.

**One payout a month, one contribution per member per month.** A second is a
typo, or something filed under the wrong heading.

**A repayment cannot exceed what is owed.** The message names the exact figure.

**Nothing posts into a closed month** until it is reopened.

## Two identities everything rests on

```
bank balance    = sum of every ledger row's fund_delta
member's stake  = what he has put in, less what he still owes
                = the same sum, filtered to his rows
```

So the members' stakes always add up to exactly the money in the account. That
is the figure divided up if the committee is ever wound up, and it cannot
drift, because it is not stored anywhere — it is one sum read two ways.
`check:sql` asserts it after every operation it performs.

A stake can be negative: a man who has taken Rs 124,000 out and put Rs 64,000
in has a stake of −Rs 31,733 until he repays.

## Running it

```bash
npm install
npm run db:dev        # terminal 1 — bundled Postgres in .devdata/, writes .env.local
npm run seed:demo     # optional, but do it — realistic data
npm run dev           # terminal 2 — http://127.0.0.1:34117
```

Then `arshad` / `committee2026`, or `ammar` / `viewer2026` for read-only.

Building the desktop app:

```bash
npm run build         # next build + copies static assets into .next/standalone
npm run dist          # electron-builder -> dist/
```

`npm run dist` has never been run — see `PROGRESS.md`.

## First run on a real machine

There is no dashboard anywhere to create the first account from, so the app
does it itself. `/setup` asks for the manager's login, the members' names, and
the committee's terms, then writes the months already collected as real
contributions rather than one opening figure — because "how much has Iqbal put
in" is a question that gets asked, and an opening balance cannot answer it.

## Backing up

Everything is in one folder: `%APPDATA%/Committee Manager` on Windows. Settings
prints the real path and has a button that copies it.

**Both halves travel together.** `db-data` is the books; `config.json` holds the
passwords that open them. Postgres keeps its role passwords inside the cluster
and that file is the only record of what they are, so a `db-data` folder
restored on its own is intact and unreachable. The backup writes a
`READ-ME-FIRST.txt` saying so.

A copy sitting beside the original is lost with the original. The point of the
USB stick is that it leaves the building.

After restoring, the logins are the ones from the backup — not whatever was set
up on the new machine.

## Layout

```
app/
  (app)/          dashboard, month, members, months, projection, settings
  print/          the sheets the other nine members actually see
  login/ setup/   outside the shell, because there is nobody signed in yet
  _components/ui/         knows nothing about committees
  _components/committee/  everything that does
  _lib/           db, auth, data-service, actions, helpers, siteConfig
db/migrations/    the rules
electron/         main process, database bootstrap, backup and restore
scripts/          dev database, demo seed, schema checks
```

## Who can do what

| | Manager | Viewer |
|---|---|---|
| See everything, print statements | yes | yes |
| Record contributions, payouts, repayments | yes | no |
| Reverse an entry, close or reopen a month | yes | no |
| Change the committee's terms | yes | no |
| Add logins, reset other people's passwords | yes | no |

A viewer login only works on this laptop — the app binds to `127.0.0.1` and
answers nowhere else. That is deliberate and is what makes it safe to run with
none of the usual protections. Row-level security is not used anywhere; see
migration 001 for why that is a decision rather than an oversight.
