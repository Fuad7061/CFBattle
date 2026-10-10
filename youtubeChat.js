let COUNTRIES;
try {
  COUNTRIES = require('./countries.js');
} catch (e) {
  COUNTRIES = require('./js/countries.js');
}

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';
const VOTE_RE = /^!vote\s+([A-Za-z]{2,20})\b/i;

// Two maps on purpose:
//   NAME_TO_CODE — full lookup (codes + names + aliases) used by explicit
//                  commands like "!vote us" / "freeze USA".
//   SCAN_TO_CODE — names + aliases ONLY, used when scanning ordinary comments
//                  for a country mention. Bare 2-letter ISO codes are excluded
//                  here so everyday words ("is", "my", "in", "it") don't get
//                  mis-counted as Iceland/Malaysia/India/Italy.
const NAME_TO_CODE = new Map();
const SCAN_TO_CODE = new Map();
for (const country of COUNTRIES) {
  const code = country.code;
  const name = country.name;
  NAME_TO_CODE.set(code.toLowerCase(), code);
  if (name) {
    NAME_TO_CODE.set(name.toLowerCase(), code);
    SCAN_TO_CODE.set(name.toLowerCase(), code);
  }
}
// Common shorthand aliases (unambiguous, so safe for free-text scanning too)
const ALIASES = {
  'usa': 'us',
  'america': 'us',
  'united states of america': 'us',
  'uk': 'gb',
  'britain': 'gb',
  'england': 'gb',
  'uae': 'ae',
  'emirates': 'ae',
  'korea': 'kr',
  'south korea': 'kr',
  'russia': 'ru'
};
for (const [alias, code] of Object.entries(ALIASES)) {
  NAME_TO_CODE.set(alias, code);
  SCAN_TO_CODE.set(alias, code);
}

let LiveChat = null;
try {
  LiveChat = require('youtube-chat').LiveChat;
} catch (e) {
  LiveChat = null;
}

// Extract all Unicode flag emojis (Regional Indicator Symbol pairs \u{1F1E6}-\u{1F1FF})
function extractFlagEmojiCodes(text) {
  if (!text) return [];
  const matches = String(text).match(/[\u{1F1E6}-\u{1F1FF}]{2}/gu);
  if (!matches) return [];
  const codes = [];
  for (const m of matches) {
    const chars = [...m];
    if (chars.length === 2) {
      const c1 = chars[0].codePointAt(0) - 0x1F1E6 + 65;
      const c2 = chars[1].codePointAt(0) - 0x1F1E6 + 65;
      if (c1 >= 65 && c1 <= 90 && c2 >= 65 && c2 <= 90) {
        const code = (String.fromCharCode(c1) + String.fromCharCode(c2)).toLowerCase();
        if (NAME_TO_CODE.has(code)) codes.push(code);
      }
    }
  }
  return codes;
}

