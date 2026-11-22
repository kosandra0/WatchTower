'use strict';
/**
 * WatchTower desktop host (Electron main process).
 *
 * Startup: single-instance lock -> logging + data directories -> free loopback port ->
 *          locate + validate bundled Next.js server -> start it (utility process, output captured) ->
 *          wait for a structured /api/health -> start PowerShell monitor -> verify its heartbeat ->
 *          open the (frameless, rounded) window and the tray icon.
 * Every step is written to %APPDATA%\WatchTower\logs\watchtower-startup.log. Failures are classified so the
 * error dialog names the real cause instead of a generic message.
 *
 * NOTE: data lives in %APPDATA%\WatchTower. An older %APPDATA%\Chronos folder is moved there on first start.
 */
const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, powerMonitor, screen, session, shell, Tray, utilityProcess } = require('electron');
const v2host = require('./v2-host.cjs');
const { spawn, execFile } = require('node:child_process');
const { request } = require('node:http');
const { createServer } = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const APP_NAME = 'WatchTower';
const SERVER_READY_TIMEOUT_MS = 60000;
const AGENT_VERIFY_TIMEOUT_MS = 20000;
const SERVER_STOP_TIMEOUT_MS = 8000;
const MAX_PORT_ATTEMPTS = 3;
const MAX_AGENT_RESTARTS = 3;
const MAX_LOG_BYTES = 5 * 1024 * 1024;
const MIN_W = 960;
const MIN_H = 640;
const TRAY_W = 344;
const TRAY_H = 540;

let mainWindow = null;
let trayWindow = null;
let tray = null;
let serverUrl = null;
let isQuitting = false;
let forceClose = false;
let shutdownPromise = null;
let logDir = null;
let startupLog = null;
let agentLog = null;
let server = null; // { child, pid, exited, exitCode, recent: string[] }
let agent = null; // { child, pid, exited, exitCode, restarts, verified }
let monitoringState = 'not-started'; // not-started | starting | active | unavailable
let dataRoot = null;
let paths = {};
let customMaximized = false;
let restoreBounds = null;
let resizing = null;
// id: chosen logo; applied: shortcuts/window/tray already match it; exe: logo currently embedded in the launcher exe
let logoPref = { id: 'classic', applied: '', exe: 'classic' };
let prefs = { launchAtStartup: false, startMinimized: false, minimizeToTray: false, closeToTray: false, confirmExit: false };

// The data folder doubles as Electron's userData folder so existing local storage is kept.
let cachedRoot = null;
let dataMigrationNote = '';
function computeDataRoot() {
  if (cachedRoot) return cachedRoot;
  // WATCHTOWER_DATA_DIR overrides the default location (used by automated tests and for relocating data).
  const override = process.env.WATCHTOWER_DATA_DIR || process.env.CHRONOS_DATA_DIR;
  if (override && path.isAbsolute(override)) {
    cachedRoot = { root: override, userData: path.join(override, 'electron') };
    return cachedRoot;
  }
  const base = app.getPath('appData');
  const root = path.join(base, 'WatchTower');
  const legacy = path.join(base, 'Chronos'); // folder name used before the rename
  if (!fs.existsSync(root) && fs.existsSync(legacy)) {
    try {
      fs.renameSync(legacy, root); // same drive: instant, keeps every file (database, backups, logs)
      dataMigrationNote = `moved the data folder ${legacy} -> ${root}`;
    } catch (error) {
      // Never risk the user's data: keep using the old folder if it cannot be moved.
      dataMigrationNote = `could not move ${legacy} (${error.message}); continuing to use it`;
      cachedRoot = { root: legacy, userData: legacy };
      return cachedRoot;
    }
  }
  cachedRoot = { root, userData: root };
  return cachedRoot;
}
{
  const d = computeDataRoot();
  app.setPath('userData', d.userData);
}

// ---------------------------------------------------------------- logging

function redact(text) {
  return String(text).replace(/(password|passwd|token|secret|api[_-]?key|authorization)(["'=:\s]+)([^\s"',;]+)/gi, '$1$2[redacted]');
}

function rotateIfLarge(file) {
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_LOG_BYTES) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.renameSync(file, file.replace(/\.log$/, `-${stamp}.log`)); // never overwrite an older log
    }
  } catch { /* logging must never break startup */ }
}

function openLog(file) {
  rotateIfLarge(file);
  const stream = fs.createWriteStream(file, { flags: 'a' });
  stream.on('error', () => { /* disk problems must not crash the app */ });
  return stream;
}

function log(level, message) {
  const line = `${new Date().toISOString()} [${level}] ${redact(message)}\n`;
  if (startupLog && !startupLog.destroyed && !startupLog.writableEnded) startupLog.write(line);
  if (level === 'ERROR') console.error(line.trimEnd());
}

function logAgentChunk(prefix, chunk) {
  for (const raw of String(chunk).split(/\r?\n/)) {
    const text = raw.trimEnd();
    if (!text) continue;
    if (agentLog && !agentLog.destroyed && !agentLog.writableEnded) agentLog.write(`${new Date().toISOString()} ${prefix} ${redact(text)}\n`);
  }
}

// ---------------------------------------------------------------- errors

