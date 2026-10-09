let COUNTRIES;
try {
  COUNTRIES = require('./countries.js');
} catch (e) {
  COUNTRIES = require('./js/countries.js');
}

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';
const VOTE_RE = /^!vote\s+([A-Za-z]{2,20})\b/i;

const NAME_TO_CODE = new Map();
for (const country of COUNTRIES) {
  const code = country.code;
  const name = country.name;
  NAME_TO_CODE.set(code.toLowerCase(), code);
  if (name) NAME_TO_CODE.set(name.toLowerCase(), code);
}
// Common shorthand aliases
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
  if (!NAME_TO_CODE.has(alias)) {
    NAME_TO_CODE.set(alias, code);
  }
}

function resolveVoteTarget(rawToken) {
  const key = rawToken.trim().toLowerCase();
  return NAME_TO_CODE.get(key) || null;
}

function parseVote(text) {
  // First, check for explicit !vote command
  const match = text.match(VOTE_RE);
  if (match) {
    const afterCommand = text.slice(match.index + match[0].indexOf(match[1])).trim();
    const words = afterCommand.split(/\s+/);
    for (let take = Math.min(4, words.length); take >= 1; take--) {
      const candidate = words.slice(0, take).join(' ');
      const code = resolveVoteTarget(candidate);
      if (code) {
        const c = COUNTRIES.find(x => x.code === code);
        return { code, countryName: c ? c.name : code };
      }
    }
  }
  
  // If no !vote command, search the entire message for any country name
  const words = text.trim().split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    for (let take = Math.min(4, words.length - i); take >= 1; take--) {
      const candidate = words.slice(i, i + take).join(' ');
      const code = resolveVoteTarget(candidate);
      if (code) {
        const c = COUNTRIES.find(x => x.code === code);
        return { code, countryName: c ? c.name : code };
      }
    }
  }
  return null;
}

const SUPERCHAT_VOTES_PER_UNIT = Number(process.env.SUPERCHAT_VOTES_PER_UNIT) || 10;
const MIN_SUPERCHAT_WEIGHT = 10;

function superChatWeight(amountMicros) {
  const units = (amountMicros || 0) / 1_000_000;
  return Math.max(MIN_SUPERCHAT_WEIGHT, Math.round(units * SUPERCHAT_VOTES_PER_UNIT));
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
  return { videoId, liveChatId };
}

function startYoutubeChatPolling({ apiKey, liveVideoId, channelId, bus, log = console }) {
  let stopped = false;
  let pageToken;

  async function pollLoop() {
    if (stopped) return;

    if (!apiKey) {
      log.warn('[youtubeChat] YOUTUBE_API_KEY is not set — chat polling is disabled.');
      return;
    }

    let liveChatId;
    try {
      const resolved = await resolveLiveChatId({ apiKey, liveVideoId, channelId });
      liveChatId = resolved.liveChatId;
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

        const rawVote = parseVote(text);
        const superChat = isSuperChat
          ? {
              amountMicros: scDetails?.amountMicros ? Number(scDetails.amountMicros) : 0,
              currency: scDetails?.currency || '',
              amountDisplayString: scDetails?.amountDisplayString || '',
              tier: scDetails?.tier ?? null,
            }
          : null;

        const vote = rawVote
          ? {
              ...rawVote,
              weight: superChat ? superChatWeight(superChat.amountMicros) : 1,
              superChat: Boolean(superChat),
            }
          : null;

        const chatMessage = {
          id: item.id,
          author,
          text,
          timestamp: item.snippet?.publishedAt || new Date().toISOString(),
          vote,
          superChat,
        };
        bus.emit('chat', chatMessage);
        if (vote) bus.emit('vote', vote);
      }

      const interval = Math.max(2000, data.pollingIntervalMillis || 5000);
      if (!stopped) setTimeout(() => pollMessages(liveChatId), interval);
    } catch (err) {
      log.error('[youtubeChat] Polling error, retrying in 10s:', err.message);
      if (!stopped) setTimeout(() => pollLoop(), 10000);
    }
  }

  pollLoop();

  return {
    stop() {
      stopped = true;
    },
  };
}

module.exports = { startYoutubeChatPolling, parseVote };
