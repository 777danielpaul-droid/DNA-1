const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Kleine .env-Unterstützung ohne zusätzliche Dependency.
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

const root = path.resolve(__dirname, '..');
const bridgeUrl = 'http://127.0.0.1:8787/ping';
const vitePort = process.env.PRIS_PORT || '3000';

function isBridgeRunning() {
  return new Promise((resolve) => {
    const req = http.get(bridgeUrl, { timeout: 700 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

function startProcess(label, command, args) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });
  child.on('error', (error) => console.error(`[PRIS] ${label}-Start fehlgeschlagen:`, error.message));
  child.on('exit', (code, signal) => {
    if (label === 'Vite') {
      console.log(`[PRIS] Vite beendet (code=${code ?? 'null'}, signal=${signal ?? 'null'}).`);
      shutdown(code ?? 0);
    }
  });
  return child;
}

let bridgeProcess = null;
let remoteProcess = null;
let viteProcess = null;
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[PRIS] Beende Dev-Server und Terminal-Bridge...');
  if (viteProcess && !viteProcess.killed) viteProcess.kill();
  if (bridgeProcess && !bridgeProcess.killed) bridgeProcess.kill();
  if (remoteProcess && !remoteProcess.killed) remoteProcess.kill();
  setTimeout(() => process.exit(code), 150);
}

(async () => {
  const bridgeAlreadyRunning = await isBridgeRunning();
  if (bridgeAlreadyRunning) {
    console.log('[PRIS] Terminal-Bridge läuft bereits auf http://127.0.0.1:8787');
  } else {
    console.log('[PRIS] Starte Terminal-Bridge automatisch...');
    bridgeProcess = startProcess('Terminal-Bridge', process.execPath, [path.join(root, 'terminal-bridge', 'server.cjs')]);
  }

  console.log('[PRIS] Starte Remote-Agent (Telegram/Discord) auf http://127.0.0.1:8790 ...');
  remoteProcess = startProcess('Remote-Agent', process.execPath, [path.join(root, 'remote-agent', 'server.cjs')]);

  console.log(`[PRIS] Starte Vite auf http://localhost:${vitePort} (auch im WLAN erreichbar, siehe "Network:"-Zeile unten — für die JARVIS-Fernbedienung vom Handy nötig) ...`);
  viteProcess = startProcess('Vite', process.execPath, [
    path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host', '0.0.0.0',
    '--port', String(vitePort),
    '--strictPort',
  ]);
})().catch((error) => {
  console.error('[PRIS] Dev-Start fehlgeschlagen:', error);
  shutdown(1);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