class StartupError extends Error {
  constructor(category, message, details) {
    super(message);
    this.category = category;
    this.details = details || '';
  }
}

const FRIENDLY = {
  PORT: `${APP_NAME} could not reserve a local network port.`,
  DATA_DIR: `${APP_NAME} cannot write to its data folder.`,
  MISSING_BUNDLE: `The ${APP_NAME} server files are missing from this installation.`,
  MISSING_RUNTIME: `${APP_NAME} is missing required runtime files. Reinstall ${APP_NAME}.`,
  MISSING_AGENT: 'The Windows monitoring agent file is missing.',
  PROCESS_EXIT: `The ${APP_NAME} local server stopped unexpectedly while starting.`,
  SERVER_ERROR: `The ${APP_NAME} local server started but reported an internal error.`,
  DATABASE: `${APP_NAME} could not start its local database service. Your existing data was not modified.`,
  TIMEOUT: `The ${APP_NAME} local server took too long to start. Security software may have blocked it.`,
};

function classifyExit(recentOutput, code) {
  const text = recentOutput.join('\n');
  const missing = /Cannot find module '([^']+)'/.exec(text);
  if (missing) return new StartupError('MISSING_RUNTIME', `Required module '${missing[1]}' was not found in the packaged server.`, text);
  if (/EADDRINUSE/.test(text)) return new StartupError('PORT', 'The selected local port was already in use.', text);
  if (/EACCES|EPERM|ENOSPC|EROFS/.test(text)) return new StartupError('DATA_DIR', 'The server hit a file permission or disk error.', text);
  if (/pglite|PGlite|database/i.test(text) && /error|failed/i.test(text)) return new StartupError('DATABASE', 'The embedded database failed to start.', text);
  return new StartupError('PROCESS_EXIT', `The local server process exited with code ${code ?? 'unknown'} before it became ready.`, text);
}

function showStartupFailure(error) {
  const category = error instanceof StartupError ? error.category : 'UNKNOWN';
  const friendly = FRIENDLY[category] || `${APP_NAME} could not start.`;
  const logFile = paths.startupLog || '%APPDATA%\\WatchTower\\logs\\watchtower-startup.log';
  log('ERROR', `STARTUP FAILED category=${category} message=${error && error.message}`);
  if (error && error.details) log('ERROR', `details: ${String(error.details).slice(-2000)}`);
  const choice = dialog.showMessageBoxSync({
    type: 'error',
    title: `${APP_NAME} startup error`,
    message: friendly,
    detail: `${error && error.message ? error.message : String(error)}\n\nError category: ${category}\n\nDiagnostic log:\n${logFile}`,
    buttons: ['Open log folder', 'Close'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (choice === 0 && logDir) shell.openPath(logDir);
}

// ---------------------------------------------------------------- paths + data + prefs

function prepareDirectories() {
  dataRoot = computeDataRoot().root;
  logDir = path.join(dataRoot, 'logs');
  const dbDir = path.join(dataRoot, 'database');
  try {
    fs.mkdirSync(logDir, { recursive: true });
    startupLog = openLog(path.join(logDir, 'watchtower-startup.log'));
    agentLog = openLog(path.join(logDir, 'watchtower-agent.log'));
  } catch (error) {
    throw new StartupError('DATA_DIR', `Cannot create the log folder: ${error.message}`);
  }
  paths = { dataRoot, logDir, dbDir, startupLog: path.join(logDir, 'watchtower-startup.log'), agentLog: path.join(logDir, 'watchtower-agent.log'), prefs: path.join(dataRoot, 'desktop-prefs.json') };

  try {
    fs.mkdirSync(dbDir, { recursive: true });
    const probe = path.join(dataRoot, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe, { force: true });
  } catch (error) {
    throw new StartupError('DATA_DIR', `The data folder is not writable: ${error.message}`);
  }
  try {
    const raw = JSON.parse(fs.readFileSync(paths.prefs, 'utf8'));
    for (const k of Object.keys(prefs)) if (typeof raw[k] === 'boolean') prefs[k] = raw[k];
    if (typeof raw.logo === 'string' && LOGO_IDS.includes(raw.logo)) logoPref.id = raw.logo;
    if (typeof raw.appliedLogo === 'string') logoPref.applied = raw.appliedLogo;
    if (typeof raw.exeLogo === 'string' && LOGO_IDS.includes(raw.exeLogo)) logoPref.exe = raw.exeLogo;
  } catch { /* first run: defaults */ }
}

function savePrefs() {
  try { fs.writeFileSync(paths.prefs, JSON.stringify({ ...prefs, logo: logoPref.id, appliedLogo: logoPref.applied, exeLogo: logoPref.exe }, null, 2)); } catch (error) { log('WARN', `could not save desktop prefs: ${error.message}`); }
}

function applyLoginItem() {
  if (!app.isPackaged) return;
  try {
    const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    app.setLoginItemSettings({ openAtLogin: prefs.launchAtStartup, path: exe, args: [] });
    log('INFO', `launch at startup: ${prefs.launchAtStartup}`);
  } catch (error) {
    log('WARN', `could not update login item: ${error.message}`);
  }
}

function getServerDirectory() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'watchtower-server');
  return path.resolve(__dirname, '..', '.next', 'standalone');
}

function validateServerBundle(serverDir) {
  const serverFile = path.join(serverDir, 'server.js');
  if (!fs.existsSync(serverFile)) {
    throw new StartupError('MISSING_BUNDLE', `The server entry point is missing: ${serverFile}`);
  }
  const required = [
    'node_modules/next/package.json',
    'node_modules/react/package.json',
    'node_modules/@electric-sql/pglite/dist/pglite.wasm',
    'node_modules/@electric-sql/pglite/dist/pglite.data',
    '.next/BUILD_ID',
    '.next/server',
  ];
  if (app.isPackaged) required.push('.next/static');
  const missing = required.filter((rel) => !fs.existsSync(path.join(serverDir, rel)));
  if (missing.length) {
    throw new StartupError('MISSING_RUNTIME', `Packaged server is missing: ${missing.join(', ')}`);
  }
  return serverFile;
}

function resolveAgentFile() {
  const agentFile = app.isPackaged
    ? path.join(process.resourcesPath, 'agent', 'watchtower-agent.ps1')
    : path.resolve(__dirname, '..', 'agent', 'watchtower-agent.ps1');
  if (!fs.existsSync(agentFile)) throw new StartupError('MISSING_AGENT', `The monitoring agent is missing: ${agentFile}`);
  return agentFile;
}

// ---------------------------------------------------------------- http helpers

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function httpJson(url, timeout = 2500) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'GET', timeout }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.end();
  });
}

