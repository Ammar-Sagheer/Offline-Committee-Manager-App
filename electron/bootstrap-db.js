/**
 * Start the bundled Postgres and bring its schema up to date.
 *
 * Real Postgres, not SQLite, and that is the load-bearing decision in this
 * whole project. Every rule that keeps ten people's money straight -- the
 * append-only ledger, the repayment ceiling, the solvency refusal, the
 * projection -- is a trigger, a constraint or a PL/pgSQL function in db/
 * migrations. On SQLite all of it silently disappears and nothing in the UI
 * complains, because the UI check was only ever the courtesy.
 *
 * embedded-postgres ships real per-platform binaries as an npm dependency, so
 * the laptop needs no Docker, no installer and no service.
 */
const fs = require('fs');
const net = require('net');
const path = require('path');
const { Client } = require('pg');
const { dbDataDir, userDataDir, loadOrCreateConfig, saveConfig } = require('./config');

const DATABASE_NAME = 'committee';
const APP_ROLE = 'app_user';
const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

async function ensureAppUserPassword(client, password) {
  // ALTER ROLE ... PASSWORD takes a string literal, not an expression, so
  // `password $1` is a syntax error whatever is bound to it. Ask Postgres to
  // quote the value with a normal parameterised SELECT -- where parameters are
  // allowed -- then interpolate the already-escaped result.
  const { rows } = await client.query('select quote_literal($1) as quoted', [password]);
  await client.query(`alter role ${APP_ROLE} with password ${rows[0].quoted}`);
}

async function runMigrations(client, log = console.log) {
  await client.query(`
    create table if not exists public.schema_migrations (
      filename    text primary key,
      applied_at  timestamptz not null default now()
    )
  `);
  const { rows } = await client.query('select filename from public.schema_migrations');
  const already = new Set(rows.map((r) => r.filename));

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  let applied = 0;

  for (const file of files) {
    if (already.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    log(`[db] applying ${file}`);

    // One transaction per file, so a failure leaves nothing half-applied and
    // the same file is retried cleanly on the next launch.
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into public.schema_migrations (filename) values ($1)', [file]);
      await client.query('commit');
      applied += 1;
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw new Error(`Migration ${file} failed: ${error.message}`);
    }
  }
  return applied;
}

/**
 * Is this port free?
 *
 * Worth checking before starting rather than after: embedded-postgres waits for
 * a "ready to accept connections" line that a Postgres which could not bind
 * never prints, so the app hangs for ever -- no window, no error, nothing on
 * screen at all. That is the worst failure this app can have, because there is
 * nothing for the person in front of it to report.
 *
 * The usual cause is dull and fixable: a second copy of the app already open,
 * or the last one still shutting down.
 */
function portIsFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

/** Fail with something readable rather than waiting for ever. */
function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** Is this pid still alive? Signal 0 asks without sending anything. */
function pidIsAlive(pid) {
  if (!pid || Number.isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM'; // alive, just not ours to signal
  }
}

