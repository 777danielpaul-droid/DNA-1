#!/usr/bin/env node
const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8787;
const TIMEOUT_MS = 30_000;
const MAX_BUFFER = 2 * 1024 * 1024;

function normalizePlatformCommand(cmd) {
  if (process.platform !== 'darwin') return cmd;
  const xdg = cmd.match(/^\s*xdg-open\s+(.+?)\s*$/);
  if (xdg) return `open ${xdg[1]}`;
  const chrome = cmd.match(/^\s*google-chrome(?:-stable)?\s+(.+?)\s*$/);
  if (chrome) return `open -a "Google Chrome" ${chrome[1]}`;
  return cmd;
}

function getShell() {
  if (process.platform !== 'win32') return '/bin/bash';
  // PowerShell is usually much better for modern Windows commands. Fall back to cmd.
  const ps = process.env.SystemRoot ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe` : null;
  return ps && fs.existsSync(ps) ? ps : 'cmd.exe';
}

function withCors(req, res) {
  const origin = req.headers.origin;
  // Browser access is restricted to local development origins instead of wildcard CORS.
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-PRIS-Ollama-Target');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > MAX_BUFFER) {
        reject(new Error('Request zu groß.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}


async function proxyOllama(targetUrl, options = {}) {
  const r = await fetch(targetUrl, options);
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { error: text || `HTTP ${r.status}` }; }
  return { status: r.status, body };
}

const server = http.createServer(async (req, res) => {
  withCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, cwd: process.cwd(), platform: process.platform }));
    return;
  }

  if (req.method === 'POST' && req.url === '/run') {
    try {
      const raw = await readBody(req);
      const { cmd, cwd } = JSON.parse(raw || '{}');
      if (!cmd || typeof cmd !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Kein gültiger "cmd" im Request-Body.' }));
        return;
      }

      const requestedCwd = typeof cwd === 'string' && cwd.trim() ? cwd.trim() : process.cwd();
      if (!fs.existsSync(requestedCwd) || !fs.statSync(requestedCwd).isDirectory()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: `Ungültiges Arbeitsverzeichnis: ${requestedCwd}` }));
        return;
      }

      const executableCommand = normalizePlatformCommand(cmd);
      console.log(`[terminal-bridge] Führe aus (${requestedCwd}): ${executableCommand}`);

      exec(executableCommand, {
        cwd: requestedCwd,
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        shell: getShell(),
        windowsHide: true,
      }, (error, stdout, stderr) => {
        const timedOut = Boolean(error && (error.killed || error.signal === 'SIGTERM'));
        const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: exitCode === 0,
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode,
          error: timedOut ? `Befehl nach ${TIMEOUT_MS / 1000}s abgebrochen.` : undefined,
        }));
      });
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    }
    return;
  }


  if ((req.method === 'GET' || req.method === 'POST') && req.url.startsWith('/ollama/')) {
    try {
      const rawPath = req.url.slice('/ollama'.length);
      let target = String(req.headers['x-pris-ollama-target'] || '').trim();
      // LOCAL is the default so the browser does not need to provide a custom target header.
      // CLOUD still supplies an explicit ollama.com target from the frontend.
      if (!target) target = 'http://127.0.0.1:11434';
      if (!/^https?:\/\//i.test(target)) throw new Error('Ungültige Ollama-Ziel-URL.');
      // Node/Undici can prefer IPv6 for localhost while Ollama may only listen on IPv4.
      // Normalize the local target so the bridge reaches the same endpoint as curl 127.0.0.1.
      try {
        const targetUrl = new URL(target);
        if (targetUrl.hostname === 'localhost') targetUrl.hostname = '127.0.0.1';
        target = targetUrl.toString().replace(/\/$/, '');
      } catch {
        throw new Error('Ungültige Ollama-Ziel-URL.');
      }
      const url = new URL(rawPath, target.endsWith('/') ? target : `${target}/`).toString();
      const headers = {};
      if (req.headers.authorization) headers.authorization = req.headers.authorization;
      headers.accept = 'application/json';
      if (req.method === 'POST') headers['content-type'] = 'application/json';
      const body = req.method === 'POST' ? await readBody(req) : undefined;
      const result = await proxyOllama(url, { method: req.method, headers, body });
      res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(result.body));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[terminal-bridge] Läuft auf http://127.0.0.1:${PORT} (nur lokal erreichbar)`);
  console.log(`[terminal-bridge] Working Directory: ${process.cwd()}`);
  console.log('[terminal-bridge] Strg+C zum Beenden.');
});