function httpPost(url, value) {
  return new Promise((resolve) => {
    const body = Buffer.from(JSON.stringify(value));
    const req = request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
      timeout: 2500,
    }, (res) => { res.resume(); res.on('end', resolve); });
    req.on('error', resolve);
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.end(body);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- local server

function startLocalServer(port, serverDir, serverFile, agentFile) {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    WATCHTOWER_DATA_DIR: paths.dataRoot,
    WATCHTOWER_DB_DIR: paths.dbDir,
    WATCHTOWER_LOG_DIR: paths.logDir,
    WATCHTOWER_AGENT_PATH: agentFile,
  };
  const state = { child: null, pid: null, exited: false, exitCode: null, recent: [] };
  server = state;

  // The server writes a page cache at runtime. An installer that upgrades in place leaves the previous version's cache
  // behind, and it points at script files that no longer exist (pages then show "This page couldn't load"). It is
  // rebuilt on demand, so it is always cleared before the server starts.
  try { fs.rmSync(path.join(serverDir, '.next', 'server', 'route-cache'), { recursive: true, force: true }); } catch (error) { log('WARN', `could not clear the page cache (${error.message})`); }

  log('INFO', `starting server: file=${serverFile} cwd=${serverDir} port=${port} host=127.0.0.1`);
  const child = utilityProcess.fork(serverFile, [], {
    cwd: serverDir,
    env,
    stdio: 'pipe', // output is continuously consumed below so the child can never block on a full pipe
    serviceName: `${APP_NAME} Local Server`,
  });
  state.child = child;

  const onData = (label) => (chunk) => {
    for (const raw of String(chunk).split(/\r?\n/)) {
      const text = raw.trimEnd();
      if (!text) continue;
      state.recent.push(text);
      if (state.recent.length > 60) state.recent.shift();
      log(label === 'stderr' ? 'WARN' : 'INFO', `[server ${label}] ${text}`);
    }
  };
  if (child.stdout) child.stdout.on('data', onData('stdout'));
  if (child.stderr) child.stderr.on('data', onData('stderr'));

  child.on('spawn', () => {
    state.pid = child.pid;
    log('INFO', `server process spawned pid=${child.pid}`);
  });
  child.on('error', (...args) => log('ERROR', `server process error event: ${args.map(String).join(' | ')}`));
  child.on('exit', (code) => {
    state.exited = true;
    state.exitCode = code;
    log(isQuitting ? 'INFO' : 'ERROR', `server process exited code=${code}`);
    if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
      const choice = dialog.showMessageBoxSync({
        type: 'error',
        title: `${APP_NAME} stopped`,
        message: `The local ${APP_NAME} service exited unexpectedly.`,
        detail: `Exit code: ${code ?? 'unknown'}\n\nDiagnostic log:\n${paths.startupLog}`,
        buttons: ['Open log folder', 'Close'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (choice === 0) shell.openPath(logDir);
      quitReally();
    }
  });
  return state;
}

async function waitForServerReady(state, url) {
  const end = Date.now() + SERVER_READY_TIMEOUT_MS;
  let attempts = 0;
  let lastSummary = '';
  let consecutive5xx = 0;
  while (Date.now() < end) {
    if (state.exited) throw classifyExit(state.recent, state.exitCode);
    attempts += 1;
    try {
      const res = await httpJson(`${url}/api/health`);
      const summary = `status=${res.status} ${res.json ? JSON.stringify(res.json) : JSON.stringify(res.text.slice(0, 200))}`;
      if (summary !== lastSummary) {
        log('INFO', `health attempt ${attempts}: ${summary}`);
        lastSummary = summary;
      }
      const h = res.json;
      if (res.status === 200 && h && h.ok === true) {
        log('INFO', `server ready after ${attempts} health check(s)`);
        return h;
      }
      if (h && typeof h === 'object') {
        consecutive5xx = 0;
        if (h.initFailed) throw new StartupError('DATABASE', `Database initialization failed: ${h.error || 'unknown error'}`, state.recent.join('\n'));
        if (h.dataDirectory === false) throw new StartupError('DATA_DIR', h.error || 'The data directory is not writable.');
        if (h.database === true && h.schema === false) throw new StartupError('DATABASE', h.error || 'The database schema is incomplete.');
      } else if (res.status >= 500) {
        consecutive5xx += 1;
        if (consecutive5xx >= 8) throw new StartupError('SERVER_ERROR', `Health endpoint keeps returning HTTP ${res.status}.`, `${res.text.slice(0, 500)}\n${state.recent.join('\n')}`);
      }
    } catch (error) {
      if (error instanceof StartupError) throw error;
      // connection refused etc.: server still starting
    }
    await sleep(350);
  }
  throw new StartupError('TIMEOUT', `No healthy response from the server within ${SERVER_READY_TIMEOUT_MS / 1000}s (${attempts} attempts). Last: ${lastSummary || 'no response'}`, state.recent.join('\n'));
}

async function startServerWithRetry(serverDir, serverFile, agentFile) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_PORT_ATTEMPTS; attempt += 1) {
    let port;
    try { port = await findFreePort(); } catch (error) { throw new StartupError('PORT', `Could not allocate a local port: ${error.message}`); }
    serverUrl = `http://127.0.0.1:${port}`;
    const state = startLocalServer(port, serverDir, serverFile, agentFile);
    try {
      const health = await waitForServerReady(state, serverUrl);
      return { port, health };
    } catch (error) {
      lastError = error;
      if (!(error instanceof StartupError) || error.category !== 'PORT') throw error;
      log('WARN', `port conflict on attempt ${attempt}/${MAX_PORT_ATTEMPTS}; retrying with a new port`);
      await stopServer(state, 3000);
    }
  }
  throw lastError;
}

