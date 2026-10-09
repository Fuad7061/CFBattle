// Polls the YouTube Data API v3 for live chat messages and turns them into
// events, emitted through the given EventEmitter-like `bus`:
//   bus.emit('chat', { id, author, text, timestamp, vote, power, superChat, tier })
//   bus.emit('vote', { code, countryName, weight, superChat, tier })
//   bus.emit('power', { power, code, countryName, weight, superChat, tier })
//   bus.emit('viewers', { count })   // real concurrent viewer count
//
// Hybrid economy: free comments vote and can trigger utility powers; Super
// Chats add a sub-linearly-scaled vote weight AND (at higher tiers) unlock
// the destructive/instant powers. See the root ./youtubeChat.js for the
// production copy of this same logic.
//
// Uses only Node's built-in fetch (Node 18+) — no extra HTTP client.
import { COUNTRY_CODES, COUNTRY_NAMES } from '../src/data/countries.js';

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';

// Names + aliases only for free-text scanning (bare 2-letter codes excluded so
// everyday words like "is"/"my" don't get counted as Iceland/Malaysia).
const NAME_TO_CODE = new Map();
const SCAN_TO_CODE = new Map();
for (const code of COUNTRY_CODES) {
  NAME_TO_CODE.set(code.toLowerCase(), code);
  const name = COUNTRY_NAMES[code];
  if (name) {
    const lower = name.toLowerCase();
    NAME_TO_CODE.set(lower, code);
    SCAN_TO_CODE.set(lower, code);
  }
}
const ALIASES = {
  usa: 'us', america: 'us', 'united states of america': 'us',
  uk: 'gb', britain: 'gb', england: 'gb', uae: 'ae', emirates: 'ae',
  korea: 'kr', 'south korea': 'kr', russia: 'ru',
};
for (const [alias, code] of Object.entries(ALIASES)) {
  NAME_TO_CODE.set(alias, code);
  SCAN_TO_CODE.set(alias, code);
}

function normalizeToken(s) {
  return String(s || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}
function findCountryName(code) {
  return COUNTRY_NAMES[code] || code;
}
function resolveCountry(candidate) {
  const words = normalizeToken(candidate).split(' ').filter(Boolean);
  for (let take = Math.min(4, words.length); take >= 1; take--) {
    const code = NAME_TO_CODE.get(words.slice(0, take).join(' '));
    if (code) return { code, countryName: findCountryName(code) };
  }
  return null;
}

const POWER_ALIASES = {
  shield: 'shield', save: 'shield', protect: 'shield', guard: 'shield', def: 'shield',
  revive: 'revive', resurrect: 'revive', respawn: 'revive', rez: 'revive',
  freeze: 'freeze', ice: 'freeze', frozen: 'freeze', stop: 'freeze', hold: 'freeze',
  quake: 'quake', earthquake: 'quake', shake: 'quake', crater: 'quake',
  slow: 'slow', slowmo: 'slow', 'slow-mo': 'slow', slomo: 'slow', slowdown: 'slow',
  nuke: 'nuke', eliminate: 'nuke', out: 'nuke', kill: 'nuke', destroy: 'nuke', wipe: 'nuke', boom: 'nuke',
  boost: 'boost', push: 'boost', steer: 'boost', charge: 'boost', rush: 'boost',
};
// 'slow' stays out of GLOBAL_POWERS so "slow US" targets that country; a
// bare "slow" / "!slow" still falls back to global slow-motion below.
const GLOBAL_POWERS = new Set(['quake']);
const NL_POWER_WORDS = [
  'shield', 'protect', 'save', 'revive', 'resurrect', 'freeze', 'ice',
  'quake', 'earthquake', 'slow', 'slowmo', 'slomo', 'nuke', 'eliminate',
  'destroy', 'boost',
];

// Parse into a VOTE or POWER (or null). Explicit `!command` accepts every
// alias; natural language (no `!`) only uses the curated NL_POWER_WORDS and
// scans comments for country names.
export function parseCommand(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  if (raw[0] === '!') {
    const m = raw.match(/^!([A-Za-z-]+)(?:\s+([\s\S]+))?$/);
    if (m) {
      const word = m[1].toLowerCase();
      const rest = m[2] || '';
      if (word === 'vote' || word === 'v' || word === 'c') {
        const target = resolveCountry(rest);
        return target ? { kind: 'vote', ...target } : null;
      }
      const power = POWER_ALIASES[word];
      if (power) {
        if (GLOBAL_POWERS.has(power)) return { kind: 'power', power, code: null, countryName: null };
        const target = resolveCountry(rest);
        if (target) return { kind: 'power', power, ...target };
        if (power === 'slow') return { kind: 'power', power, code: null, countryName: null };
        return null;
      }
    }
  }

  const normalized = normalizeToken(raw);
  const wordCount = normalized.split(' ').filter(Boolean).length;
  const powerMatch = normalized.match(new RegExp(`\\b(${NL_POWER_WORDS.join('|')})\\b`));
  if (powerMatch) {
    const power = POWER_ALIASES[powerMatch[1]];
    if (power) {
      if (GLOBAL_POWERS.has(power)) {
        if (raw[0] === '!' || wordCount <= 2) {
          return { kind: 'power', power, code: null, countryName: null };
        }
      } else {
        const idx = normalized.indexOf(powerMatch[0]);
        const target = resolveCountry(normalized.slice(idx + powerMatch[0].length)) ||
          resolveCountry(normalized.slice(0, idx)) ||
          resolveCountry(normalized.replace(new RegExp(`\\b${powerMatch[0]}\\b`, 'g'), ''));
        if (target) return { kind: 'power', power, ...target };
        if (power === 'slow' && (raw[0] === '!' || wordCount <= 2)) {
          return { kind: 'power', power, code: null, countryName: null };
        }
      }
    }
  }

  const words = normalized.split(' ').filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    for (let take = Math.min(4, words.length - i); take >= 1; take--) {
      const code = SCAN_TO_CODE.get(words.slice(i, i + take).join(' '));
      if (code) return { kind: 'vote', code, countryName: findCountryName(code) };
    }
  }
  return null;
}

