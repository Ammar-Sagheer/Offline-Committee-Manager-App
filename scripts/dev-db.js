#!/usr/bin/env node
/**
 * Start the same bundled Postgres the desktop app uses, against a throwaway
 * cluster in .devdata/, and leave it running.
 *
 * This exists so `npm run dev` is a normal Next.js dev server against the real
 * schema -- same triggers, same constraints, same PL/pgSQL. A dev setup that
 * skips the database is a dev setup that cannot catch any of the bugs this
 * project is actually at risk of.
 *
 *   Terminal 1:  npm run db:dev
 *   Terminal 2:  npm run dev
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
process.env.APP_DATA_DIR = process.env.APP_DATA_DIR || path.join(root, '.devdata');

const { bootstrapDatabase } = require('../electron/bootstrap-db');

(async () => {
  const { env, firstRun, stop } = await bootstrapDatabase();

  // next dev reads this. Written every time so a reset cluster's new password
  // never leaves a stale file behind to fail against.
  const envFile = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  fs.writeFileSync(path.join(root, '.env.local'), `${envFile}\n`);

  console.log('');
  console.log(`  Database up on 127.0.0.1:${env.PGPORT}/${env.PGDATABASE}${firstRun ? '  (fresh)' : ''}`);
  console.log('  Wrote .env.local');
  console.log('');
  console.log('  Now run:  npm run dev      ->  http://127.0.0.1:34117');
  console.log('  Stop it with Ctrl-C.');
  console.log('');

  const shutdown = async () => {
    console.log('\n  Stopping the database cleanly...');
    // A Postgres killed mid-write is what turns "a backup is just a folder
    // copy" into a bad idea. Always stop it properly, even in dev.
    await stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})().catch((error) => {
  console.error('\n  Could not start the database:\n ', error.message, '\n');
  process.exit(1);
});