async function stopServer(state, timeoutMs = SERVER_STOP_TIMEOUT_MS) {
  if (!state || !state.child || state.exited) return;
  try {
    state.child.postMessage({ type: 'shutdown' }); // asks the server to close PGlite, then exit
  } catch (error) {
    log('WARN', `could not message server for graceful stop: ${error.message}`);
  }
  const end = Date.now() + timeoutMs;
  while (!state.exited && Date.now() < end) await sleep(100);
  if (!state.exited) {
    log('WARN', 'server did not stop gracefully in time; terminating it');
    try { state.child.kill(); } catch { /* already gone */ }
  } else {
    log('INFO', 'server stopped gracefully');
  }
}

// ---------------------------------------------------------------- monitoring agent

function powershellPath() {
  return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function startMonitor(agentFile) {
  const powershell = powershellPath();
  if (!fs.existsSync(powershell)) {
    monitoringState = 'unavailable';
    log('ERROR', `Windows PowerShell not found at ${powershell}; monitoring unavailable`);
    return null;
  }
  const state = agent || { restarts: 0 };
  agent = state;
  state.exited = false;
  state.exitCode = null;
  state.verified = false;
  monitoringState = 'starting';
  log('INFO', `starting monitoring agent: ${agentFile}`);
  // Arguments are passed as an array (no shell string). ExecutionPolicy Bypass applies to this process only.
  const child = spawn(powershell, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', agentFile, '-Server', serverUrl, '-PollMs', '500',
  ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  state.child = child;
  child.stdout.on('data', (c) => logAgentChunk('[agent]', c));
  child.stderr.on('data', (c) => logAgentChunk('[agent stderr]', c));
  child.once('spawn', () => {
    state.pid = child.pid;
    log('INFO', `agent process spawned pid=${child.pid}`);
  });
  child.once('error', (error) => {
    state.exited = true;
    monitoringState = 'unavailable';
    log('ERROR', `agent process error: ${error.message}`);
  });
  child.once('exit', (code) => {
    state.exited = true;
    state.exitCode = code;
    log(isQuitting ? 'INFO' : 'ERROR', `agent process exited code=${code}`);
    if (isQuitting) return;
    if (state.restarts < MAX_AGENT_RESTARTS) {
      state.restarts += 1;
      log('WARN', `restarting agent (${state.restarts}/${MAX_AGENT_RESTARTS}) in 3s`);
      setTimeout(() => { if (!isQuitting) startMonitor(agentFile); }, 3000);
    } else {
      monitoringState = 'unavailable';
      dialog.showMessageBox({
        type: 'warning',
        title: `${APP_NAME} monitoring stopped`,
        message: 'Application monitoring is not running.',
        detail: `The Windows monitoring agent stopped repeatedly. ${APP_NAME} can still show existing history, but new activity is not being recorded.\n\nDiagnostic log:\n${paths.agentLog}`,
        buttons: ['Open log folder', 'Close'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      }).then((r) => { if (r.response === 0) shell.openPath(logDir); }).catch(() => undefined);
    }
  });
  return state;
}

// The agent counts as running only when the server has actually received observations from it.
async function verifyAgentHeartbeat() {
  const end = Date.now() + AGENT_VERIFY_TIMEOUT_MS;
  while (Date.now() < end) {
    if (!agent || agent.exited) return false;
    try {
      const res = await httpJson(`${serverUrl}/api/live`);
      if (res.json && res.json.agent && res.json.agent.active) {
        agent.verified = true;
        monitoringState = 'active';
        log('INFO', `agent heartbeat verified (lastSeen=${res.json.agent.lastSeen})`);
        return true;
      }
    } catch { /* retry */ }
    await sleep(500);
  }
  return false;
}

function killTree(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve();
    const taskkill = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
    // Only the PID we spawned (and its children) is targeted; no other node/powershell processes are touched.
    execFile(taskkill, ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, () => resolve());
  });
}

// ---------------------------------------------------------------- windows

const preloadPath = path.join(__dirname, 'preload.cjs');
const webPrefs = () => ({ contextIsolation: true, nodeIntegration: false, sandbox: true, preload: preloadPath });

function iconImage(name) {
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, 'assets', name));
    return img.isEmpty() ? undefined : img;
  } catch { return undefined; }
}

