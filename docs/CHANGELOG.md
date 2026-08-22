# Changelog

Newest first. The entries worth reading are the ones recording something tried
and reverted, or a bug whose cause was not where it looked.

## Where things stand

| | |
|---|---|
| Migrations | 001–012, all applied by `electron/bootstrap-db.js` on launch |
| Schema checks | 62, in `scripts/check-sql.js`, all passing |
| Screens | dashboard, month, members, member, months, month detail, projection, settings, login, setup, two print sheets |
| Verified by running | dev server in a browser at 1440/1024/400px; full Electron chain under a virtual display on Linux |
| Packaged | `npm run pack` builds `dist/linux-unpacked` and that binary runs: own Postgres, 12 migrations, spawned server, `/setup` served with styling |
| Never run | the NSIS installer (`npm run dist`), anything on Windows |

## 2026-08-22 — the packaging config was invalid, and an empty database

`electron-builder` was configured but never executed. Running it took one
attempt to prove that was a mistake: **`includeSubNodeModules` is not a valid
option in electron-builder 26** and the whole config is rejected before any
work starts, so `npm run dist` would have failed on the first try on the
client's machine.

The option came from the `nextjs-to-electron` skill, where it guards a real
failure: the old file walker treated any directory named `node_modules` as a
unit and silently dropped `.next/standalone/node_modules`, giving "Cannot find
module 'next'" from a build that succeeded. Version 26 rewrote the copier and
removed the option. Verified rather than assumed — the packaged tree has
`next`, `react`, `react-dom` and `styled-jsx` under
`.next/standalone/node_modules/`, and `.next/static` beside them.

Then the packaged binary itself was launched: bundled Postgres started, all 12
migrations applied, the standalone server spawned from the packaged tree, and
`/setup` rendered with its stylesheet. 128MB of app, 440MB with Electron.

Two scripts added. `npm run pack` builds the unpacked app without an installer,
which separates "the app works" from "the installer works" — they fail for
different reasons and the unpacked one is far quicker to iterate on.
`npm run db:reset` deletes `.devdata/` and `.env.local`, stopping Postgres
first, because a cluster killed mid-write may not start again and Windows will
not delete a folder with open handles in it.

The development database was emptied. Nothing was needed in the repo for that —
no migration has ever contained seed data, so a clone has nothing in it and the
app goes `/` → `/login` → `/setup`. `npm run seed:demo` stays opt-in.

## 2026-08-22 — whole rupees (migration 012)

Asked for: no paisa anywhere on screen.

The obvious way to do that is to round in the formatter, and it is the wrong
way. Ten rows each rounded to the rupee do not add up to the rounded total, and
this is an app whose entire job is figures that add up — the members' stakes
summing to exactly the bank balance is the invariant everything else rests on.

So the rounding moved to the source. `record_payout`, `record_contribution` and
`record_repayment` round what they are given, the installment is `ceil` rather
than `round` at issue time, and a check constraint keeps every ledger amount
and every installment whole. Dropping the paisa on screen is then not a
rounding at all.

`ceil`, not `round`, because rounding down leaves a few rupees outstanding
after the final payment and a withdrawal that will not close is worse than a
last installment a few rupees short. The last payment is
`least(installment, outstanding)`, so it absorbs the difference on its own:
Rs 145,000 over 15 months is 9,667 × 14 then 9,662.

Adding the constraint meant updating existing rows, which the append-only
trigger forbids. The migration lifts `ledger_no_update` for exactly those two
statements and puts it back. That is a schema migration running as superuser,
not the application reaching around its own rule — worth being explicit about,
because it is the only place in the repo that touches that trigger.

`scripts/check-sql.js` also gained its own port. The startup guard added the
same day refuses a port collision rather than hanging on it, which is right,
and meant the checks could not run while `npm run db:dev` was up.

## 2026-08-22 — the app

Next.js App Router, plain JavaScript, Tailwind v4, following the house
structure with the offline substitutions: `db.js` and `auth.js` in place of the
three Supabase clients, `proxy.js` checking a signed `iron-session` cookie
rather than refreshing a Supabase one.

**Three bugs the screenshots found that the build did not.**

`sr-only` dragged the whole page sideways. Tailwind's `sr-only` is
`position: absolute`, and an absolutely positioned element is clipped by an
overflow ancestor only when its *containing block* is inside that ancestor.
With nothing positioned in between, the containing block was the viewport — so
a screen-reader note in the far-right column of a 992px-wide table sat at
x=728 on a 400px screen and made the document 729px wide. Every visible thing
was clipped correctly; the one invisible thing was not. Fixed by making
`.table-wrap` `relative`, which is why that class carries a comment saying the
`relative` is load-bearing.

Worth knowing how it was found: `document.body.scrollWidth` said 400 and
`documentElement.scrollWidth` said 729. The honest test is
`window.scrollTo(9999, 0)` and reading `window.scrollX` back.

Money wrapped after the "Rs" in the dashboard cards. `.stat-value` now holds
one line and the stat grids use container queries, so the *layout* gives way
rather than the figure. Container queries and not breakpoints because with a
16rem sidebar the viewport width and the content width are different numbers.

The page header's action buttons were `shrink-0`, so two of them pushed the
page 29px wider than a phone screen.

