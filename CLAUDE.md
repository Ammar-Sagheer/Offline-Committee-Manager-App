# Working in this repo

Committee Manager is an offline Windows desktop app for one man — Muhammad
Arshad — to run the monthly committee he manages for ten people. It is Electron
from day one, not a web app that will be ported later. There is no cloud, no
Supabase, no internet.

Read `README.md` for what a committee is and what the rules mean. This file is
how to work here.

## Who reads the screens

One person, once a month, on a laptop, usually with a bank slip or a notebook
in his other hand. That is why the type is a notch larger than a website's,
why nothing hides behind a hover, and why colour is never the only thing
carrying a meaning. Nine other people never open the app at all — what they see
is a sheet he prints or saves as a PDF, so `app/print/` is a real screen, not a
stylesheet bolted on at the end.

## The rule that decides most arguments

**The money rules live in Postgres, not in React.** The append-only ledger, the
repayment ceiling, the one-payout-a-month rule, the solvency refusal — all of
them are triggers, constraints or PL/pgSQL functions in `db/migrations/`. An
application check is a courtesy that a second window, a psql session or a
future refactor walks straight past.

Two consequences, both non-negotiable:

- **Never add a money rule in `actions.js`.** If it matters, it goes in a
  migration. `actions.js` passes what was typed and hands the database's own
  sentence back to the screen.
- **Never swap Postgres for SQLite.** Every rule above disappears silently and
  nothing in the UI complains, because the UI check was only ever the courtesy.

## Load-bearing things

Move any of these and something breaks quietly rather than loudly.

| Thing | Where | What breaks |
|---|---|---|
| `types.setTypeParser(DATE, …)` keeps dates as strings | `app/_lib/db.js` | Every `<input type="date">` goes blank and months shift by a day |
| `NUMERIC` parsed to a JS number | `app/_lib/db.js` | Without it `"124000" + 4000` is `"1240004000"`, and it renders happily |
| `ELECTRON_RUN_AS_NODE: '1'` on the spawned server | `electron/main.js` | A packaged .exe relaunches itself recursively, silently, forever |
| `stdio: ['ignore','pipe','pipe']`, never `'inherit'` | `electron/main.js` | A packaged GUI app has no console; the child dies the moment it logs |
| `includeSubNodeModules: true` + `files` order | `package.json` | `.next/standalone/node_modules` is deleted from a build that succeeded |
| `output: 'standalone'` | `next.config.mjs` | Electron has no server to spawn |
| `.table-wrap` is `relative` | `app/_styles/globals.css` | `sr-only` escapes the scroll clip and the page scrolls sideways |
| `fund_delta` is a generated column | migration 005 | Every total in the app is a sum of it |
| Ports are chosen at startup, not fixed | `electron/bootstrap-db.js` | Two installs, or a dev database beside the app, and neither can start |

**Check grants by running as `app_user`, not the superuser.** A missing GRANT is
invisible to a superuser connection, which is how the Settings screen stayed
broken through 62 passing checks (migration 014).

## How to verify a change

```bash
npm run check:sql     # 67 checks against a throwaway Postgres cluster
npm run build         # the only type check a JavaScript project has
```

`check:sql` is the one that matters. Most of it asserts that a rule **refuses**
— a money rule nobody has tried to break is a money rule nobody has tested. Add
to it whenever you add a rule.

Then look at the screen. A DOM assertion can pass while a figure wraps across
two lines or a column sits under a pinned one; three real bugs in this repo
were invisible to a clean build and obvious in a screenshot.

```bash
npm run db:dev        # terminal 1 — Postgres in .devdata/, writes .env.local
npm run seed:demo     # once, for data worth looking at
npm run dev           # terminal 2 — http://127.0.0.1:34117
```

`seed:demo` deliberately includes long names, a member who missed a month, a
member repaying two withdrawals at once, an over-payment and a reversed entry.
Lorem ipsum hides exactly the bugs worth finding. Sign in as `arshad` /
`committee2026`, or `ammar` / `viewer2026` for the read-only view.

For screenshots, `npm i -D playwright` and drive it against the dev server with
`executablePath` pointing at an installed Chromium. It is not a dependency of
the app.

## Where things go

Same layout as the other projects, with the offline substitutions.

| | |
|---|---|
| `app/_lib/data-service.js` | every read. Nothing queries inline in a page |
| `app/_lib/actions.js` | every write, all returning `{ ok, message }` |
| `app/_lib/db.js` + `auth.js` | what the three Supabase clients used to be |
| `app/_lib/helpers.js` | reads cookies, so it can never enter a client bundle |
| `app/_lib/date-helpers.js`, `format-helpers.js` | safe on both sides — that is why they are separate |
| `app/_components/ui/` | must not know what a committee is |
| `app/_components/committee/` | everything that does |
| `db/migrations/` | numbered, applied in order, never edited after applying |
| `electron/` | main process, database bootstrap, backup and restore |

Import with `@/` everywhere. Never `../../..`.

## What has not been tested here

The app has been run end to end under a virtual display on Linux, both from
source and from `electron-builder`'s packaged output: Postgres starts, all
fourteen migrations apply, the standalone server comes up, the window loads and
renders, shutdown is clean.

**Nothing Windows-specific has been run at all** — no NSIS installer, no `.cmd`
resolution, no certificate-store behaviour, no Windows file-locking. And no
installer of any kind has been produced; `npm run pack` (unpacked) has been
run, `npm run dist` (NSIS) has not. See `PROGRESS.md` for what that leaves
unproven.