function createWindow({ hidden }) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: MIN_W,
    minHeight: MIN_H,
    title: APP_NAME,
    icon: logoImage(logoPref.id, false),
    // Frameless + transparent so the window itself can have rounded corners (Windows 10 has none natively).
    frame: false,
    transparent: true,
    thickFrame: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: webPrefs(),
  });
  mainWindow.setMenu(null);
  customMaximized = false;
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || hidden) return;
    mainWindow.show();
    mainWindow.focus(); // open in front of the user, not behind other windows
    mainWindow.moveTop();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Keep the app on its own local origin.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(serverUrl)) {
      event.preventDefault();
      if (url.startsWith('https://')) shell.openExternal(url);
    }
  });
  let reloads = 0;
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log('ERROR', `renderer process gone: reason=${details.reason} exitCode=${details.exitCode}`);
    if (!isQuitting && details.reason !== 'clean-exit' && reloads < 3 && mainWindow && !mainWindow.isDestroyed()) {
      reloads += 1;
      mainWindow.webContents.reload();
    }
  });
  mainWindow.webContents.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
    log('WARN', `did-fail-load code=${code} ${description} url=${url} mainFrame=${isMainFrame}`);
  });
  mainWindow.on('unresponsive', () => log('WARN', 'window became unresponsive'));
  mainWindow.on('responsive', () => log('INFO', 'window responsive again'));
  mainWindow.on('minimize', () => { if (prefs.minimizeToTray && mainWindow) mainWindow.hide(); });
  mainWindow.on('close', (event) => {
    if (isQuitting || forceClose) return;
    if (prefs.closeToTray) {
      event.preventDefault();
      mainWindow.hide();
      log('INFO', 'window closed to tray');
      return;
    }
    if (prefs.confirmExit) {
      event.preventDefault();
      dialog.showMessageBox(mainWindow, {
        type: 'question',
        title: `Exit ${APP_NAME}?`,
        message: `Exit ${APP_NAME}?`,
        detail: 'Monitoring stops while the app is closed.',
        buttons: ['Exit', 'Stay open'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      }).then((r) => { if (r.response === 0) { forceClose = true; if (mainWindow) mainWindow.close(); } }).catch(() => undefined);
    }
  });
  mainWindow.loadURL(serverUrl);
  mainWindow.on('closed', () => { mainWindow = null; });
}

function showMain(navigateTo) {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow({ hidden: false });
  else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  if (navigateTo && navigateTo !== '/') mainWindow.webContents.send('wt:navigate', navigateTo);
}

function quitReally() {
  forceClose = true;
  app.quit();
}

// ---- custom maximize / resize (frameless transparent windows cannot use the native ones)
function setMaximized(value) {
  if (!mainWindow) return;
  if (value && !customMaximized) {
    restoreBounds = mainWindow.getBounds();
    mainWindow.setBounds(screen.getDisplayMatching(restoreBounds).workArea);
    customMaximized = true;
  } else if (!value && customMaximized) {
    if (restoreBounds) mainWindow.setBounds(restoreBounds);
    customMaximized = false;
  }
  mainWindow.webContents.send('wt:maximized', customMaximized);
}

function stopResize() {
  if (resizing) { clearInterval(resizing.timer); resizing = null; }
}

function startResize(dir) {
  if (!mainWindow || customMaximized || !/^(n|s|e|w|ne|nw|se|sw)$/.test(dir)) return;
  stopResize();
  const start = mainWindow.getBounds();
  const origin = screen.getCursorScreenPoint();
  const began = Date.now();
  const timer = setInterval(() => {
    if (!mainWindow || Date.now() - began > 20000) return stopResize(); // failsafe if pointerup is lost
    const p = screen.getCursorScreenPoint();
    const dx = p.x - origin.x;
    const dy = p.y - origin.y;
    let { x, y, width, height } = start;
    if (dir.includes('e')) width = Math.max(MIN_W, start.width + dx);
    if (dir.includes('s')) height = Math.max(MIN_H, start.height + dy);
    if (dir.includes('w')) { width = Math.max(MIN_W, start.width - dx); x = start.x + (start.width - width); }
    if (dir.includes('n')) { height = Math.max(MIN_H, start.height - dy); y = start.y + (start.height - height); }
    mainWindow.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
  }, 8);
  resizing = { timer };
}

