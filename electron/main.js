/**
 * The Electron main process.
 *
 * Startup order matters and shutdown runs it backwards:
 *
 *   1. start (or first-time create) the bundled Postgres, apply migrations
 *   2. spawn the Next.js standalone server with those credentials, 127.0.0.1 only
 *   3. open a window pointed at it, but only once it actually answers
 *
 * Stopping in reverse is what keeps "a backup is just a folder copy" true: a
 * Postgres killed mid-write leaves a cluster that may not start again.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { app, BrowserWindow, dialog, shell, Menu } = require('electron');
const { bootstrapDatabase } = require('./bootstrap-db');
const { loadOrCreateConfig, userDataDir, logPath } = require('./config');
const { registerBackupHandlers } = require('./backup');

const isDev = process.env.ELECTRON_DEV === 'true';

let mainWindow = null;
let nextProcess = null;
let stopDatabase = null;
let shuttingDown = false;

/** Lazy: app.getPath() is not safe before the ready event, and this file loads well before it. */
const serverLog = () => logPath('next-server.log');
const startupLog = () => logPath('startup.log');

function log(message) {
  const line = `${new Date().toISOString()}  ${message}\n`;
  try {
    fs.mkdirSync(userDataDir(), { recursive: true });
    fs.appendFileSync(startupLog(), line);
  } catch {
    // Logging must never be the thing that stops the app starting.
  }
  if (isDev) process.stdout.write(line);
}

function tailServerLog(bytes = 4000) {
  try {
    return fs.readFileSync(serverLog(), 'utf8').slice(-bytes);
  } catch {
    return '(nothing was captured from the server)';
  }
}

function waitForServer(url, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function poll() {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on('error', () => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error(`The app's own server did not answer within ${timeoutMs / 1000} seconds.`));
            return;
          }
          setTimeout(poll, 300);
        });
    })();
  });
}

/**
 * Race the wait against the child dying.
 *
 * A blind timeout fires identically whether the server crashed in the first
 * second or is merely slow, which hides the real error in every case where it
 * crashed -- and that is most of them.
 */
function waitForServerOrExit(url, child, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const onExit = (codeOrError, signal) => {
      if (settled) return;
      settled = true;
      reject(new Error(
        `The app's server stopped before it was ready (${codeOrError}${signal ? `, ${signal}` : ''}).\n\n${tailServerLog()}`,
      ));
    };
    child.once('exit', onExit);
    child.once('error', onExit);

    const finish = (fn) => (value) => {
      if (settled) return;
      settled = true;
      child.removeListener('exit', onExit);
      child.removeListener('error', onExit);
      fn(value);
    };
    waitForServer(url, timeoutMs).then(finish(resolve), finish(reject));
  });
}

function startNextServer(env) {
  const config = loadOrCreateConfig();
  const port = String(config.nextPort);

  const childEnv = {
    ...process.env,
    ...env,
    NODE_ENV: isDev ? 'development' : 'production',
    HOSTNAME: '127.0.0.1', // loopback only -- never served to the network the laptop is on
    PORT: port,
    // process.execPath is this very Electron binary. Without this flag, a
    // PACKAGED executable relaunches the whole application recursively instead
    // of running the script -- silently, with no error at all. It only appears
    // to work in dev, where the unpacked binary treats argv[1] as the app to load.
    ELECTRON_RUN_AS_NODE: '1',
  };

  if (isDev) {
    // Resolved and run with Node rather than spawn('npx', ...): npx is npx.cmd
    // on Windows, which spawn cannot execute without shell:true and its
    // quoting problems. This sidesteps PATH and the shell on every OS.
    const nextBin = require.resolve('next/dist/bin/next');
    nextProcess = spawn(
      process.execPath,
      [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', port],
      { cwd: path.join(__dirname, '..'), env: childEnv, stdio: 'inherit' },
    );
  } else {
    const serverPath = path.join(__dirname, '..', '.next', 'standalone', 'server.js');
    if (!fs.existsSync(serverPath)) {
      throw new Error(`The app is missing its server (${serverPath}). The build is incomplete.`);
    }

    // A packaged app launched from the Start menu is a GUI executable with no
    // console, so this process's stdout is not a valid handle to hand a child.
    // 'inherit' can kill it the moment it logs -- before it binds its port.
    // Pipe to a real file: it is the only debugging that will exist on the
    // client's machine.
    nextProcess = spawn(process.execPath, [serverPath], {
      cwd: path.join(__dirname, '..'),
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stream = fs.createWriteStream(serverLog(), { flags: 'a' });
    stream.write(`\n--- launched ${new Date().toISOString()} ---\n`);
    nextProcess.stdout.pipe(stream);
    nextProcess.stderr.pipe(stream);
  }

  return `http://127.0.0.1:${port}`;
}

async function createWindow(env) {
  const url = startNextServer(env);
  log(`waiting for ${url}`);
  await waitForServerOrExit(url, nextProcess);
  log('server is up');

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Committee Manager',
    backgroundColor: '#f6f7f5',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Shown only once it has something to paint, so nobody watches a white box.
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  // Nothing in this app should open a second window, and there is no internet
  // to open anything into. Anything that tries goes to the real browser.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(url);
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Show the data folder',
          // The one thing a user needs to find on their own: the folder that
          // holds the books, the log and the config. Documenting a guessed
          // path is how people end up backing up the wrong thing.
          click: () => shell.openPath(userDataDir()),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' },
      { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' },
      ...(isDev ? [{ role: 'toggleDevTools' }] : [])] },
  ]));
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }
  if (stopDatabase) {
    log('stopping the database');
    await stopDatabase().catch((error) => log(`database stop failed: ${error.message}`));
    stopDatabase = null;
  }
  log('stopped cleanly');
}

app.whenReady().then(async () => {
  try {
    buildMenu();
    log(`starting (${app.getVersion()}), data folder ${userDataDir()}`);

    const { env, stop } = await bootstrapDatabase({ log });
    stopDatabase = stop;

    registerBackupHandlers({
      getSuperCredentials: () => {
        const config = loadOrCreateConfig();
        return { host: '127.0.0.1', port: config.pgPort, user: 'postgres',
                 password: config.pgSuperPassword, database: 'committee' };
      },
      stopEverything: shutdown,
      log,
    });

    await createWindow(env);
  } catch (error) {
    log(`STARTUP FAILED: ${error.stack ?? error.message}`);
    dialog.showErrorBox(
      'Committee Manager could not start',
      `${error.message}\n\nThere is a log in:\n${userDataDir()}`,
    );
    await shutdown();
    app.exit(1);
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && !shuttingDown) mainWindow?.show();
});

app.on('window-all-closed', async () => {
  await shutdown();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (event) => {
  if (!shuttingDown && (nextProcess || stopDatabase)) {
    event.preventDefault();
    await shutdown();
    app.exit(0);
  }
});