export function parseVote(text) {
  const cmd = parseCommand(text);
  return cmd && cmd.kind === 'vote' ? { code: cmd.code, countryName: cmd.countryName } : null;
}

// Sub-linear vote weight (sqrt) so big Supers matter but can't buy a round.
const SUPERCHAT_VOTES_PER_UNIT = Number(process.env.SUPERCHAT_VOTES_PER_UNIT) || 12;
const MIN_SUPERCHAT_WEIGHT = 5;
const MAX_SUPERCHAT_WEIGHT = 300;
export function superChatWeight(amountMicros) {
  const units = Math.max(0, (amountMicros || 0) / 1_000_000);
  if (units <= 0) return MIN_SUPERCHAT_WEIGHT;
  return Math.min(MAX_SUPERCHAT_WEIGHT, Math.max(MIN_SUPERCHAT_WEIGHT, Math.round(Math.sqrt(units) * SUPERCHAT_VOTES_PER_UNIT)));
}
export function superChatTier(amountMicros) {
  const u = (amountMicros || 0) / 1_000_000;
  if (u >= 200) return 7;
  if (u >= 100) return 6;
  if (u >= 50) return 5;
  if (u >= 20) return 4;
  if (u >= 10) return 3;
  if (u >= 5) return 2;
  return 1;
}

async function ytFetch(path, params) {
  const url = new URL(`${YT_API_BASE}/${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YouTube API ${path} failed: ${res.status} ${res.statusText} ${body}`);
  }
  return res.json();
}

async function resolveLiveChatId({ apiKey, liveVideoId, channelId }) {
  let videoId = liveVideoId;
  if (!videoId && channelId) {
    const search = await ytFetch('search', {
      key: apiKey, channelId, eventType: 'live', type: 'video', part: 'id', maxResults: 1,
    });
    videoId = search.items?.[0]?.id?.videoId || null;
  }
  if (!videoId) return { videoId: null, liveChatId: null, concurrentViewers: null };
  const videos = await ytFetch('videos', { key: apiKey, id: videoId, part: 'liveStreamingDetails' });
  const details = videos.items?.[0]?.liveStreamingDetails || {};
  return {
    videoId,
    liveChatId: details.activeLiveChatId || null,
    concurrentViewers: details.concurrentViewers != null ? Number(details.concurrentViewers) : null,
  };
}