**The override box does not exist until the database has refused.** It would
have been simpler to put a "reason" field on the payout form permanently. It is
deliberately not there: the ordering is what forces the manager to read which
month the account runs down to what, and what it could afford instead, before
he can type past it. Overdrawing gets no box at all, because no reason makes
the money exist.

**Recharts, one axis, two scenarios.** The two lines are the same measure under
different assumptions, so they share a scale. The categorical pair (`#0d9488`,
`#c2410c`) was chosen by running a contrast validator rather than by eye:
ΔE 13.7 under deuteranopia, 27.1 with normal vision, both above 3:1 on white.
The first pair tried — the app's own teal `#0d5c63` with amber — failed the
chroma floor and would have read as grey.

## 2026-08-22 — the projection was losing a month of repayments (migration 011)

**Symptom:** the app allowed Rs 124,000 in month 14 and then refused the same
amount in month 15, with nothing having changed except that a withdrawal now
existed. It surfaced while seeding demo data, which is the argument for demo
data that walks several months forward rather than sitting on a fresh install.

**Cause:** `simulate_fund` scheduled every outstanding withdrawal's remaining
installments from step 2 rather than step 1, on the reasoning that anything
paid during the month in progress is already in the opening balance. That is
true of what has been *paid*. It is not true of what is still to come — and
pushing the whole remaining schedule back a month is not one month of caution,
it is one month of caution per withdrawal on the books, compounding as members
start carrying two at once.

Contributions were always handled correctly here: step 1 counts only the ones
still to come in. The fix makes repayments match — what is still due this month
on each withdrawal falls in step 1, the rest runs on from step 2.

## 2026-08-22 — the app hung forever if the port was taken

Found by running the whole Electron chain under a virtual display while the dev
database was still up. `embedded-postgres` waits for a "ready to accept
connections" line that a Postgres which could not bind never prints, so the app
waited indefinitely: no window, no error, nothing on screen. That is the worst
failure this app can have, because there is nothing for the person in front of
it to report.

Now the port is checked before starting, with a message naming the likely cause
(a second copy already open), and `pg.start()` is bounded at 90 seconds.

`onLog`/`onError` from `embedded-postgres` now go to the same log file as
everything else. They were being swallowed, and a database that will not start
is exactly the failure with nothing else to go on.

## 2026-08-22 — schema, solvency engine, money rules (migrations 001–010)

**One ledger table** carries contributions, payouts, repayments and
corrections. That is what makes thirteen months of history, a flexible
over-payment and a reduced withdrawal the same mechanism instead of three
special cases.

`fund_delta` is a stored generated column, signed from the fund's point of
view, and every total in the app is a sum of it. `amount` itself is always
positive: a negative "contribution" would be unreadable on a printed statement,
which is where these rows are finally checked by ten people.

**A reversal is a row, not an edit.** The reversal carries `entry_sign = -1`
and points at the original; the original is stamped with
`reversed_by_entry_id`. Both stay and cancel out in every sum, so no query has
to remember to filter them. The one exception to append-only is stamping that
single column, and only from null.

**Two-tier refusal on payouts.** Overdrawing is physics and cannot be
overridden. Exceeding the agreed ceiling, or setting a course that breaches the
cushion, is policy and goes through with a written reason. Collapsing these
into one rule was considered and rejected: an override that can conjure money
out of an empty account is not an override, it is a bug with a text box.

**A first attempt at the sustainable payout used a closed form** —
`n·c·T/(T−n)`, the steady-state answer — and it was wrong. In steady state each
member is repaying `T/n` overlapping withdrawals, so the aggregate repayments
equal the whole payout and the fund grows by `n·c` a month *whatever* the
payout is. There is no permanent cap. The binding constraint is the trough
during the ramp-up, which no closed form sees. `max_safe_payout()` binary-
searches the real simulation instead, and `payout_levers()` returns
`growth_after_ramp` rather than a fictional ceiling.

The same mistake was nearly baked into the tests: they asserted a 14-month term
and a Rs 4,850 contribution, both from the closed form. The real answers are 10
months and Rs 5,450. The tests now check the *boundary* — 10 months holds the
cushion, 11 misses it by Rs 909 — which proves the search found the true edge
rather than a safe-looking value.

**`ALTER ROLE … PASSWORD` does not take a bind parameter.** That clause's
grammar wants a string literal, so `password $1` is a syntax error whatever is
bound. `bootstrap-db.js` asks Postgres to `quote_literal` it first, in a normal
parameterised SELECT where parameters are allowed.

**Deleting a ledger row is refused by the GRANT before the trigger is
reached**, so the friendly "reverse it instead" message never appears for the
application role. Both fences are wanted: the GRANT covers the app, the trigger
covers the superuser path that migrations and restores run on. The test asserts
the GRANT's message, with a comment saying why.

**RLS is not used anywhere.** One laptop, one operating-system user, a server
bound to `127.0.0.1`. It would protect nothing the login screen and the file
system do not already protect, and would make every reporting function harder
to read. Recorded in migration 001 so that it reads as a decision.

**Seed data is not in a migration.** A fresh install starts empty and `/setup`
fills it in. One client's real opening history is private history, not a
generic starting point.
