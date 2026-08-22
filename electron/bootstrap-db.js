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
const path = require('path');
const { Client } = require('pg');
const { dbDataDir, userDataDir, loadOrCreateConfig } = require('./config');

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

async function bootstrapDatabase({ log = console.log } = {}) {
  // embedded-postgres is ESM-only and this file is CommonJS, which is what the
  // Electron main process is. A dynamic import() works from CommonJS whatever
  // the target's own module format.
  const { default: EmbeddedPostgres } = await import('embedded-postgres');

  const config = loadOrCreateConfig();
  const dataDir = dbDataDir();
  const firstRun = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));

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

    onLog: () => {},
    onError: () => {},
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
  await pg.start();
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
