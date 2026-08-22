/**
 * Backing the committee's books up, and getting them back.
 *
 * When the data lives on one laptop this is not a feature request -- it is the
 * difference between an inconvenience and ten people losing their record of
 * who paid what. Two faults make a backup that looks perfect and is useless,
 * and both are guarded here:
 *
 *  1. Postgres keeps its role passwords INSIDE the cluster, and config.json is
 *     the only record of what they are. A fresh install generates new random
 *     ones, so a db-data folder restored on its own is intact and unreachable.
 *     Both halves travel together, always.
 *
 *  2. A copy taken while the server is running necessarily includes
 *     postmaster.pid, and Postgres then refuses to start from it -- it cannot
 *     tell a stale pid from a live one. Filtered on the way out AND on the way
 *     back in, since an older backup may still carry one.
 */
const fs = require('fs');
const path = require('path');
const { ipcMain, dialog, app, shell } = require('electron');
const { Client } = require('pg');
const { userDataDir, dbDataDir, configPath } = require('./config');

const RUNTIME_FILES = new Set(['postmaster.pid', 'postmaster.opts']);

function stamp() {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

function copyTree(from, to) {
  fs.cpSync(from, to, {
    recursive: true,
    filter: (src) => !RUNTIME_FILES.has(path.basename(src)),
  });
}

/**
 * Postgres' documented way to make a filesystem copy of a live cluster
 * consistent. Needs the superuser, which is why those credentials stay in the
 * main process and the app connects as a restricted role for everything else.
 */
async function withConsistentSnapshot(credentials, fn, log) {
  const client = new Client(credentials);
  await client.connect();
  try {
    await client.query("select pg_backup_start('committee-manager backup')");
    try {
      await fn();
    } finally {
      await client.query('select pg_backup_stop()').catch((error) =>
        log(`pg_backup_stop failed: ${error.message}`));
    }
  } finally {
    await client.end().catch(() => {});
  }
}

function validateBackupFolder(folder) {
  if (!fs.existsSync(path.join(folder, 'db-data', 'PG_VERSION'))) {
    return 'That folder does not hold a Committee Manager backup — there is no db-data inside it.';
  }
  if (!fs.existsSync(path.join(folder, 'config.json'))) {
    return 'That backup is missing config.json, which holds the database\'s own passwords. Without it the books cannot be opened. Find the folder that has both.';
  }
  try {
    const config = JSON.parse(fs.readFileSync(path.join(folder, 'config.json'), 'utf8'));
    if (!config.pgSuperPassword || !config.appUserPassword) {
      return 'The config.json in that backup is not complete. Find the folder that has both it and db-data.';
    }
  } catch {
    return 'The config.json in that backup could not be read.';
  }
  return null;
}

function registerBackupHandlers({ getSuperCredentials, stopEverything, log }) {
  ipcMain.handle('data-folder', () => userDataDir());
  ipcMain.handle('open-data-folder', () => shell.openPath(userDataDir()));

  ipcMain.handle('backup-to-folder', async () => {
    const picked = await dialog.showOpenDialog({
      title: 'Where should the backup go?',
      message: 'Pick a USB stick or another drive. A backup sitting beside the original is lost with the original.',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (picked.canceled || !picked.filePaths[0]) return { ok: false, message: 'Cancelled.' };

    const target = path.join(picked.filePaths[0], `committee-backup-${stamp()}`);

    try {
      fs.mkdirSync(target, { recursive: true });
      await withConsistentSnapshot(getSuperCredentials(), () => {
        copyTree(dbDataDir(), path.join(target, 'db-data'));
      }, log);

      // The other half. Without it the copy above cannot be opened by anything.
      fs.copyFileSync(configPath(), path.join(target, 'config.json'));
      fs.chmodSync(path.join(target, 'config.json'), 0o600);

      fs.writeFileSync(path.join(target, 'READ-ME-FIRST.txt'),
        [
          'Committee Manager backup',
          `Taken ${new Date().toLocaleString()}`,
          '',
          'This folder holds the whole committee: every contribution, every',
          'withdrawal and every repayment.',
          '',
          'To restore it: install Committee Manager on the new machine, open it,',
          'go to Settings, and choose "Restore from a backup" — then pick THIS',
          'folder.',
          '',
          'Both parts must stay together. db-data is the books; config.json holds',
          'the passwords that open them. Either one on its own is useless.',
          '',
          'After restoring, the logins are the ones from this backup — not',
          'whatever was set up on the new machine.',
        ].join('\n'));

      log(`backup written to ${target}`);
      return { ok: true, message: `Backed up to ${target}`, path: target };
    } catch (error) {
      log(`backup failed: ${error.stack ?? error.message}`);
      return { ok: false, message: `The backup did not finish: ${error.message}` };
    }
  });

  ipcMain.handle('restore-from-folder', async () => {
    const picked = await dialog.showOpenDialog({
      title: 'Which backup folder?',
      properties: ['openDirectory'],
    });
    if (picked.canceled || !picked.filePaths[0]) return { ok: false, message: 'Cancelled.' };
    const source = picked.filePaths[0];

    // Validated BEFORE anything live is touched. Somebody picking the wrong
    // folder is far likelier than a corrupt backup.
    const problem = validateBackupFolder(source);
    if (problem) return { ok: false, message: problem };

    const confirmed = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Restore and restart', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Restore the committee from this backup?',
      message: 'Everything currently in this app will be replaced.',
      detail:
        `From:\n${source}\n\n` +
        'The current books are moved aside first, so this can be undone once — ' +
        'but restoring a second time overwrites that copy.\n\n' +
        'After restarting, sign in with the password from the BACKUP, not the one set up on this machine.',
    });
    if (confirmed.response !== 0) return { ok: false, message: 'Cancelled.' };

    // Past this point there is no useful way to report an error to a page whose
    // server is about to lose its database, so everything is committed and the
    // app relaunches either way.
    const root = userDataDir();
    const aside = path.join(root, 'replaced-by-restore');

    try {
      // Windows refuses to rename a directory anything has files open inside,
      // so the server and Postgres go down first.
      await stopEverything();

      fs.rmSync(aside, { recursive: true, force: true });
      fs.mkdirSync(aside, { recursive: true });
      if (fs.existsSync(dbDataDir())) fs.renameSync(dbDataDir(), path.join(aside, 'db-data'));
      if (fs.existsSync(configPath())) fs.renameSync(configPath(), path.join(aside, 'config.json'));

      copyTree(path.join(source, 'db-data'), dbDataDir());
      fs.copyFileSync(path.join(source, 'config.json'), configPath());
      fs.chmodSync(configPath(), 0o600);

      log(`restored from ${source}`);
    } catch (error) {
      log(`restore failed: ${error.stack ?? error.message}`);
      // Put back what was moved, then restart regardless -- a half-restored
      // folder is the one state nothing can recover from.
      try {
        fs.rmSync(dbDataDir(), { recursive: true, force: true });
        if (fs.existsSync(path.join(aside, 'db-data'))) {
          fs.renameSync(path.join(aside, 'db-data'), dbDataDir());
        }
        if (fs.existsSync(path.join(aside, 'config.json'))) {
          fs.copyFileSync(path.join(aside, 'config.json'), configPath());
        }
      } catch (rollbackError) {
        log(`rollback also failed: ${rollbackError.message}`);
      }
      dialog.showErrorBox('The restore did not finish',
        `${error.message}\n\nThe app will restart with the books it had before.`);
    }

    // A clean restart re-runs the normal startup against whatever is now on
    // disk, reading the matching config. Far more predictable than trying to
    // rewire a running app.
    app.relaunch();
    app.exit(0);
    return { ok: true, message: 'Restarting…' };
  });
}

module.exports = { registerBackupHandlers, validateBackupFolder };
