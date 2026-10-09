import express from 'express';
import cors from 'cors';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startYoutubeChatPolling } from './youtubeChat.js';

// ---- Minimal .env loader (no dependency needed for this small server) ----
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT) || 8787;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const YOUTUBE_LIVE_VIDEO_ID = process.env.YOUTUBE_LIVE_VIDEO_ID || '';
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || '';

const app = express();
app.use(cors());
app.use(express.json());

// ---- In-memory state: recent chat + current vote tally ----
const bus = new EventEmitter();
bus.setMaxListeners(100);

const RECENT_MESSAGES_CAP = 200;
let recentMessages = [];
let voteTally = {}; // { [countryCode]: count }

bus.on('chat', (msg) => {
  recentMessages.push(msg);
  if (recentMessages.length > RECENT_MESSAGES_CAP) {
    recentMessages = recentMessages.slice(-RECENT_MESSAGES_CAP);
  }
});

bus.on('vote', ({ code, weight }) => {
  voteTally[code] = (voteTally[code] || 0) + (weight || 1);
});

let liveViewerCount = null;
bus.on('viewers', ({ count }) => {
  if (typeof count === 'number' && count >= 0) liveViewerCount = count;
});

// ---- SSE: GET /api/chat-stream ----
const sseClients = new Set();

app.get('/api/chat-stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

function broadcastChat(msg) {
  const payload = `data: ${JSON.stringify(msg)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}
bus.on('chat', broadcastChat);
bus.on('power', (p) => broadcastChat({ type: 'POWER', ...p, timestamp: new Date().toISOString() }));
bus.on('viewers', ({ count }) => broadcastChat({ type: 'VIEWER_COUNT', count }));

// Keep-alive ping so intermediary proxies don't time out idle SSE connections.
setInterval(() => {
  for (const client of sseClients) client.write(': ping\n\n');
}, 25000);

// ---- REST: votes ----
app.get('/api/votes', (req, res) => {
  res.json(voteTally);
});

app.post('/api/votes/reset', (req, res) => {
  voteTally = {};
  res.json({ ok: true });
});

const ttsCache = new Map();
app.get('/api/tts', async (req, res) => {
  const text = String(req.query.text || '').trim();
  if (!text) return res.status(400).send('Missing text parameter');
  if (text.length > 300) return res.status(400).send('Text too long');

  const cacheKey = text.toLowerCase();
  if (ttsCache.has(cacheKey)) {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(ttsCache.get(cacheKey));
  }

  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=${encodeURIComponent(text)}`;
    const ttsReq = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (ttsRes) => {
      if (ttsRes.statusCode !== 200) return res.status(502).send('TTS upstream error');
      const chunks = [];
      ttsRes.on('data', (c) => chunks.push(c));
      ttsRes.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (ttsCache.size > 200) ttsCache.delete(ttsCache.keys().next().value);
        ttsCache.set(cacheKey, buf);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(buf);
      });
    });
    ttsReq.on('error', (err) => res.status(500).send('TTS error: ' + err.message));
  } catch (err) {
    res.status(500).send('TTS error: ' + err.message);
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(YOUTUBE_API_KEY), messagesBuffered: recentMessages.length, viewerCount: liveViewerCount });
});

app.listen(PORT, () => {
  console.log(`[server] Flag Battle BFF listening on http://localhost:${PORT}`);
});

// ---- Start polling YouTube live chat (no-op gracefully if unconfigured) ----
startYoutubeChatPolling({
  apiKey: YOUTUBE_API_KEY,
  liveVideoId: YOUTUBE_LIVE_VIDEO_ID,
  channelId: YOUTUBE_CHANNEL_ID,
  bus,
});
