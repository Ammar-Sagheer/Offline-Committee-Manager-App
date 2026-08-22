# Where this got to

One session, 2026-08-22. Read `docs/CHANGELOG.md` for why things are the way
they are; this file is what is done, what is not, and what has never been run.

## Done and verified by running it

| | How it was checked |
|---|---|
| Schema, money rules, solvency engine | `npm run check:sql` — 62 checks against a throwaway Postgres cluster, most asserting that a rule refuses |
| Every screen | driven in a real browser against a real database at 1440px, 1024px and 400px |
| Print sheets | rendered and read; the statement reads oldest-first like a passbook |
| The whole Electron chain | run under a virtual display on Linux: Postgres starts, all 12 migrations apply, the standalone server spawns via `process.execPath` with `ELECTRON_RUN_AS_NODE=1`, the window loads, shutdown is clean |
| `.next/standalone` | run with plain `node`; login page and every CSS and JS chunk return 200, so `postbuild` really is copying the static assets |
| `electron-builder`, and the packaged app | `npm run pack` produces `dist/linux-unpacked`, and **that binary was launched and served `/setup` with styling** — its own Postgres, all 12 migrations, the spawned standalone server. The packaging config is no longer theoretical |

## Never run

**No installer has been produced — only the unpacked app.** `npm run pack`
(`electron-builder --dir`) has been run and its output launched. `npm run dist`,
which wraps that in an NSIS installer, has not. What that leaves untested is
NSIS itself: the install and uninstall flow, per-user install, shortcuts, and
installing over a previous version.

**Nothing Windows-specific has been run at all.** No NSIS installer, no `.cmd`
resolution, no certificate-store behaviour, no Windows file locking. Windows
refuses to rename a directory with open handles inside it, which is exactly
what restore does, and that ordering has only been reasoned about here.

**Only `@embedded-postgres/linux-x64` is installed.** npm installs the
platform's own binary, so a Windows build needs
`@embedded-postgres/windows-x64` present. Build on Windows, or install that
package explicitly first. The `files` list already names it; a pattern that
matches nothing fails silently, which is how this becomes a "Cannot find
module" on the client's machine rather than a build error on yours.

**Backup and restore have not been exercised end to end.** The code is there
and the guards are there — both halves copied together, `postmaster.pid`
filtered both ways, validation before anything live is touched, the current
folder moved aside rather than deleted, relaunch either way. What has not
happened is the test that actually matters: restore onto a *simulated fresh
install* — a different app-data folder with its own freshly generated secrets —
and confirm the app starts and the logins work. Two independent faults are
found that way and by no other means.

## First things to do on the Windows laptop

1. `npm run pack` first, not `npm run dist`. Then look inside
   `dist/win-unpacked/resources/app/.next/standalone/node_modules/` and confirm
   `next` and `react` are really there, and launch
   `dist/win-unpacked/Committee Manager.exe` directly. That separates "the app
   works" from "the installer works", and they fail for different reasons.
2. Install it, launch it, and read `%APPDATA%/Committee Manager/startup.log`
   before anything else. If the window never appears, that file has the reason;
   `next-server.log` beside it has the server's.
3. Walk `/setup` with the real ten names and the real terms.
4. Back up to a USB stick, then restore from it onto a machine that has never
   run the app.

## Left out on purpose

**No auto-update.** One known laptop, hand-carried installers. Adding
`electron-updater` later means a second public repo holding nothing but
installers, because a token shipped inside an installer is not a secret.

**No dark mode.** The app is used in an office, and a second palette is surface
area with nobody asking for it.

**No row-level security.** One laptop, one operating-system user, a server
bound to `127.0.0.1`. Recorded as a decision in migration 001 rather than left
to look like an oversight.

**Members cannot log in from their own machines.** They cannot, by design — the
app answers only on `127.0.0.1`. Sharing is the printed statement and the month
summary. A read-only login exists for a member looking over Arshad's shoulder
at his laptop.

## Known rough edges

- The projection table is 36 rows with no pager. Deliberate: its length is set
  by the "look ahead" control, so it is bounded rather than growing. Worth
  revisiting if somebody sets it to 240.
- `close_cycle` will close a month with contributions missing, on purpose —
  people pay late and a database that refuses to move on is one somebody works
  around. The dialog names who has not paid first.
- A member who has left cannot have anything new recorded against him, and
  cannot be marked as left while he still owes. Both are enforced; neither has
  been used in anger.