// Normalise a token: lowercase and strip punctuation (keeps letters/spaces).
function normalizeToken(s) {
  return String(s || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Command vocabulary. Free chat keeps voting (the whole message is scanned for
// a country name too, so casual comments also count). Super Chats additionally
// unlock POWER commands — this is the "hybrid" economy: paid messages give a
// sub-linearly scaled vote boost AND a special action, while free comments can
// still steer flags and (with `reviveVotes`, default 4) revive a country.
// ---------------------------------------------------------------------------
const POWER_ALIASES = {
  shield: 'shield', save: 'shield', protect: 'shield', guard: 'shield', def: 'shield',
  revive: 'revive', resurrect: 'revive', respawn: 'revive', rez: 'revive',
  freeze: 'freeze', ice: 'freeze', frozen: 'freeze', stop: 'freeze', hold: 'freeze',
  quake: 'quake', earthquake: 'quake', shake: 'quake', crater: 'quake',
  slow: 'slow', slowmo: 'slow', 'slow-mo': 'slow', slomo: 'slow', slowdown: 'slow',
  nuke: 'nuke', eliminate: 'nuke', out: 'nuke', kill: 'nuke', destroy: 'nuke', wipe: 'nuke', boom: 'nuke',
  boost: 'boost', push: 'boost', steer: 'boost', charge: 'boost', rush: 'boost',
};
// Powers that have no single target. 'slow' is kept OUT so that
// "slow US" can slow down just that country's flag; a bare "slow" /
// "!slow" still falls back to global slow-motion below.
const GLOBAL_POWERS = new Set(['quake']);

// Curated words that may trigger a power WITHOUT the `!` prefix (user-friendly
// natural language, e.g. "slow US" / "freeze USA"). Deliberately excludes
// ambiguous everyday words (stop/hold/out/push/bo...) so normal chat doesn't
// accidentally fire powers; those still work when written as `!stop` etc.
const NL_POWER_WORDS = [
  'shield', 'protect', 'save',
  'revive', 'resurrect',
  'freeze', 'ice',
  'quake', 'earthquake',
  'slow', 'slowmo', 'slomo',
  'nuke', 'eliminate', 'destroy',
  'boost',
];

function resolveVoteTarget(rawToken) {
  const key = normalizeToken(rawToken);
  return NAME_TO_CODE.get(key) || null;
}

function findCountryName(code) {
  const c = COUNTRIES.find(x => x.code === code);
  return c ? c.name : code;
}

function resolveCountry(candidate) {
  const words = normalizeToken(candidate).split(' ').filter(Boolean);
  for (let take = Math.min(4, words.length); take >= 1; take--) {
    const probe = words.slice(0, take).join(' ');
    const code = NAME_TO_CODE.get(probe);
    if (code) return { code, countryName: findCountryName(code) };
  }
  return null;
}

// Parse a message into a VOTE or a POWER (or null).
function parseCommand(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  // 1. Check for Unicode Flag Emojis anywhere in the message!
  const emojiCodes = extractFlagEmojiCodes(raw);
  if (emojiCodes.length > 0) {
    const primaryCode = emojiCodes[0];
    const countryName = findCountryName(primaryCode);

    // Check if accompanied by a power word, e.g. "freeze 🇺🇸", "!boost 🇧🇷"
    const normalized = normalizeToken(raw);
    const nlRe = new RegExp(`\\b(${NL_POWER_WORDS.join('|')})\\b`);
    const powerMatch = normalized.match(nlRe);
    if (powerMatch) {
      const power = POWER_ALIASES[powerMatch[1]];
      if (power && !GLOBAL_POWERS.has(power)) {
        return { kind: 'power', power, code: primaryCode, countryName };
      }
    }
    // Otherwise count each flag emoji as a vote
    return { kind: 'vote', code: primaryCode, countryName, count: emojiCodes.length };
  }

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
        if (GLOBAL_POWERS.has(power)) {
          return { kind: 'power', power, code: null, countryName: null };
        }
        const target = resolveCountry(rest);
        if (target) return { kind: 'power', power, ...target };
        // "!slow" with no country = global slow-motion.
        if (power === 'slow') return { kind: 'power', power, code: null, countryName: null };
        return null;
      }
      // Unknown !command — fall through to the name scan below.
    }
  }

  // No `!` command: check for a curated natural-language power verb, e.g.
  // "slow US", "freeze USA", "quake", "nuke Russia", "shield Canada".
  const normalized = normalizeToken(raw);
  const wordCount = normalized.split(' ').filter(Boolean).length;
  const nlRe = new RegExp(`\\b(${NL_POWER_WORDS.join('|')})\\b`);
  const powerMatch = normalized.match(nlRe);
  if (powerMatch) {
    const powerKey = powerMatch[1];
    const power = POWER_ALIASES[powerKey];
    if (power) {
      if (GLOBAL_POWERS.has(power)) {
        // Global powers need to be deliberate: explicit "!quake" or a short
        // trigger like "quake" — not buried in a sentence.
        if (raw[0] === '!' || wordCount <= 2) {
          return { kind: 'power', power, code: null, countryName: null };
        }
      }
      // Extract a country that follows the power word, else anywhere else.
      const idx = normalized.indexOf(powerMatch[0]);
      const restAfterPower = normalized.slice(idx + powerMatch[0].length);
      const beforePower = normalized.slice(0, idx);
      const target = resolveCountry(restAfterPower) ||
        resolveCountry(beforePower) ||
        resolveCountry(normalized.replace(new RegExp(`\\b${powerMatch[0]}\\b`, 'g'), ''));
      if (target) {
        return { kind: 'power', power, ...target };
      }
      // "slow" (short, no country) = global slow-motion.
      if (power === 'slow') {
        if (raw[0] === '!' || wordCount <= 2) {
          return { kind: 'power', power, code: null, countryName: null };
        }
      }
    }
  }

  // No recognisable command: scan the whole message for any country NAME, so
  // an ordinary comment like "go Brazil!!" still registers as a vote. Uses the
  // name-only map to avoid false positives from everyday 2-letter words.
  const words = normalized.split(' ').filter(Boolean);

  // Handle explicit "vote <country>" or "v <country>" without exclamation mark
  if ((words[0] === 'vote' || words[0] === 'v') && words.length > 1) {
    const target = resolveCountry(words.slice(1).join(' '));
    if (target) return { kind: 'vote', ...target };
  }

  for (let i = 0; i < words.length; i++) {
    for (let take = Math.min(4, words.length - i); take >= 1; take--) {
      const candidate = words.slice(i, i + take).join(' ');
      const code = SCAN_TO_CODE.get(candidate);
      if (code) return { kind: 'vote', code, countryName: findCountryName(code) };
    }
  }

  // A lone 2-letter country CODE (e.g. "us", "bd") counts as a vote.
  if (words.length === 1) {
    const code = NAME_TO_CODE.get(words[0]);
    if (code) return { kind: 'vote', code, countryName: findCountryName(code) };
  }

  // Support country code with numbers, repetition, or common cheer words
  // (e.g. "bd 1", "bd 2", "bd bd", "bd pls", "save bd", "go bd")
  // This allows viewers to bypass YouTube's strict duplicate-message filter.
  const AMBIGUOUS_WORDS = new Set(['is', 'in', 'it', 'at', 'to', 'no', 'so', 'am', 'be', 'do', 'my', 'me', 'by', 'as', 'an', 'if', 'or', 'on', 'all', 'the', 'and']);
  if (words.length <= 6) {
    for (const w of words) {
      if (AMBIGUOUS_WORDS.has(w)) continue;
      const code = NAME_TO_CODE.get(w);
      if (code && words.every(other => other === w || /^\d+$/.test(other) || ['pls', 'please', 'vote', 'v', 'c', 'go', 'save', 'win', 'revive', 'flag', 'support', 'team', 'come', 'on', 'love', 'for'].includes(other))) {
        const count = words.filter(other => other === w).length;
        return { kind: 'vote', code, countryName: findCountryName(code), count };
      }
    }
  }
  return null;
}