/** Can we reach a Postgres on this port using OUR superuser credentials? */
async function isOurPostgres(port, password) {
  const client = new Client({
    host: '127.0.0.1', port, user: 'postgres', password,
    database: 'postgres', connectionTimeoutMillis: 3000,
  });
  try {
    await client.connect();
    await client.query('select 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

function waitForPortFree(port, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve) => {
    (async function poll() {
      if (await portIsFree(port)) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(poll, 400);
    })();
  });
}

/**
 * Sort out a cluster of ours that is already running, or was never shut down.
 *
 * Two states, and telling them apart matters because the fixes are opposite:
 *
 *  - **Still running.** A crash, a Task Manager kill, or the machine being
 *    switched off leaves the postmaster alive; embedded-postgres spawns it
 *    unmanaged, so nothing reaps it. Stop it, then start cleanly. Moving to
 *    another port instead would put a second postmaster on the same data
 *    directory, which is how a database gets corrupted.
 *
 *  - **A stale postmaster.pid.** The process is gone but the lock file is not.
 *    Postgres refuses to start and cannot tell stale from live, so it has to be
 *    removed. This is also what a restored backup looks like if the copy was
 *    taken while the app was running.
 *
 * The two are distinguished by actually connecting: if a Postgres answers on
 * the port in the pid file using our own superuser password, it is ours and it
 * is alive. Nothing else is a safe test -- a pid can be recycled.
 */
async function reconcileOwnCluster(config, dataDir, log) {
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (!fs.existsSync(pidFile)) return;

  const lines = fs.readFileSync(pidFile, 'utf8').split('\n');
  const pid = Number((lines[0] || '').trim());
  const port = Number((lines[3] || '').trim()) || config.pgPort;

  if (pidIsAlive(pid) && (await isOurPostgres(port, config.pgSuperPassword))) {
    log(`[db] our database is already running (pid ${pid}, port ${port}) - stopping it`);
    try {
      if (process.platform === 'win32') {
        // Windows has no SIGINT. taskkill /t takes the child processes with it,
        // and Postgres runs several.
        require('child_process').spawnSync('taskkill', ['/pid', String(pid), '/f', '/t']);
      } else {
        process.kill(pid, 'SIGINT'); // fast shutdown
      }
    } catch (error) {
      log(`[db] could not stop it: ${error.message}`);
    }

    if (await waitForPortFree(port)) {
      log('[db] stopped');
    } else {
      throw new Error(
        `Committee Manager's database is already running and would not stop (port ${port}). ` +
        'Restart the computer, or end every "postgres" task in Task Manager, then open the app again.',
      );
    }
    return;
  }

  if (!pidIsAlive(pid)) {
    // A lock file from a copy taken while running, or from a hard shutdown.
    log('[db] clearing a stale postmaster.pid left by a previous run');
    fs.rmSync(pidFile, { force: true });
    fs.rmSync(path.join(dataDir, 'postmaster.opts'), { force: true });
  }
}

/**
 * The port this install uses, moved out of the way if it is taken.
 *
 * Fixed ports are worth having -- a different one each launch makes every log
 * and bug report incomparable -- but a fixed port shared by every install is
 * not. Two copies on one machine, or a development database in a terminal
 * beside the installed app, and neither can start. So the port is chosen once,
 * written down, and only moved when it is genuinely unavailable.
 */
async function choosePort(config, key, log) {
  const wanted = config[key];
  for (let port = wanted; port < wanted + 25; port += 1) {
    if (await portIsFree(port)) {
      if (port !== wanted) {
        config[key] = port;
        saveConfig(config);
        log(`[db] port ${wanted} was taken; this install now uses ${port}`);
      }
      return port;
    }
  }
  throw new Error(
    `Ports ${wanted} to ${wanted + 24} are all in use, so Committee Manager cannot start its database. ` +
    'Restart the computer and open the app again.',
  );
}

async function bootstrapDatabase({ log = console.log } = {}) {
  // embedded-postgres is ESM-only and this file is CommonJS, which is what the
  // Electron main process is. A dynamic import() works from CommonJS whatever
  // the target's own module format.
  const { default: EmbeddedPostgres } = await import('embedded-postgres');

  const config = loadOrCreateConfig();
  const dataDir = dbDataDir();
  const firstRun = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));

  // Both of these happen before the instance is built, because the constructor
  // bakes the port in and there is no way to change it afterwards.
  //
  // Order matters too: a postmaster left running by a crash is holding the
  // port, and moving to a different one would start a SECOND postmaster
  // against the same data directory -- the one thing that must never happen.
  await reconcileOwnCluster(config, dataDir, log);
  config.pgPort   = await choosePort(config, 'pgPort', log);
  config.nextPort = await choosePort(config, 'nextPort', log);

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: config.pgSuperPassword,
    port: config.pgPort,
    persistent: true,
    host: '127.0.0.1', // loopback only: never reachable from the network the laptop is on

    // Postgres refuses to run as root, so embedded-postgres runs it as a
    // `postgres` OS user instead -- and then the data directory has to belong
    // to that user too. Only ever true in a container or CI box; the Windows
    // laptop this ships to never takes this branch.
    createPostgresUser: typeof process.getuid === 'function' && process.getuid() === 0,

    // Forwarded to the same log file as everything else. A database that will
    // not start is the one failure with nothing else to go on: the window never
    // appears, and on a packaged GUI app there is no console for it to have
    // printed to.
    onLog: (message) => log(`[pg] ${String(message).trim()}`),
    onError: (message) => log(`[pg error] ${String(message).trim()}`),
  });

  if (firstRun) {
    log(`[db] first run - creating the database in ${dataDir}`);
    // Create it here rather than leaving it to initdb. When the process runs as
    // root, embedded-postgres hands the cluster to a separate `postgres` OS
    // user and chowns this directory to it -- which it can only do to a
    // directory that already exists.
    fs.mkdirSync(dataDir, { recursive: true });
    await pg.initialise();
  }
  // Bounded, for the same reason as the port check above: waiting for ever is
  // the one outcome nobody can act on.
  await withTimeout(
    pg.start(), 90_000,
    'The database did not start within 90 seconds. There is a log in the app\'s data folder (File → Show the data folder) with the reason.',
  );
  try {
    if (firstRun) await pg.createDatabase(DATABASE_NAME);

    const client = new Client({
      host: '127.0.0.1',
      port: config.pgPort,
      user: 'postgres',
      password: config.pgSuperPassword,
      database: DATABASE_NAME,
    });
    await client.connect();
    try {
      await runMigrations(client, log);
      await ensureAppUserPassword(client, config.appUserPassword);
    } finally {
      await client.end();
    }
  } catch (error) {
    // Anything from here on leaves a running Postgres nobody holds a handle
    // to. Stop it before rethrowing, or the next launch finds its own port
    // taken and the real error -- a failed migration, say -- is two failures
    // behind whatever gets reported.
    await pg.stop().catch(() => {});
    throw error;
  }

  return {
    firstRun,
    // The app connects as the restricted role, never as the superuser. The
    // superuser credentials stay in the main process for the handful of jobs
    // that genuinely need them -- migrations, and a consistent live backup.
    env: {
      PGHOST: '127.0.0.1',
      PGPORT: String(config.pgPort),
      PGDATABASE: DATABASE_NAME,
      PGUSER: APP_ROLE,
      PGPASSWORD: config.appUserPassword,
      SESSION_SECRET: config.sessionSecret,
      APP_DATA_DIR: userDataDir(),
      DB_DATA_DIR: dataDir,
    },
    async stop() {
      await pg.stop();
    },
  };
}

module.exports = { bootstrapDatabase, DATABASE_NAME, APP_ROLE };