// ---- tray + quick panel
function createTray() {
  const img = logoImage(logoPref.id, true);
  if (!img) { log('WARN', 'tray icon image missing; tray disabled'); return; }
  tray = new Tray(img);
  tray.setToolTip(APP_NAME);
  tray.on('click', () => toggleTrayPanel());
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: `Open ${APP_NAME}`, click: () => showMain() },
      { label: 'Quick panel', click: () => toggleTrayPanel() },
      { type: 'separator' },
      { label: 'Quit', click: () => quitReally() },
    ]);
    tray.popUpContextMenu(menu);
  });
  log('INFO', 'tray icon created');
}

function ensureTrayWindow() {
  if (trayWindow && !trayWindow.isDestroyed()) return trayWindow;
  trayWindow = new BrowserWindow({
    width: TRAY_W,
    height: TRAY_H,
    show: false,
    frame: false,
    transparent: true,
    thickFrame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    fullscreenable: false,
    backgroundColor: '#00000000',
    webPreferences: webPrefs(),
  });
  trayWindow.setMenu(null);
  trayWindow.loadURL(`${serverUrl}/tray`);
  trayWindow.on('blur', () => { if (trayWindow && !trayWindow.webContents.isDevToolsOpened()) trayWindow.hide(); });
  trayWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  trayWindow.on('closed', () => { trayWindow = null; });
  return trayWindow;
}

function toggleTrayPanel() {
  if (!tray || !serverUrl) return;
  const win = ensureTrayWindow();
  if (win.isVisible()) { win.hide(); return; }
  const tb = tray.getBounds();
  const wa = screen.getDisplayMatching(tb).workArea;
  const x = Math.min(Math.max(Math.round(tb.x + tb.width / 2 - TRAY_W / 2), wa.x + 8), wa.x + wa.width - TRAY_W - 8);
  const above = tb.y > wa.y + wa.height / 2;
  const y = Math.min(Math.max(above ? tb.y - TRAY_H - 8 : tb.y + tb.height + 8, wa.y + 8), wa.y + wa.height - TRAY_H - 8);
  win.setBounds({ x, y, width: TRAY_W, height: TRAY_H });
  win.show();
  win.focus();
}

// ---- logo selection: window, tray, shortcuts (Desktop / Start / pinned) and the launcher exe icon
const LOGO_IDS = ['classic', 'lighthouse', 'keep', 'pagoda', 'observer'];
const logoFile = (id, suffix) => path.join(__dirname, 'assets', 'logos', `${id}${suffix}`);

function logoImage(id, tray) {
  try {
    const img = nativeImage.createFromPath(logoFile(id, tray ? '-tray.png' : '.png'));
    return img.isEmpty() ? iconImage(tray ? 'tray.png' : 'icon.png') : img;
  } catch { return iconImage(tray ? 'tray.png' : 'icon.png'); }
}

function shortcutDirs() {
  const dirs = [app.getPath('desktop'), path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')];
  const pinned = path.join(app.getPath('appData'), 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned');
  dirs.push(path.join(pinned, 'TaskBar'), path.join(pinned, 'StartMenu'));
  return dirs;
}

/** Points every shortcut that launches this app (Desktop, Start Menu, pinned Start/taskbar tiles) at the chosen icon. */
function updateShortcuts(icoPath) {
  const exe = (process.env.PORTABLE_EXECUTABLE_FILE || process.execPath).toLowerCase();
  let updated = 0;
  for (const dir of shortcutDirs()) {
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.lnk')); } catch { continue; }
    for (const name of names) {
      const file = path.join(dir, name);
      try {
        const info = shell.readShortcutLink(file);
        if (String(info.target || '').toLowerCase() === exe) {
          if (shell.writeShortcutLink(file, 'update', { icon: icoPath, iconIndex: 0 })) updated += 1;
        }
      } catch { /* not ours / unreadable */ }
    }
  }
  return updated;
}

/**
 * Changes the icon embedded in the launcher exe. A running exe cannot be overwritten but it CAN be renamed, so a
 * patched copy is made (rcedit, shipped in resources/tools), the running file is renamed aside and the copy takes
 * its place. The next launch uses the new icon; nothing has to wait for the app to exit. Installed builds only;
 * every failure rolls back and is only logged.
 */
function patchLauncherIcon(icoPath, id) {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_FILE) return false;
  const rcedit = path.join(process.resourcesPath, 'tools', 'rcedit.exe');
  if (!fs.existsSync(rcedit) || !fs.existsSync(icoPath)) return false;
  const exe = process.execPath;
  const base = path.basename(exe, '.exe');
  const patched = path.join(path.dirname(exe), `${base}.icon-patch.exe`);
  const old = path.join(path.dirname(exe), `${base}.old.exe`);
  try { fs.rmSync(patched, { force: true }); fs.rmSync(old, { force: true }); } catch { /* an older copy may still be locked; ignored */ }
  fs.copyFile(exe, patched, (copyError) => {
    if (copyError) return log('WARN', `launcher icon: could not copy the exe (${copyError.message})`);
    execFile(rcedit, [patched, '--set-icon', icoPath], { windowsHide: true, timeout: 60000 }, (rcError) => {
      if (rcError) { fs.rm(patched, { force: true }, () => undefined); return log('WARN', `launcher icon: rcedit failed (${rcError.message})`); }
      try {
        fs.renameSync(exe, old);
        try {
          fs.renameSync(patched, exe);
        } catch (swapError) {
          fs.renameSync(old, exe); // roll back so the app is never left without its exe
          throw swapError;
        }
        logoPref.exe = id;
        savePrefs();
        log('INFO', 'launcher exe icon updated');
        execFile(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'ie4uinit.exe'), ['-show'], { windowsHide: true }, () => undefined);
      } catch (error) {
        fs.rm(patched, { force: true }, () => undefined);
        log('WARN', `launcher icon: could not swap the exe (${error.message})`);
      }
    });
  });
  return true;
}