// Backwards-compatible vote-only parser (used by the dashboard test tool).
function parseVote(text) {
  const cmd = parseCommand(text);
  if (cmd && cmd.kind === 'vote') return { code: cmd.code, countryName: cmd.countryName };
  return null;
}

// --- Hybrid Super Chat economy -------------------------------------------
// Votes scale sub-linearly (sqrt) with the amount paid, so a large Super is
// clearly stronger than a free comment but can never trivially buy a round.
// Higher tiers additionally unlock a POWER token (see POWER_MIN_TIER).
const SUPERCHAT_VOTES_PER_UNIT = Number(process.env.SUPERCHAT_VOTES_PER_UNIT) || 12;
const MIN_SUPERCHAT_WEIGHT = 5;
const MAX_SUPERCHAT_WEIGHT = 300;

function superChatWeight(amountMicros) {
  const units = Math.max(0, (amountMicros || 0) / 1_000_000);
  if (units <= 0) return MIN_SUPERCHAT_WEIGHT;
  return Math.min(
    MAX_SUPERCHAT_WEIGHT,
    Math.max(MIN_SUPERCHAT_WEIGHT, Math.round(Math.sqrt(units) * SUPERCHAT_VOTES_PER_UNIT))
  );
}

// Approximate mapping to YouTube's 7 Super Chat colour tiers (whole units).
function superChatTier(amountMicros) {
  const u = (amountMicros || 0) / 1_000_000;
  if (u >= 200) return 7;
  if (u >= 100) return 6;
  if (u >= 50) return 5;
  if (u >= 20) return 4;
  if (u >= 10) return 3;
  if (u >= 5) return 2;
  return 1;
}

// Minimum Super Chat tier that also grants a POWER token, not just votes.
const POWER_MIN_TIER = Number(process.env.SUPERCHAT_POWER_MIN_TIER) || 3;

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
  // Try a specific video first (from settings), but if it has ended or its
  // chat is gone, fall back to the channel's CURRENT live broadcast — this is
  // what keeps the bot connected across 24/7 stream rotations.
  const tryVideo = async (vid) => {
    if (!vid) return null;
    try {
      const videos = await ytFetch('videos', { key: apiKey, id: vid, part: 'liveStreamingDetails' });
      const details = videos.items?.[0]?.liveStreamingDetails;
      if (details && details.activeLiveChatId) {
        return { videoId: vid, liveChatId: details.activeLiveChatId, concurrentViewers: details.concurrentViewers };
      }
    } catch (err) { /* fall through to channel search */ }
    return null;
  };

  const direct = await tryVideo(liveVideoId);
  if (direct) return direct;

  if (channelId) {
    try {
      const search = await ytFetch('search', {
        key: apiKey,
        channelId,
        eventType: 'live',
        type: 'video',
        part: 'id',
        maxResults: 1,
      });
      const found = await tryVideo(search.items?.[0]?.id?.videoId);
      if (found) return found;
    } catch (err) { /* no live right now */ }
  }

  return { videoId: null, liveChatId: null };
}

