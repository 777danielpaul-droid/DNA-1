#!/usr/bin/env node
const http = require('http');

const PORT = Number(process.env.PRIS_REMOTE_PORT || 8790);
let BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
let ALLOWED_IDS = new Set((process.env.TELEGRAM_ALLOWED_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean));
let DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
let DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
let DISCORD_ALLOWED_IDS = new Set((process.env.DISCORD_ALLOWED_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean));
let DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '';
const MAX_BUFFER = 256 * 1024;
const pending = [];
const seen = new Set();
let telegramOffset = 0;
let telegramRunning = false;
let discordSocket = null;
let discordHeartbeat = null;
let discordReconnectTimer = null;

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > MAX_BUFFER) reject(new Error('Request too large')); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
async function telegram(method, body = {}) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Telegram HTTP ${r.status}`);
  const data = await r.json();
  if (!data.ok) throw new Error(data.description || 'Telegram API error');
  return data.result;
}
async function discordSend(text) {
  if (!DISCORD_WEBHOOK_URL) throw new Error('DISCORD_WEBHOOK_URL fehlt');
  const r = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text })
  });
  if (!r.ok) throw new Error(`Discord HTTP ${r.status}`);
}
function enqueue(message) {
  if (seen.has(message.id)) return;
  seen.add(message.id);
  pending.push({ ...message, receivedAt: new Date().toISOString() });
  while (pending.length > 100) pending.shift();
}

function discordRest(path, options = {}) {
  return fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, 'content-type': 'application/json', ...(options.headers || {}) },
  });
}

async function discordSendMessage(channelId, text) {
  if (!DISCORD_BOT_TOKEN || !channelId) throw new Error('Discord Bot ist nicht konfiguriert');
  const r = await discordRest(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: String(text || '').slice(0, 2000) }),
  });
  if (!r.ok) throw new Error(`Discord HTTP ${r.status}`);
}

function stopDiscord() {
  if (discordHeartbeat) clearInterval(discordHeartbeat);
  discordHeartbeat = null;
  if (discordSocket) { try { discordSocket.close(); } catch {} }
  discordSocket = null;
}

function startDiscord() {
  if (!DISCORD_BOT_TOKEN || discordSocket) return;
  try {
    discordSocket = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
    discordSocket.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data);
        if (packet.op === 10) {
          const interval = packet.d?.heartbeat_interval || 41250;
          if (discordHeartbeat) clearInterval(discordHeartbeat);
          discordHeartbeat = setInterval(() => discordSocket?.send(JSON.stringify({ op: 1, d: null })), interval);
          discordSocket.send(JSON.stringify({ op: 2, d: {
            token: DISCORD_BOT_TOKEN,
            intents: 1 | 512 | 4096 | 32768,
            properties: { os: process.platform, browser: 'pris-remote-agent', device: 'pris' },
          }}));
        } else if (packet.op === 0 && packet.t === 'MESSAGE_CREATE') {
          const msg = packet.d;
          if (!msg?.content || msg.author?.bot) return;
          const senderId = String(msg.author.id || '');
          if (DISCORD_ALLOWED_IDS.size && !DISCORD_ALLOWED_IDS.has(senderId)) return;
          enqueue({
            id: `discord:${msg.id}`,
            source: 'discord',
            senderId,
            senderName: msg.author?.global_name || msg.author?.username || senderId,
            text: msg.content,
            replyTo: { channelId: msg.channel_id },
          });
        } else if (packet.op === 7 || packet.op === 9) {
          try { discordSocket.close(); } catch {}
        }
      } catch (error) { console.error('[remote-agent] Discord packet:', error.message); }
    };
    discordSocket.onerror = (error) => console.error('[remote-agent] Discord socket error:', error.message || error);
    discordSocket.onclose = () => {
      if (discordHeartbeat) clearInterval(discordHeartbeat);
      discordHeartbeat = null;
      discordSocket = null;
      if (!discordReconnectTimer) {
        discordReconnectTimer = setTimeout(() => { discordReconnectTimer = null; startDiscord(); }, 5000);
      }
    };
  } catch (error) {
    console.error('[remote-agent] Discord start:', error.message);
    discordSocket = null;
  }
}

async function pollTelegram() {
  if (!BOT_TOKEN || telegramRunning) return;
  telegramRunning = true;
  try {
    const updates = await telegram('getUpdates', { offset: telegramOffset, timeout: 20, allowed_updates: ['message'] });
    for (const update of updates) {
      telegramOffset = update.update_id + 1;
      const msg = update.message;
      if (!msg || !msg.text) continue;
      const senderId = String(msg.from?.id ?? '');
      if (ALLOWED_IDS.size && !ALLOWED_IDS.has(senderId)) {
        await telegram('sendMessage', { chat_id: msg.chat.id, text: 'PRIS Remote: Dieser Absender ist nicht freigeschaltet.' }).catch(() => {});
        continue;
      }
      enqueue({
        id: `telegram:${update.update_id}`,
        source: 'telegram',
        senderId,
        senderName: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || senderId,
        text: msg.text,
        replyTo: { chatId: msg.chat.id },
      });
    }
  } catch (error) {
    console.error('[remote-agent] Telegram:', error.message);
  } finally {
    telegramRunning = false;
  }
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method === 'GET' && req.url === '/ping') return json(res, 200, {
    ok: true, telegram: Boolean(BOT_TOKEN), discord: Boolean(DISCORD_BOT_TOKEN || DISCORD_WEBHOOK_URL), pending: pending.length
  });
  if (req.method === 'GET' && req.url === '/messages') return json(res, 200, { ok: true, messages: pending });
  if (req.method === 'POST' && req.url === '/config') {
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      BOT_TOKEN = String(body.telegramToken || '');
      ALLOWED_IDS = new Set(String(body.telegramAllowedUserIds || '').split(',').map(s => s.trim()).filter(Boolean));
      DISCORD_BOT_TOKEN = String(body.discordBotToken || '');
      DISCORD_ALLOWED_IDS = new Set(String(body.discordAllowedUserIds || '').split(',').map(s => s.trim()).filter(Boolean));
      DISCORD_CHANNEL_ID = String(body.discordChannelId || '');
      stopDiscord();
      if (DISCORD_BOT_TOKEN) startDiscord();
      return json(res, 200, { ok: true, telegram: Boolean(BOT_TOKEN), discord: Boolean(DISCORD_BOT_TOKEN) });
    } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  }
  if (req.method === 'POST' && req.url === '/test') {
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      if (body.provider === 'telegram') {
        if (!body.telegramToken) throw new Error('Telegram Bot Token fehlt.');
        const r = await fetch(`https://api.telegram.org/bot${body.telegramToken}/getMe`);
        const data = await r.json();
        if (!r.ok || !data.ok) throw new Error(data.description || `Telegram HTTP ${r.status}`);
        return json(res, 200, { ok: true, message: `Telegram verbunden: @${data.result?.username || data.result?.first_name || 'Bot'}` });
      }
      if (body.provider === 'discord') {
        if (!body.discordBotToken) throw new Error('Discord Bot Token fehlt.');
        const r = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bot ${body.discordBotToken}` } });
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || `Discord HTTP ${r.status}`);
        return json(res, 200, { ok: true, message: `Discord verbunden: ${data.username || data.global_name || 'Bot'}` });
      }
      throw new Error('Unbekannter Social-Kanal');
    } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  }
  if (req.method === 'POST' && req.url === '/ack') {
    try {
      const { id } = JSON.parse(await readBody(req) || '{}');
      const index = pending.findIndex(m => m.id === id);
      if (index >= 0) pending.splice(index, 1);
      return json(res, 200, { ok: true });
    } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  }
  if (req.method === 'POST' && req.url === '/reply') {
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      if (body.channel === 'telegram' && body.replyTo?.chatId) {
        await telegram('sendMessage', { chat_id: body.replyTo.chatId, text: String(body.text || '').slice(0, 4096) });
      } else if (body.channel === 'discord' && body.replyTo?.channelId) {
        await discordSendMessage(body.replyTo.channelId, String(body.text || ''));
      } else throw new Error('Unbekannter Remote-Kanal');
      return json(res, 200, { ok: true });
    } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  }
  json(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[PRIS Remote] http://127.0.0.1:${PORT}`);
  console.log(`[PRIS Remote] Telegram: ${BOT_TOKEN ? 'aktiv' : 'nicht konfiguriert'} · Discord: ${DISCORD_BOT_TOKEN ? 'Bot aktiv' : DISCORD_WEBHOOK_URL ? 'Webhook aktiv' : 'nicht konfiguriert'}`);
});
setInterval(() => { if (BOT_TOKEN) pollTelegram(); }, 250);
if (DISCORD_BOT_TOKEN) startDiscord();
