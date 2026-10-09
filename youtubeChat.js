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
  for (let i = 0; i < words.length; i++) {
    for (let take = Math.min(4, words.length - i); take >= 1; take--) {
      const candidate = words.slice(i, i + take).join(' ');
      const code = SCAN_TO_CODE.get(candidate);
      if (code) return { kind: 'vote', code, countryName: findCountryName(code) };
    }
  }

  // A lone 2-letter country CODE (e.g. "us", "bd") counts as a vote too. We
  // only accept it when it is the ENTIRE comment, so codes don't accidentally
  // match words buried inside sentences ("this is..." must not vote Iceland).
  if (words.length === 1) {
    const code = NAME_TO_CODE.get(words[0]);
    if (code) return { kind: 'vote', code, countryName: findCountryName(code) };
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
  let videoId = liveVideoId;

  if (!videoId && channelId) {
    const search = await ytFetch('search', {
      key: apiKey,
      channelId,
      eventType: 'live',
      type: 'video',
      part: 'id',
      maxResults: 1,
    });
    videoId = search.items?.[0]?.id?.videoId || null;
  }

  if (!videoId) return { videoId: null, liveChatId: null };

  const videos = await ytFetch('videos', {
    key: apiKey,
    id: videoId,
    part: 'liveStreamingDetails',
  });
  const liveChatId = videos.items?.[0]?.liveStreamingDetails?.activeLiveChatId || null;
  const concurrentViewers = videos.items?.[0]?.liveStreamingDetails?.concurrentViewers;
  return { videoId, liveChatId, concurrentViewers };
}

function startYoutubeChatPolling({ apiKey, liveVideoId, channelId, bus, log = console }) {
  let stopped = false;
  let pageToken;
  let lastViewerFetch = 0;
  let viewerTimer = null;

  async function pollLoop() {
    if (stopped) return;

    if (!apiKey) {
      log.warn('[youtubeChat] YOUTUBE_API_KEY is not set — chat polling is disabled.');
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
      log.error('[youtubeChat] Failed to resolve live chat id:', err.message);
      liveChatId = null;
    }

    if (!liveChatId) {
      log.info('[youtubeChat] No active live video/chat found yet — retrying in 30s.');
      if (!stopped) setTimeout(pollLoop, 30000);
      return;
    }

    log.info(`[youtubeChat] Connected to live chat ${liveChatId}. Polling for messages...`);
    // Refresh the live viewer count every ~15s while polling.
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

    await pollMessages(liveChatId);
  }

  async function pollMessages(liveChatId) {
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
            weight: superWeight,
            superChat: Boolean(superChat),
            tier,
          };
        } else if (command && command.kind === 'power') {
          // User-friendly: free comments can trigger utility powers too
          // (slow/freeze/shield/quake/boost). Only the destructive NUKE and
          // the instant REVIVE are reserved for Super Chats; a free "revive X"
          // simply counts as a normal vote toward the regular revive threshold.
          const isNuke = command.power === 'nuke';
          const isInstantRevive = command.power === 'revive';
          if (superChat || (!isNuke && !isInstantRevive)) {
            power = {
              power: command.power,
              code: command.code,
              countryName: command.countryName,
              weight: superWeight,
              tier,
              superChat: Boolean(superChat),
            };
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

module.exports = { startYoutubeChatPolling, parseVote, parseCommand, superChatWeight, superChatTier };