// Parse raw input (video ID, channel ID, or full YouTube URL) into clean identifiers
function parseYoutubeTarget(input) {
  if (!input || typeof input !== 'string') return { liveVideoId: null, channelId: null };
  const str = input.trim();
  if (!str) return { liveVideoId: null, channelId: null };

  // Direct channel ID (starts with UC, 24 chars)
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(str)) {
    return { liveVideoId: null, channelId: str };
  }
  // URL matching channel ID
  const chanMatch = str.match(/(?:youtube\.com\/(?:channel\/|c\/|user\/))(UC[a-zA-Z0-9_-]{22})/i);
  if (chanMatch) {
    return { liveVideoId: null, channelId: chanMatch[1] };
  }
  // URL matching live/
  const liveMatch = str.match(/(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/i);
  if (liveMatch) {
    return { liveVideoId: liveMatch[1], channelId: null };
  }
  // URL matching watch?v= or youtu.be/
  const watchMatch = str.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (watchMatch) {
    return { liveVideoId: watchMatch[1], channelId: null };
  }
  // Bare 11-char video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return { liveVideoId: str, channelId: null };
  }
  // Fallback: starts with UC
  if (str.startsWith('UC')) {
    return { liveVideoId: null, channelId: str };
  }
  return { liveVideoId: str, channelId: null };
}

/**
 * Zero-Quota High-Speed Live Chat engine powered by youtube-chat (Innertube web player API).
 * Never consumes Google Cloud API quota (0 Units) and provides sub-second live reaction tracking.
 */
