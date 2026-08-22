/**
 * Where this install keeps its data, and the secrets it generated for itself
 * the first time it ran.
 *
 * Nothing here is in git and nothing here ships in the installer. Anything
 * inside an installer can be unzipped by anyone holding it, so the passwords
 * are made on the user's own machine and every install differs.
 *
 * APP_DATA_DIR overrides the OS location. That exists so the database, the
 * migrations and the backup code can all be exercised from a plain Node script
 * with no Electron and no packaged build -- which is most of what can actually
 * be tested before the app reaches a Windows laptop.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function userDataDir() {
  if (process.env.APP_DATA_DIR) return path.resolve(process.env.APP_DATA_DIR);
  // Required lazily: this module is loaded well before app.whenReady(), and in
  // the dev database script there is no Electron at all.
  const { app } = require('electron');
  // %APPDATA%/<productName> on Windows, ~/Library/Application Support/... on
  // macOS, ~/.config/... on Linux.
  return app.getPath('userData');
}

const dbDataDir = () => path.join(userDataDir(), 'db-data');
const configPath = () => path.join(userDataDir(), 'config.json');
const logPath = (name) => path.join(userDataDir(), name);

const randomSecret = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

/**
 * Read config.json, creating it with fresh secrets on first run.
 *
 * The ports are fixed rather than random. A different port each launch breaks
 * nothing at runtime and makes every log and every bug report harder to compare
 * with the last one. They are uncommon enough not to collide with anything a
 * person is likely to be running.
 */
function loadOrCreateConfig() {
  const file = configPath();
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));

  fs.mkdirSync(userDataDir(), { recursive: true });
  const config = {
    pgPort: 55437,
    nextPort: 34117,
    pgSuperPassword: randomSecret(24),
    appUserPassword: randomSecret(24),
    sessionSecret: randomSecret(32),
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  return config;
}

module.exports = { userDataDir, dbDataDir, configPath, logPath, loadOrCreateConfig };