/** Removes leftovers of a previous launcher icon swap (the old exe is unlocked once its process has ended). */
function cleanupLauncherSwap() {
  try {
    const exe = process.execPath;
    const base = path.basename(exe, '.exe');
    for (const name of [`${base}.old.exe`, `${base}.icon-patch.exe`]) fs.rmSync(path.join(path.dirname(exe), name), { force: true });
  } catch { /* locked or missing: ignored */ }
}

function applyLogo(id, { startup } = {}) {
  if (!LOGO_IDS.includes(id)) return;
  logoPref.id = id;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setIcon(logoImage(id, false));
  if (tray) tray.setImage(logoImage(id, true));
  if (logoPref.applied === id) { if (!startup) savePrefs(); return; } // shortcuts + exe already match
  try {
    const dir = path.join(paths.dataRoot, 'logos');
    fs.mkdirSync(dir, { recursive: true });
    const ico = path.join(dir, `${id}.ico`);
    fs.copyFileSync(logoFile(id, '.ico'), ico);
    const n = updateShortcuts(ico);
    // the build already embeds the classic icon, so the exe is only touched when the chosen logo differs from it
    const patched = id !== logoPref.exe && patchLauncherIcon(ico, id);
    logoPref.applied = id;
    savePrefs();
    log('INFO', `logo "${id}" applied: window, tray, ${n} shortcut(s)${patched ? ', launcher exe icon' : ''}`);
  } catch (error) {
    log('WARN', `could not apply logo files: ${error.message}`);
  }
}

// ---- IPC (only trusted local pages may call these)
function trusted(event) {
  try {
    return Boolean(serverUrl) && new URL(event.senderFrame.url).origin === new URL(serverUrl).origin;
  } catch { return false; }
}

function registerIpc() {
  const on = (channel, fn) => ipcMain.on(channel, (event, ...args) => { if (trusted(event)) fn(event, ...args); });
  on('wt:minimize', () => { if (mainWindow) mainWindow.minimize(); });
  on('wt:toggle-maximize', () => setMaximized(!customMaximized));
  on('wt:close', () => { if (mainWindow) mainWindow.close(); });
  on('wt:resize-start', (_e, dir) => startResize(String(dir)));
  on('wt:resize-end', () => stopResize());
  on('wt:show-in-folder', (_e, p) => {
    if (typeof p === 'string' && path.isAbsolute(p) && fs.existsSync(p)) shell.showItemInFolder(p);
  });
  on('wt:apply-shell', (_e, incoming) => {
    if (!incoming || typeof incoming !== 'object') return;
    const before = JSON.stringify(prefs);
    for (const k of Object.keys(prefs)) if (typeof incoming[k] === 'boolean') prefs[k] = incoming[k];
    if (JSON.stringify(prefs) !== before) {
      savePrefs();
      applyLoginItem();
    }
  });
  on('wt:open-main', (_e, p) => {
    if (trayWindow && !trayWindow.isDestroyed()) trayWindow.hide();
    showMain(typeof p === 'string' && p.startsWith('/') ? p : '/');
  });
  on('wt:tray-close', () => { if (trayWindow && !trayWindow.isDestroyed()) trayWindow.hide(); });
  on('wt:quit', () => quitReally());
  on('wt:set-logo', (_e, id) => applyLogo(String(id)));
  ipcMain.handle('wt:is-maximized', (event) => (trusted(event) ? customMaximized : false));
}

// ---- file downloads (exports): report exactly where the user saved them
function registerDownloads() {
  session.defaultSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: `Save export - ${APP_NAME}`, defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
    item.once('done', (_e, state) => {
      const payload = { state: state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted', path: item.getSavePath(), name: item.getFilename() };
      log('INFO', `download ${payload.state}: ${payload.path || '(no path)'}`);
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('wt:download', payload);
    });
  });
}

// ---------------------------------------------------------------- lifecycle

function logEnvironment(serverFile, serverDir) {
  log('INFO', `================ ${APP_NAME} startup ================`);
  log('INFO', `app version=${app.getVersion()} electron=${process.versions.electron} chrome=${process.versions.chrome} node=${process.versions.node}`);
  log('INFO', `packaged=${app.isPackaged} platform=${process.platform} arch=${process.arch} os=${os.release()}`);
  log('INFO', `resourcesPath=${process.resourcesPath} cwd=${process.cwd()}`);
  log('INFO', `serverDir=${serverDir} serverFile=${serverFile}`);
  log('INFO', `dataRoot=${paths.dataRoot} database=${paths.dbDir} logs=${paths.logDir}`);
  if (dataMigrationNote) log('INFO', dataMigrationNote);
  log('INFO', `logo=${logoPref.id} applied=${logoPref.applied || '(none)'}`);
  log('INFO', `desktop prefs=${JSON.stringify(prefs)} args=${JSON.stringify(process.argv.slice(1))}`);
}