function startLiveChatScraper({ liveVideoId, channelId, bus, log = console, onStatus = () => {} }) {
  let stopped = false;
  let liveChat = null;

  const report = (state, extra = {}) => {
    try {
      onStatus({
        state,
        mode: 'player',
        quotaUsed: 0,
        quotaLimit: 'Unlimited (0 Quota Units)',
        videoId: extra.videoId ?? liveVideoId ?? null,
        channelId: extra.channelId ?? channelId ?? null,
        liveChatId: 'zero-quota-innertube',
        error: extra.error ?? null,
        at: Date.now()
      });
    } catch (e) {}
  };

  async function start() {
    if (stopped) return;
    if (!LiveChat) {
      log.warn('[youtubeChat] youtube-chat package not available for zero-quota mode.');
      report('scraper-missing', { error: 'youtube-chat module not installed.' });
      return;
    }

    try {
      const opts = liveVideoId ? { liveId: liveVideoId } : { channelId };
      liveChat = new LiveChat(opts);

      liveChat.on('start', (liveId) => {
        log.info(`[youtubeChat] ⚡ Connected to stream ${liveId} via Zero-Quota High-Speed LiveChat engine (0 Quota Units, Unlimited 24/7).`);
        report('connected', { videoId: liveId });
      });

      liveChat.on('chat', (item) => {
        if (stopped) return;
        const author = item.author?.name || 'unknown';
        const avatar = item.author?.thumbnail?.url || null;
        const msgParts = (item.message || []).map(m => m.text || m.emojiText || '');
        const text = msgParts.join(' ').trim();
        const command = parseCommand(text);

        const isSuper = Boolean(item.superchat);
        let amountMicros = 0;
        let amountDisplayString = '';
        if (isSuper && item.superchat?.amount) {
          amountDisplayString = item.superchat.amount;
          const num = parseFloat(item.superchat.amount.replace(/[^0-9.]/g, '')) || 5;
          amountMicros = Math.round(num * 1_000_000);
        }

        const superChat = isSuper ? {
          amountMicros,
          currency: 'USD',
          amountDisplayString,
          tier: superChatTier(amountMicros),
        } : null;

        const superWeight = superChat ? superChatWeight(superChat.amountMicros) : 1;
        const tier = superChat ? superChatTier(superChat.amountMicros) : 0;

        let vote = null;
        let power = null;
        if (command && command.kind === 'vote') {
          vote = {
            code: command.code,
            countryName: command.countryName,
            weight: superWeight * (command.count || 1),
            superChat: Boolean(superChat),
            tier,
          };
        } else if (command && command.kind === 'power') {
          const isNuke = command.power === 'nuke';
          const isInstantRevive = command.power === 'revive';
          const isSave = command.power === 'shield';
          if (superChat || (!isNuke && !isInstantRevive)) {
            power = {
              power: command.power,
              code: command.code,
              countryName: command.countryName,
              weight: superWeight,
              tier,
              superChat: Boolean(superChat),
            };
            if (isSave && command.code) {
              vote = {
                code: command.code,
                countryName: command.countryName,
                weight: superWeight * (command.count || 1),
                superChat: Boolean(superChat),
                tier,
              };
            }
          } else if (isInstantRevive && command.code) {
            vote = {
              code: command.code,
              countryName: command.countryName,
              weight: 1,
              superChat: false,
              tier: 0,
            };
          }
        }

        const chatMessage = {
          id: `sc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          author,
          avatar,
          text,
          timestamp: item.timestamp ? new Date(item.timestamp).toISOString() : new Date().toISOString(),
          vote,
          power,
          superChat,
          tier,
        };
        bus.emit('chat', chatMessage);
        if (vote) bus.emit('vote', vote);
        if (power) bus.emit('power', power);
      });

      liveChat.on('error', (err) => {
        log.warn(`[youtubeChat] LiveChat warning: ${err.message}`);
        report('poll-error', { error: err.message });
      });

      liveChat.on('end', (reason) => {
        log.info(`[youtubeChat] LiveChat stream rotation/end: ${reason}`);
        report('ended', { error: reason });
        if (!stopped) setTimeout(start, 15000);
      });

      const ok = await liveChat.start();
      if (!ok) {
        log.info('[youtubeChat] Target broadcast is not active right now. Polling for live status every 15s...');
        report('waiting', { error: 'Broadcast offline or starting soon. Zero-Quota engine is armed and ready!' });
        if (!stopped) setTimeout(start, 15000);
      }
    } catch (e) {
      log.error(`[youtubeChat] LiveChat engine error: ${e.message}`);
      report('resolve-error', { error: e.message });
      if (!stopped) setTimeout(start, 15000);
    }
  }

  start();

  return {
    stop() {
      stopped = true;
      if (liveChat) {
        try { liveChat.stop(); } catch (e) {}
        liveChat = null;
      }
    }
  };
}

/**
 * Universal YouTube Chat Engine with Multi-Tier Fallback:
 * Modes:
 *   - 'player': Zero-Quota Innertube Web Player Engine (100% Free, 0 Quota Units, Unlimited 24/7, Sub-Second)
 *   - 'hybrid': Smart Hybrid (Zero-Quota Player for live chat + Google API for viewer count/metadata)
 *   - 'api': Official Google YouTube Data API v3 with automatic graceful fallback to Zero-Quota Player upon 403 quotaExceeded
 */
function startYoutubeChatPolling({
  apiKey,
  liveVideoId,
  channelId,
  chatMode = 'player',
  pollInterval = 1000,
  bus,
  log = console,
  onStatus = () => {}
}) {
  let stopped = false;
  let pageToken;
  let lastViewerFetch = 0;
  let viewerTimer = null;
  let scraperFallback = null;

  const report = (state, extra = {}) => {
    try {
      onStatus({
        state,
        mode: chatMode,
        videoId: extra.videoId ?? liveVideoId ?? null,
        channelId: extra.channelId ?? channelId ?? null,
        liveChatId: extra.liveChatId ?? null,
        quotaUsed: extra.quotaUsed ?? (chatMode === 'player' ? 0 : 'API Quota Active'),
        error: extra.error ?? null,
        at: Date.now()
      });
    } catch (e) {}
  };

  // 1. ZERO-QUOTA WEB PLAYER MODE (Recommended)
  if (chatMode === 'player') {
    if (!LiveChat) {
      log.warn('[youtubeChat] youtube-chat package missing for player mode.');
      report('scraper-missing', { error: 'youtube-chat package is not available.' });
      return { stop: () => {} };
    }
    if (!liveVideoId && !channelId) {
      log.warn('[youtubeChat] No YouTube target ID/URL provided for player mode.');
      report('no-target', { error: 'Please enter a Live Video ID, URL, or Channel ID.' });
      return { stop: () => {} };
    }
    log.info(`[youtubeChat] 🚀 Starting Zero-Quota Live Player Engine for target (${liveVideoId || channelId}) — 0 Google API quota consumed.`);
    scraperFallback = startLiveChatScraper({ liveVideoId, channelId, bus, log, onStatus });
    return {
      stop() {
        stopped = true;
        if (scraperFallback) {
          try { scraperFallback.stop(); } catch (e) {}
          scraperFallback = null;
        }
      }
    };
  }

  // 2. SMART HYBRID MODE
  if (chatMode === 'hybrid') {
    log.info(`[youtubeChat] 🔄 Starting Smart Hybrid Mode: Zero-Quota Player for sub-second chat + API for stream telemetry.`);
    scraperFallback = startLiveChatScraper({ liveVideoId, channelId, bus, log, onStatus });

    // Optional background viewer count fetch using API if key provided (only once per 30s = ~120 units/hour)
    if (apiKey && liveVideoId) {
      const fetchTelemetry = async () => {
        if (stopped) return;
        try {
          const v = await ytFetch('videos', { key: apiKey, id: liveVideoId, part: 'liveStreamingDetails' });
          const c = v.items?.[0]?.liveStreamingDetails?.concurrentViewers;
          if (c != null) bus.emit('viewers', { count: Number(c) });
        } catch (err) {
          // Graceful: never let viewer telemetry disrupt chat
        }
      };
      viewerTimer = setInterval(fetchTelemetry, 30000);
      fetchTelemetry();
    }

    return {
      stop() {
        stopped = true;
        if (viewerTimer) { clearInterval(viewerTimer); viewerTimer = null; }
        if (scraperFallback) {
          try { scraperFallback.stop(); } catch (e) {}
          scraperFallback = null;
        }
      }
    };
  }

  // 3. OFFICIAL GOOGLE YOUTUBE DATA API V3 MODE (with automatic Zero-Quota fallback on 403 quotaExceeded)
  async function pollLoop() {
    if (stopped) return;

    if (!apiKey) {
      log.warn('[youtubeChat] API mode requested but no API key provided — falling back to Zero-Quota Player engine.');
      if (LiveChat && (liveVideoId || channelId)) {
        scraperFallback = startLiveChatScraper({ liveVideoId, channelId, bus, log, onStatus });
        return;
      }
      report('no-api-key', { error: 'No YouTube API key configured.' });
      return;
    }

    let liveChatId;
    let videoId = liveVideoId;
    try {
      const resolved = await resolveLiveChatId({ apiKey, liveVideoId, channelId });
      liveChatId = resolved.liveChatId;
      videoId = resolved.videoId;
      if (resolved.concurrentViewers != null) {
        bus.emit('viewers', { count: Number(resolved.concurrentViewers) });
      }
    } catch (err) {
      if (err.message && (err.message.includes('quotaExceeded') || err.message.includes('403'))) {
        log.warn(`[youtubeChat] ⚠️ Google Data API quota exceeded during target resolution: ${err.message}. Engaging Zero-Quota Web Player fallback!`);
        if (LiveChat && (liveVideoId || channelId)) {
          scraperFallback = startLiveChatScraper({ liveVideoId, channelId, bus, log, onStatus });
          return;
        }
      }
      log.error('[youtubeChat] Failed to resolve live chat id:', err.message);
      liveChatId = null;
      report('resolve-error', { error: err.message });
    }

    if (!liveChatId) {
      log.info('[youtubeChat] No active live video/chat found yet via API — retrying in 30s.');
      const hint = !channelId
        ? 'No channel ID set. Use a Channel ID (starts with UC, 24 chars) so chat attaches to whatever is live.'
        : 'Channel has no active live broadcast right now. Chat will attach when you go live.';
      report('waiting', { error: hint });
      if (!stopped) setTimeout(pollLoop, 30000);
      return;
    }

    log.info(`[youtubeChat] Connected to Google API live chat ${liveChatId}. Polling every ${pollInterval}ms...`);
    report('connected', { videoId, liveChatId });

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
      } catch (err) { /* viewer count is best-effort */ }
    };
    fetchViewers();
    viewerTimer = setInterval(fetchViewers, 15000);

    await pollMessages(liveChatId, videoId);
  }

  async function pollMessages(liveChatId, videoId) {
    if (stopped) return;
    try {
      const data = await ytFetch('liveChat/messages', {
        key: apiKey,
        liveChatId,
        part: 'snippet,authorDetails',
        pageToken,
      });
      pageToken = data.nextPageToken;

      for (const item of data.items || []) {
        const author = item.authorDetails?.displayName || 'unknown';
        const avatar = item.authorDetails?.profileImageUrl || null;
        const isSuperChat = item.snippet?.type === 'superChatEvent';
        const scDetails = item.snippet?.superChatDetails;

        const text = isSuperChat
          ? (scDetails?.userComment || '')
          : (item.snippet?.displayMessage || '');

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
          vote = {
            code: command.code,
            countryName: command.countryName,
            weight: superWeight * (command.count || 1),
            superChat: Boolean(superChat),
            tier,
          };
        } else if (command && command.kind === 'power') {
          const isNuke = command.power === 'nuke';
          const isInstantRevive = command.power === 'revive';
          const isSave = command.power === 'shield';
          if (superChat || (!isNuke && !isInstantRevive)) {
            power = {
              power: command.power,
              code: command.code,
              countryName: command.countryName,
              weight: superWeight,
              tier,
              superChat: Boolean(superChat),
            };
            if (isSave && command.code) {
              vote = {
                code: command.code,
                countryName: command.countryName,
                weight: superWeight * (command.count || 1),
                superChat: Boolean(superChat),
                tier,
              };
            }
          } else if (isInstantRevive && command.code) {
            vote = {
              code: command.code,
              countryName: command.countryName,
              weight: 1,
              superChat: false,
              tier: 0,
            };
          }
        }

        const chatMessage = {
          id: item.id,
          author,
          avatar,
          text,
          timestamp: item.snippet?.publishedAt || new Date().toISOString(),
          vote,
          power,
          superChat,
          tier,
        };
        bus.emit('chat', chatMessage);
        if (vote) bus.emit('vote', vote);
        if (power) bus.emit('power', power);
      }

      // Respect user's chosen poll interval (e.g. 800ms / 1000ms / 2000ms)
      const requestedInterval = Number(pollInterval) || 1000;
      const interval = Math.max(800, requestedInterval);
      if (!stopped) {
        report('polling', { videoId, liveChatId });
        setTimeout(() => pollMessages(liveChatId, videoId), interval);
      }
    } catch (err) {
      if (err.message && (err.message.includes('quotaExceeded') || err.message.includes('403'))) {
        log.warn(`[youtubeChat] ⚠️ Google Data API Daily Quota Exceeded (10,000 unit limit reached). Automatically switching to Zero-Quota Web Player engine fallback!`);
        if (LiveChat && (liveVideoId || channelId)) {
          scraperFallback = startLiveChatScraper({ liveVideoId, channelId, bus, log, onStatus });
          return;
        }
      }
      log.error('[youtubeChat] Polling error, retrying in 10s:', err.message);
      report('poll-error', { error: err.message });
      if (viewerTimer) { clearInterval(viewerTimer); viewerTimer = null; }
      if (!stopped) setTimeout(() => pollLoop(), 10000);
    }
  }

  pollLoop();

  return {
    stop() {
      stopped = true;
      if (viewerTimer) { clearInterval(viewerTimer); viewerTimer = null; }
      if (scraperFallback) {
        try { scraperFallback.stop(); } catch (e) {}
        scraperFallback = null;
      }
    },
  };
}

/**
 * Diagnostic test used by the dashboard "Test connection" button.
 * Supports 'player', 'hybrid', and 'api' modes with precise health status.
 */
async function testYoutubeChatConnection({ apiKey, liveVideoId, channelId, chatMode = 'player' }) {
  // Normalize target using parser
  const parsed = parseYoutubeTarget(liveVideoId || channelId || '');
  const targetVideoId = parsed.liveVideoId || (liveVideoId && !liveVideoId.startsWith('UC') ? liveVideoId : null);
  const targetChannelId = parsed.channelId || channelId || (liveVideoId && liveVideoId.startsWith('UC') ? liveVideoId : null);

  // 1. ZERO-QUOTA WEB PLAYER DIAGNOSTIC
  if (chatMode === 'player') {
    if (!LiveChat) {
      return { ok: false, state: 'scraper-missing', message: 'The youtube-chat module is not installed on this server.' };
    }
    if (!targetVideoId && !targetChannelId) {
      return { ok: false, state: 'no-target', message: 'Please enter a Live Video ID, Video URL, or Channel ID.' };
    }

    try {
      const opts = targetVideoId ? { liveId: targetVideoId } : { channelId: targetChannelId };
      const probe = new LiveChat(opts);
      let errorMsg = null;
      probe.on('error', err => { errorMsg = err.message; });

      const isLive = await Promise.race([
        probe.start(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timed out after 6s')), 6000))
      ]);
      try { probe.stop(); } catch (e) {}

      if (isLive) {
        return {
          ok: true,
          state: 'connected',
          mode: 'player',
          quotaCost: 0,
          message: `⚡ Zero-Quota Web Player LIVE & CONNECTED! Attached to broadcast (${targetVideoId || targetChannelId}) with 0 Google Quota consumed.`
        };
      } else {
        return {
          ok: true,
          state: 'waiting',
          mode: 'player',
          quotaCost: 0,
          message: `⚡ Zero-Quota Engine ready for ${targetVideoId || targetChannelId}. Stream is offline or not live yet; engine will auto-connect the moment you go live!`
        };
      }
    } catch (err) {
      return {
        ok: false,
        state: 'probe-error',
        mode: 'player',
        message: `Zero-Quota Player probe: ${err.message || 'Stream not found'}. Double check your Video ID or URL.`
      };
    }
  }

  // 2. SMART HYBRID DIAGNOSTIC
  if (chatMode === 'hybrid') {
    if (!targetVideoId && !targetChannelId) {
      return { ok: false, state: 'no-target', message: 'Please enter a Live Video ID, Video URL, or Channel ID.' };
    }
    const playerResult = await testYoutubeChatConnection({ apiKey, liveVideoId: targetVideoId, channelId: targetChannelId, chatMode: 'player' });
    if (!apiKey) {
      return {
        ok: playerResult.ok,
        state: playerResult.state,
        mode: 'hybrid',
        message: `${playerResult.message} (Note: No API key provided for metadata, operating 100% on Zero-Quota Player).`
      };
    }
    return {
      ok: playerResult.ok,
      state: playerResult.state,
      mode: 'hybrid',
      message: `${playerResult.message} · Google API key loaded for metadata.`
    };
  }

  // 3. OFFICIAL GOOGLE DATA API V3 DIAGNOSTIC
  if (!apiKey) {
    return {
      ok: false,
      state: 'no-api-key',
      mode: 'api',
      message: 'No YouTube API key provided. Add an API key, or switch Chat Engine to "Zero-Quota Web Player" for 100% free mode.'
    };
  }
  if (!targetVideoId && !targetChannelId) {
    return { ok: false, state: 'no-target', mode: 'api', message: 'No Live Video ID or Channel ID saved.' };
  }

  if (targetVideoId) {
    try {
      const v = await ytFetch('videos', { key: apiKey, id: targetVideoId, part: 'liveStreamingDetails' });
      const details = v.items?.[0]?.liveStreamingDetails;
      if (details?.activeLiveChatId) {
        return {
          ok: true,
          state: 'connected',
          mode: 'api',
          videoId: targetVideoId,
          liveChatId: details.activeLiveChatId,
          message: `Connected via Google Data API v3 (Live Chat ID: ${details.activeLiveChatId}). Quota notice: 10,000 units/day (~33 mins at 1s polling). Auto-fallback shield is armed.`
        };
      }
      const exists = !!v.items?.[0];
      if (!exists) {
        return { ok: false, state: 'bad-video', mode: 'api', message: 'That video ID was not found on YouTube. Check for typos.' };
      }
      return { ok: false, state: 'not-live', mode: 'api', message: 'Video exists on YouTube, but activeLiveChatId is not active right now.' };
    } catch (err) {
      if (err.message && (err.message.includes('quotaExceeded') || err.message.includes('403'))) {
        return {
          ok: false,
          state: 'quota-exceeded',
          mode: 'api',
          message: '⚠️ Google API Daily Quota Exceeded (403)! Switch Chat Engine to "Zero-Quota Web Player" for unlimited free chat.'
        };
      }
      return { ok: false, state: 'api-error', mode: 'api', message: err.message };
    }
  }

  if (targetChannelId) {
    try {
      const search = await ytFetch('search', { key: apiKey, channelId: targetChannelId, eventType: 'live', type: 'video', part: 'id', maxResults: 1 });
      const vid = search.items?.[0]?.id?.videoId;
      if (!vid) {
        return { ok: false, state: 'not-live', mode: 'api', message: 'API key works, but this channel has no live broadcast right now. Chat will attach automatically when you go live.' };
      }
      const v = await ytFetch('videos', { key: apiKey, id: vid, part: 'liveStreamingDetails' });
      const details = v.items?.[0]?.liveStreamingDetails;
      if (details?.activeLiveChatId) {
        return { ok: true, state: 'connected', mode: 'api', videoId: vid, liveChatId: details.activeLiveChatId, message: 'Found current live broadcast and connected chat via Google API.' };
      }
      return { ok: false, state: 'no-chat-id', mode: 'api', message: 'A live video was found but activeLiveChatId is not ready yet.' };
    } catch (err) {
      if (err.message && (err.message.includes('quotaExceeded') || err.message.includes('403'))) {
        return {
          ok: false,
          state: 'quota-exceeded',
          mode: 'api',
          message: '⚠️ Google API Daily Quota Exceeded (403)! Switch Chat Engine to "Zero-Quota Web Player" for unlimited free chat.'
        };
      }
      return { ok: false, state: 'api-error', mode: 'api', message: err.message };
    }
  }

  return { ok: false, state: 'unknown', mode: 'api', message: 'Could not determine chat status.' };
}

module.exports = {
  startYoutubeChatPolling,
  parseVote,
  parseCommand,
  superChatWeight,
  superChatTier,
  testYoutubeChatConnection,
  parseYoutubeTarget
};
