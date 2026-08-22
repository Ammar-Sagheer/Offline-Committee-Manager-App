#!/usr/bin/env node
/**
 * Throw the development database away.
 *
 * The cluster, the books and the generated passwords all live in one folder,
 * so deleting it is the whole reset — the next `npm run db:dev` builds an empty
 * one from the migrations, and the app goes to /setup because there is nobody
 * to sign in as.
 *
 * This only ever touches .devdata/ in this checkout. It cannot reach the
 * installed app's data folder, which lives in the OS app-data directory.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const devData = path.join(root, '.devdata');
const envFile = path.join(root, '.env.local');

// Stopping first matters. A Postgres killed mid-write can leave a cluster that
// will not start again, and on Windows a folder with open handles inside it
// cannot be deleted at all.
try {
  const list = execSync(
    process.platform === 'win32'
      ? 'wmic process where "commandline like \'%%embedded-postgres%%\'" get processid'
      : "ps -eo pid,args | grep 'embedded-postgres' | grep -v grep | awk '{print $1}'",
    { encoding: 'utf8' },
  );
  const pids = list.match(/\d+/g) ?? [];
  if (pids.length) {
    console.log(`  stopping ${pids.length} database process(es) first`);
    pids.forEach((pid) => {
      try { process.kill(Number(pid), 'SIGTERM'); } catch {}
    });
    // Give the checkpoint time to finish.
    execSync(process.platform === 'win32' ? 'timeout /t 5 /nobreak' : 'sleep 5', { stdio: 'ignore' });
  }
} catch {
  // Nothing running, or no way to look. Deleting is still safe.
}

if (!fs.existsSync(devData)) {
  console.log('\n  Nothing to reset — .devdata/ does not exist.\n');
} else {
  fs.rmSync(devData, { recursive: true, force: true });
  console.log('\n  Deleted .devdata/');
}
fs.rmSync(envFile, { force: true });

console.log('  Deleted .env.local');
console.log('');
console.log('  Next:  npm run db:dev   then   npm run dev');
console.log('  The app will open at /setup, with nothing in it.');
console.log('');