export function startYoutubeChatPolling({ apiKey, liveVideoId, channelId, bus, log = console }) {
  let stopped = false;
  let pageToken;
  let lastViewerFetch = 0;
  let viewerTimer = null;

  async function pollLoop() {
    if (stopped) return;
    if (!apiKey) {
      log.warn('[youtubeChat] YOUTUBE_API_KEY is not set — chat polling is disabled. See server/.env.example.');
      return;
    }

    let liveChatId;
    let videoId = liveVideoId;
    try {
      const resolved = await resolveLiveChatId({ apiKey, liveVideoId, channelId });
      liveChatId = resolved.liveChatId;
      videoId = resolved.videoId;
      if (resolved.concurrentViewers != null) bus.emit('viewers', { count: resolved.concurrentViewers });
    } catch (err) {
      log.error('[youtubeChat] Failed to resolve live chat id:', err.message);
      liveChatId = null;
    }

    if (!liveChatId) {
      log.info('[youtubeChat] No active live video/chat found yet — retrying in 30s.');
      if (!stopped) setTimeout(pollLoop, 30000);
      return;
    }

    log.info(`[youtubeChat] Connected to live chat ${liveChatId}. Polling for messages...`);
    if (viewerTimer) clearInterval(viewerTimer);
    const fetchViewers = async () => {
      if (stopped || !videoId) return;
      const now = Date.now();
      if (now - lastViewerFetch < 15000) return;
      lastViewerFetch = now;
      try {
        const v = await ytFetch('videos', { key: apiKey, id: videoId, part: 'liveStreamingDetails' });
        const c = v.items?.[0]?.liveStreamingDetails?.concurrentViewers;
        if (c != null) bus.emit('viewers', { count: Number(c) });
      } catch (err) { /* best-effort */ }
    };
    fetchViewers();
    viewerTimer = setInterval(fetchViewers, 15000);

    await pollMessages(liveChatId);
  }

  async function pollMessages(liveChatId) {
    if (stopped) return;
    try {
      const data = await ytFetch('liveChat/messages', {
        key: apiKey, liveChatId, part: 'snippet,authorDetails', pageToken,
      });
      pageToken = data.nextPageToken;

      for (const item of data.items || []) {
        const author = item.authorDetails?.displayName || 'unknown';
        const isSuperChat = item.snippet?.type === 'superChatEvent';
        const scDetails = item.snippet?.superChatDetails;
        const text = isSuperChat ? (scDetails?.userComment || '') : (item.snippet?.displayMessage || '');

        const command = parseCommand(text);
        const superChat = isSuperChat
          ? {
              amountMicros: scDetails?.amountMicros ? Number(scDetails.amountMicros) : 0,
              currency: scDetails?.currency || '',
              amountDisplayString: scDetails?.amountDisplayString || '',
              tier: scDetails?.tier ?? null,
            }
          : null;
        const superWeight = superChat ? superChatWeight(superChat.amountMicros) : 1;
        const tier = superChat ? superChatTier(superChat.amountMicros) : 0;

        let vote = null;
        let power = null;
        if (command && command.kind === 'vote') {
          vote = { code: command.code, countryName: command.countryName, weight: superWeight, superChat: Boolean(superChat), tier };
        } else if (command && command.kind === 'power') {
          const isNuke = command.power === 'nuke';
          const isInstantRevive = command.power === 'revive';
          if (superChat || (!isNuke && !isInstantRevive)) {
            power = { power: command.power, code: command.code, countryName: command.countryName, weight: superWeight, tier, superChat: Boolean(superChat) };
          } else if (isInstantRevive && command.code) {
            vote = { code: command.code, countryName: command.countryName, weight: 1, superChat: false, tier: 0 };
          }
        }

        const chatMessage = { id: item.id, author, text, timestamp: item.snippet?.publishedAt || new Date().toISOString(), vote, power, superChat, tier };
        bus.emit('chat', chatMessage);
        if (vote) bus.emit('vote', vote);
        if (power) bus.emit('power', power);
      }

      const interval = Math.max(2000, data.pollingIntervalMillis || 5000);
      if (!stopped) setTimeout(() => pollMessages(liveChatId), interval);
    } catch (err) {
      log.error('[youtubeChat] Polling error, retrying in 10s:', err.message);
      if (viewerTimer) { clearInterval(viewerTimer); viewerTimer = null; }
      if (!stopped) setTimeout(() => pollLoop(), 10000);
    }
  }

  pollLoop();

  return {
    stop() {
      stopped = true;
      if (viewerTimer) { clearInterval(viewerTimer); viewerTimer = null; }
    },
  };
}