async function startWatchTower() {
  prepareDirectories();
  cleanupLauncherSwap();
  log('INFO', `single-instance lock acquired pid=${process.pid}`);
  const serverDir = getServerDirectory();
  logEnvironment(path.join(serverDir, 'server.js'), serverDir);
  const serverFile = validateServerBundle(serverDir);
  const agentFile = resolveAgentFile();

  const { port, health } = await startServerWithRetry(serverDir, serverFile, agentFile);
  log('INFO', `health: ${JSON.stringify(health)}`);

  startMonitor(agentFile);
  const verified = await verifyAgentHeartbeat();
  if (!verified) {
    monitoringState = 'unavailable';
    log('ERROR', 'monitoring agent did not report a heartbeat; dashboard will open with monitoring unavailable');
  }

  registerIpc();
  registerDownloads();
  // Opens in the tray ONLY when the "Launch in the system tray" option is on; otherwise in front of the user.
  const hidden = prefs.startMinimized;
  createWindow({ hidden });
  createTray();
  // 2.0: desktop notifications (focus, limits, weekly report) and the update flow
  v2host.init({
    app, Notification, shell, dialog, ipcMain,
    getServerUrl: () => serverUrl,
    getDataRoot: () => dataRoot,
    showMain,
    quitReally,
    trusted,
    sendToMain: (channel, payload) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload); },
    log,
  });
  applyLogo(logoPref.id, { startup: true });
  if (prefs.launchAtStartup) applyLoginItem();
  if (hidden) log('INFO', 'started minimized to the tray');
  log('INFO', `WatchTower dashboard ready url=${serverUrl} port=${port} serverPid=${server && server.pid} agentPid=${agent && agent.pid} monitoring=${monitoringState}`);

  if (!verified) {
    dialog.showMessageBox({
      type: 'warning',
      title: `${APP_NAME} monitoring unavailable`,
      message: `${APP_NAME} opened, but application monitoring is not running yet.`,
      detail: `The Windows monitoring agent did not report in. New activity may not be recorded.\n\nDiagnostic log:\n${paths.agentLog}`,
      buttons: ['Open log folder', 'Continue'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    }).then((r) => { if (r.response === 0) shell.openPath(logDir); }).catch(() => undefined);
  }

  powerMonitor.on('suspend', () => log('INFO', 'system suspending'));
  powerMonitor.on('resume', async () => {
    log('INFO', 'system resumed; checking local server');
    try {
      const res = await httpJson(`${serverUrl}/api/health`);
      log(res.status === 200 ? 'INFO' : 'ERROR', `post-resume health status=${res.status}`);
    } catch (error) {
      log('ERROR', `post-resume health check failed: ${error.message}`);
    }
  });
}

function shutdown() {
  if (shutdownPromise) return shutdownPromise;
  isQuitting = true;
  shutdownPromise = (async () => {
    log('INFO', 'shutdown requested');
    stopResize();
    try { if (tray) tray.destroy(); } catch { /* ignore */ }
    try { if (trayWindow && !trayWindow.isDestroyed()) trayWindow.destroy(); } catch { /* ignore */ }
    if (serverUrl && server && !server.exited) {
      await httpPost(`${serverUrl}/api/ingest`, { kind: 'none', source: 'agent', reason: 'chronos-closed', at: new Date().toISOString() });
    }
    if (agent && agent.child && !agent.exited) {
      await killTree(agent.pid);
      log('INFO', 'agent stopped');
    }
    await stopServer(server);
    log('INFO', 'shutdown complete');
    if (startupLog) await new Promise((r) => startupLog.end(r));
    if (agentLog) await new Promise((r) => agentLog.end(r));
  })().catch(() => undefined);
  return shutdownPromise;
}

process.on('uncaughtException', (error) => log('ERROR', `uncaughtException: ${error && error.stack ? error.stack : error}`));
process.on('unhandledRejection', (reason) => log('ERROR', `unhandledRejection: ${reason && reason.stack ? reason.stack : reason}`));

app.setName(APP_NAME);
app.setAppUserModelId('com.chronos.usage-monitor');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // A running instance will show itself; this process must not start a second server.
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (argv.includes('--quit')) {
      // "WatchTower.exe --quit" shuts the running instance down gracefully, even when it is hidden in the tray.
      log('INFO', 'quit requested by a second launch (--quit)');
      quitReally();
      return;
    }
    log('INFO', 'second launch detected; showing the existing window');
    showMain();
  });

  app.whenReady().then(async () => {
    try {
      await startWatchTower();
    } catch (error) {
      if (!startupLog) {
        dialog.showErrorBox(`${APP_NAME} startup error`, `${error && error.message ? error.message : String(error)}`);
      } else {
        showStartupFailure(error);
      }
      await shutdown();
      app.exit(1);
    }
  });

  app.on('before-quit', (event) => {
    if (shutdownPromise) return;
    event.preventDefault();
    void shutdown().finally(() => app.quit());
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
