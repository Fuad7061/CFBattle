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
      if (code && words.every(other => other === w || /^\d+$/.test(other) || ['pls', 'please', 'vote', 'v', 'c', 'go', 'save', 'win', 'revive', 'flag'].includes(other))) {
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

function startYoutubeChatPolling({ apiKey, liveVideoId, channelId, bus, log = console, onStatus = () => {} }) {
  let stopped = false;
  let pageToken;
  let lastViewerFetch = 0;
  let viewerTimer = null;

  // Surface exactly where the chat pipeline is, so a silent failure in the
  // dashboard can be told apart from "nobody has typed anything yet".
  const report = (state, extra = {}) => {
    try {
      onStatus({ state, videoId: extra.videoId ?? null, liveChatId: extra.liveChatId ?? null, error: extra.error ?? null, at: Date.now() });
    } catch (e) { /* never let status reporting break polling */ }
  };

  async function pollLoop() {
    if (stopped) return;

    if (!apiKey) {
      log.warn('[youtubeChat] YOUTUBE_API_KEY is not set — chat polling is disabled.');
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
      log.error('[youtubeChat] Failed to resolve live chat id:', err.message);
      liveChatId = null;
      report('resolve-error', { error: err.message });
    }

    if (!liveChatId) {
      log.info('[youtubeChat] No active live video/chat found yet — retrying in 30s.');
      // Distinguish "not live yet" from "you configured the wrong kind of ID",
      // which is by far the most common cause of dead chat.
      const hint = !channelId
        ? 'No channel ID set. Use a Channel ID (starts with UC, 24 chars) so chat attaches to whatever is live.'
        : 'Channel has no active live broadcast right now. Chat will attach when you go live.';
      report('waiting', { error: hint });
      if (!stopped) setTimeout(pollLoop, 30000);
      return;
    }

    log.info(`[youtubeChat] Connected to live chat ${liveChatId}. Polling for messages...`);
    report('connected', { videoId, liveChatId });
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
          // User-friendly: free comments can trigger utility powers too
          // (slow/freeze/shield/quake/boost). Only the destructive NUKE and
          // the instant REVIVE are reserved for Super Chats; a free "revive X"
          // simply counts as a normal vote toward the regular revive threshold.
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
            // When viewers type "save <country>", also credit it as a vote toward reviving/saving
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

      // YouTube API default pollingIntervalMillis is typically 10000ms (10s), which makes live interaction feel sluggish.
      // Capping to ~2500ms (customizable via YOUTUBE_POLL_INTERVAL_MS) drastically reduces latency.
      const maxInterval = Number(process.env.YOUTUBE_POLL_INTERVAL_MS) || 2500;
      const interval = Math.min(maxInterval, Math.max(1500, data.pollingIntervalMillis || 5000));
      if (!stopped) {
        report('polling', { videoId, liveChatId });
        setTimeout(() => pollMessages(liveChatId, videoId), interval);
      }
    } catch (err) {
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
    },
  };
}

/**
 * One-shot diagnostic used by the dashboard "Test connection" button. Never
 * starts a polling loop and never emits to the bus.
 */
async function testYoutubeChatConnection({ apiKey, liveVideoId, channelId }) {
  if (!apiKey) {
    return { ok: false, state: 'no-api-key', message: 'No YouTube API key saved. Add one in Stream Config first.' };
  }
  if (!liveVideoId && !channelId) {
    return { ok: false, state: 'no-target', message: 'No Live Video ID or Channel ID saved.' };
  }

  // Quota is precious: probe `videos` with the explicit id first, then search.
  if (liveVideoId) {
    try {
      const v = await ytFetch('videos', { key: apiKey, id: liveVideoId, part: 'liveStreamingDetails' });
      const details = v.items?.[0]?.liveStreamingDetails;
      if (details?.activeLiveChatId) {
        return { ok: true, state: 'connected', videoId: liveVideoId, liveChatId: details.activeLiveChatId, message: 'Connected to this video\'s live chat.' };
      }
      const exists = !!v.items?.[0];
      if (!exists) {
        return { ok: false, state: 'bad-video', message: 'That video ID was not found. Check for typos.' };
      }
    } catch (err) {
      return { ok: false, state: 'api-error', message: err.message };
    }
  }

  if (channelId) {
    try {
      const search = await ytFetch('search', { key: apiKey, channelId, eventType: 'live', type: 'video', part: 'id', maxResults: 1 });
      const vid = search.items?.[0]?.id?.videoId;
      if (!vid) {
        return { ok: false, state: 'not-live', message: 'API key works, but this channel has no live broadcast right now. Chat will attach automatically when you go live.' };
      }
      const v = await ytFetch('videos', { key: apiKey, id: vid, part: 'liveStreamingDetails' });
      const details = v.items?.[0]?.liveStreamingDetails;
      if (details?.activeLiveChatId) {
        return { ok: true, state: 'connected', videoId: vid, liveChatId: details.activeLiveChatId, message: 'Found your current live broadcast and its chat.' };
      }
      return { ok: false, state: 'no-chat-id', message: 'A live video was found but YouTube returned no activeLiveChatId yet. Try again in a few seconds.' };
    } catch (err) {
      return { ok: false, state: 'api-error', message: err.message };
    }
  }

  return { ok: false, state: 'unknown', message: 'Could not determine chat status.' };
}

module.exports = { startYoutubeChatPolling, parseVote, parseCommand, superChatWeight, superChatTier, testYoutubeChatConnection };
