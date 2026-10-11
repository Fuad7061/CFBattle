const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Default Audience Presets
const AUDIENCE_PRESETS = {
  viral: ["Brazil", "USA", "India", "Indonesia", "Mexico", "Vietnam", "Philippines", "Germany", "Argentina", "France", "Turkey", "Spain", "Japan", "South Korea", "United Kingdom", "Canada", "Bangladesh", "Pakistan", "Colombia", "Nigeria"],
  all: [
    "Brazil", "USA", "India", "Mexico", "Indonesia", "Germany", "France", "Argentina", "Japan", "United Kingdom",
    "Canada", "Italy", "Spain", "Australia", "South Korea", "Vietnam", "Philippines", "Turkey", "Poland", "Netherlands",
    "Saudi Arabia", "Switzerland", "Taiwan", "Sweden", "Belgium", "Thailand", "Ireland", "Austria", "Norway", "Nigeria",
    "Israel", "South Africa", "Egypt", "Denmark", "Singapore", "Malaysia", "Colombia", "Bangladesh", "Pakistan", "Chile",
    "Finland", "Romania", "Czech Republic", "Portugal", "New Zealand", "Peru", "Greece", "Iraq", "Ukraine", "Morocco", "Algeria"
  ],
  latam: ["Brazil", "Mexico", "Argentina", "Colombia", "Chile", "Peru", "Ecuador", "Guatemala", "Cuba", "Bolivia", "Dominican Republic", "Honduras", "Paraguay", "El Salvador", "Nicaragua", "Costa Rica", "Panama", "Uruguay"],
  asia: ["India", "Indonesia", "Vietnam", "Philippines", "Japan", "South Korea", "Pakistan", "Bangladesh", "Thailand", "Malaysia", "Singapore", "Nepal", "Sri Lanka", "Myanmar", "Cambodia", "Taiwan"],
  heroes: [
    "Spidey", "Batman", "Deadpool", "Iron Man", "Wolverine", "Thor", "Superman", "Joker",
    "Thanos", "Doctor Strange", "Venom", "Hulk", "Captain America", "Black Panther", "Flash", "Loki"
  ]
};

const DEFAULT_PREFIXES = ["", "", "", "Go ", "Vote ", "Team ", "Come on ", "Win ", "Let's go "];
const DEFAULT_SUFFIXES = ["", "", "", "!!", " ❤️", " 🏆", " 🚀", " 🔥", " 🥇", " 💥"];

// Session cache to prevent re-fetching live chat page on every single message
// Key: `${accountId}_${videoId}` -> { apiKey, clientVersion, sendParams, expiresAt }
const sessionCache = new Map();

// In-memory circular log buffer for Dashboard Live Activity Feed
const recentLogs = [];
function addLog(accountName, msg, status, detail = '') {
  const item = {
    id: Date.now() + Math.random().toString(36).slice(2, 6),
    time: new Date().toISOString(),
    accountName: accountName || 'System',
    msg: msg || '',
    status: status || 'info', // 'success' | 'warn' | 'error' | 'info'
    detail: String(detail || '')
  };
  recentLogs.unshift(item);
  if (recentLogs.length > 50) recentLogs.pop();
  return item;
}

/**
 * Universal cookie parser: handles Header string, JSON array, and Netscape format
 */
function normalizeCookies(raw) {
  if (!raw) return { cookieStr: '', sapisid: '', count: 0, hasAuth: false };
  const map = {};
  const text = String(raw).trim();

  // 1. JSON Array format (e.g. from Cookie-Editor / EditThisCookie extension)
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (item && item.name && item.value !== undefined) {
            map[item.name] = item.value;
          }
        }
      }
    } catch (e) {}
  }

  // 2. Semicolon-separated or Netscape tab-separated format
  if (Object.keys(map).length === 0) {
    const tokens = text.split(/;|\r?\n/);
    for (const token of tokens) {
      const trimmed = token.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Netscape tab-separated
      const tabs = trimmed.split(/\t+/);
      if (tabs.length >= 7) {
        map[tabs[5]] = tabs[6];
        continue;
      }

      // Key=Value pair
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim();
        if (k && v) map[k] = v;
      }
    }
  }

  const cookieStr = Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
  const sapisid = map['SAPISID'] || map['__Secure-3PAPISID'] || map['__Secure-1PAPISID'] || '';
  const hasAuth = !!(map['SID'] || map['LOGIN_INFO'] || map['SAPISID'] || map['__Secure-1PSID'] || map['__Secure-3PSID']);

  return {
    cookieStr,
    sapisid,
    count: Object.keys(map).length,
    hasAuth,
    map
  };
}

/**
 * Computes Google/YouTube SAPISIDHASH for standard InnerTube authentication
 */
function generateSapisidHash(sapisid, origin = 'https://www.youtube.com') {
  if (!sapisid) return '';
  const time = Math.floor(Date.now() / 1000);
  const hash = crypto.createHash('sha1').update(`${time} ${sapisid} ${origin}`).digest('hex');
  return `SAPISIDHASH ${time}_${hash}`;
}

/**
 * Recursively search any JSON structure for `sendLiveChatMessageEndpoint.params`
 */
function findSendParamsDeep(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.sendLiveChatMessageEndpoint && obj.sendLiveChatMessageEndpoint.params) {
    return obj.sendLiveChatMessageEndpoint.params;
  }
  for (const key of Object.keys(obj)) {
    try {
      const found = findSendParamsDeep(obj[key]);
      if (found) return found;
    } catch (e) {}
  }
  return null;
}

class YouTubeCommenterService {
  constructor() {
    this.dataFile = null;
    this.timer = null;
    this.activeAccountIndex = 0;
    this.isRunning = false;
    this.state = {
      settings: {
        enabled: false,
        targetVideoId: '',
        minDelay: 10,
        maxDelay: 25,
        audience: 'viral',
        customPrefixes: DEFAULT_PREFIXES,
        customSuffixes: DEFAULT_SUFFIXES,
        onlyWhenStreaming: false
      },
      accounts: []
    };
  }

  init({ dataDir }) {
    this.dataFile = path.join(dataDir, 'bot_accounts.json');
    this.loadState();
    if (this.state.settings.enabled) {
      this.start();
    }
  }

  loadState() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const raw = fs.readFileSync(this.dataFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.settings) this.state.settings = { ...this.state.settings, ...parsed.settings };
        if (Array.isArray(parsed.accounts)) this.state.accounts = parsed.accounts;
      }
    } catch (e) {
      console.error('[YouTubeCommenter] Failed to load state:', e.message);
    }
  }

  saveState() {
    try {
      const dir = path.dirname(this.dataFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.dataFile, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error('[YouTubeCommenter] Failed to save state:', e.message);
    }
  }

  getStateSanitized() {
    return {
      settings: this.state.settings,
      isRunning: this.isRunning,
      accounts: this.state.accounts.map(acc => {
        const norm = normalizeCookies(acc.cookies);
        return {
          id: acc.id,
          name: acc.name,
          enabled: !!acc.enabled,
          status: acc.status || 'ready',
          lastError: acc.lastError || null,
          lastPostedAt: acc.lastPostedAt || null,
          totalSent: acc.totalSent || 0,
          cookieSummary: {
            count: norm.count,
            hasAuth: norm.hasAuth,
            hasSapisid: !!norm.sapisid
          }
        };
      }),
      recentLogs: recentLogs.slice(0, 30)
    };
  }

  updateSettings(newSettings) {
    this.state.settings = { ...this.state.settings, ...newSettings };
    this.saveState();
    if (this.state.settings.enabled && !this.isRunning) {
      this.start();
    } else if (!this.state.settings.enabled && this.isRunning) {
      this.stop();
    }
    return this.getStateSanitized();
  }

  upsertAccount({ id, name, cookies, enabled }) {
    const existingIdx = this.state.accounts.findIndex(a => a.id === id);
    const norm = normalizeCookies(cookies);
    const accountData = {
      id: id || 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: (name || 'Account ' + (this.state.accounts.length + 1)).trim(),
      cookies: String(cookies || '').trim(),
      enabled: enabled !== undefined ? !!enabled : true,
      status: norm.hasAuth ? 'ready' : 'missing_auth',
      lastError: norm.hasAuth ? null : 'Cookies do not appear to contain Google/YouTube login tokens (SID/SAPISID).',
      lastPostedAt: null,
      totalSent: 0
    };

    if (existingIdx >= 0) {
      this.state.accounts[existingIdx] = {
        ...this.state.accounts[existingIdx],
        ...accountData,
        cookies: cookies ? String(cookies).trim() : this.state.accounts[existingIdx].cookies
      };
    } else {
      this.state.accounts.push(accountData);
    }

    this.saveState();
    addLog(accountData.name, 'Account saved', 'info', `${norm.count} cookies processed`);
    return this.getStateSanitized();
  }

  deleteAccount(id) {
    const idx = this.state.accounts.findIndex(a => a.id === id);
    if (idx >= 0) {
      const removed = this.state.accounts.splice(idx, 1)[0];
      this.saveState();
      addLog(removed.name, 'Account deleted', 'info');
    }
    return this.getStateSanitized();
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    addLog('System', 'VPS Auto-Commenter Worker Started', 'info', `Monitoring active accounts`);
    this.scheduleNextTick();
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    addLog('System', 'VPS Auto-Commenter Worker Stopped', 'info');
  }

  scheduleNextTick() {
    if (!this.isRunning) return;
    const min = Math.max(3, parseInt(this.state.settings.minDelay) || 10);
    const max = Math.max(min, parseInt(this.state.settings.maxDelay) || 25);
    const delayMs = Math.floor(Math.random() * (max - min + 1) + min) * 1000;

    this.timer = setTimeout(async () => {
      try {
        await this.executeTick();
      } catch (err) {
        console.error('[YouTubeCommenter] Tick error:', err);
      }
      if (this.isRunning) {
        this.scheduleNextTick();
      }
    }, delayMs);
  }

  getRandomMessage() {
    const audienceKey = this.state.settings.audience || 'viral';
    const countries = AUDIENCE_PRESETS[audienceKey] || AUDIENCE_PRESETS.viral;
    const country = countries[Math.floor(Math.random() * countries.length)];

    const prefixes = Array.isArray(this.state.settings.customPrefixes) && this.state.settings.customPrefixes.length
      ? this.state.settings.customPrefixes
      : DEFAULT_PREFIXES;
    const suffixes = Array.isArray(this.state.settings.customSuffixes) && this.state.settings.customSuffixes.length
      ? this.state.settings.customSuffixes
      : DEFAULT_SUFFIXES;

    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const s = suffixes[Math.floor(Math.random() * suffixes.length)];
    return (p + country + s).trim();
  }

  async executeTick() {
    const enabledAccounts = this.state.accounts.filter(a => a.enabled && a.cookies);
    if (enabledAccounts.length === 0) return;

    // Pick next account with round-robin
    this.activeAccountIndex = (this.activeAccountIndex + 1) % enabledAccounts.length;
    const account = enabledAccounts[this.activeAccountIndex];

    const targetVideoId = this.state.settings.targetVideoId;
    if (!targetVideoId) {
      return; // Waiting for stream ID
    }

    const message = this.getRandomMessage();
    await this.postComment(account, targetVideoId, message);
  }

  /**
   * Fetches the YouTube Live Chat popout page to obtain InnerTube API Key & Send Token
   */
  async getLiveChatSession(account, videoId) {
    const cacheKey = `${account.id}_${videoId}`;
    const cached = sessionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }

    const norm = normalizeCookies(account.cookies);
    if (!norm.cookieStr) throw new Error('Missing cookies for account ' + account.name);

    const popoutUrl = `https://www.youtube.com/live_chat?v=${videoId}&is_popout=1`;
    const res = await fetch(popoutUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': norm.cookieStr,
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!res.ok) {
      throw new Error(`Failed to load YouTube live chat (HTTP ${res.status})`);
    }

    const html = await res.text();

    // Check if YouTube rejected the login
    if (html.includes('accounts.google.com/ServiceLogin') || html.includes('Sign in to chat')) {
      throw new Error('Cookies expired or unauthenticated. YouTube returned "Sign in to chat".');
    }

    // Extract API Key
    const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":\s*"([^"]+)"/);
    const apiKey = apiKeyMatch ? apiKeyMatch[1] : 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

    // Extract Client Version
    const clientVerMatch = html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":\s*"([^"]+)"/);
    const clientVersion = clientVerMatch ? clientVerMatch[1] : '2.20240101.00.00';

    // Extract ytInitialData
    const dataMatch = html.match(/var ytInitialData\s*=\s*(\{.+?\});<\/script>/s) || html.match(/window\["ytInitialData"\]\s*=\s*(\{.+?\});<\/script>/s);
    if (!dataMatch) {
      throw new Error('Could not parse YouTube initial data from live chat page.');
    }

    let ytInitialData;
    try {
      ytInitialData = JSON.parse(dataMatch[1]);
    } catch (e) {
      throw new Error('Malformed ytInitialData JSON in live chat page.');
    }

    const sendParams = findSendParamsDeep(ytInitialData);
    if (!sendParams) {
      if (html.includes('Subscribers-only mode')) {
        throw new Error('Subscribers-only chat mode is active on this stream. Please subscribe with this account.');
      }
      if (html.includes('Create a channel')) {
        throw new Error('YouTube requires this Google account to have an active channel created to send chat messages.');
      }
      throw new Error('Could not locate live chat send token. Check if chat is enabled and account has permissions.');
    }

    const session = {
      apiKey,
      clientVersion,
      sendParams,
      sapisid: norm.sapisid,
      cookieStr: norm.cookieStr,
      expiresAt: Date.now() + 15 * 60 * 1000 // Cache for 15 minutes
    };

    sessionCache.set(cacheKey, session);
    return session;
  }

  /**
   * Sends a live chat message using pure Node.js HTTP InnerTube POST
   */
  async postComment(account, videoId, message) {
    try {
      const session = await this.getLiveChatSession(account, videoId);
      const authHeader = generateSapisidHash(session.sapisid);

      const endpoint = `https://www.youtube.com/youtubei/v1/live_chat/send_message?key=${session.apiKey}&prettyPrint=false`;
      const payload = {
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: session.clientVersion,
            originalUrl: `https://www.youtube.com/live_chat?v=${videoId}&is_popout=1`,
            platform: 'DESKTOP'
          }
        },
        params: session.sendParams,
        richMessage: {
          textSegments: [{ text: message }]
        }
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Cookie': session.cookieStr,
          'Authorization': authHeader,
          'X-Origin': 'https://www.youtube.com',
          'X-YouTube-Client-Name': '1',
          'X-YouTube-Client-Version': session.clientVersion
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && !data.error) {
        account.status = 'ready';
        account.lastError = null;
        account.lastPostedAt = new Date().toISOString();
        account.totalSent = (account.totalSent || 0) + 1;
        this.saveState();

        addLog(account.name, `Sent: "${message}"`, 'success', `HTTP 200 OK`);
        return { ok: true, message, account: account.name, data };
      } else {
        const errMsg = data.error?.message || `YouTube API error (HTTP ${res.status})`;
        account.status = 'error';
        account.lastError = errMsg;
        this.saveState();

        // Invalidate session cache if token issue
        sessionCache.delete(`${account.id}_${videoId}`);
        addLog(account.name, `Failed: "${message}"`, 'error', errMsg);
        return { ok: false, error: errMsg };
      }
    } catch (err) {
      account.status = 'error';
      account.lastError = err.message;
      this.saveState();
      sessionCache.delete(`${account.id}_${videoId}`);
      addLog(account.name, `Error sending comment`, 'error', err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * One-shot test for a single account
   */
  async testSingleAccount(accountId, customMessage) {
    const account = this.state.accounts.find(a => a.id === accountId);
    if (!account) return { ok: false, error: 'Account not found' };

    const videoId = this.state.settings.targetVideoId;
    if (!videoId) return { ok: false, error: 'Please set a YouTube Live Video ID first in the settings.' };

    const msg = customMessage || this.getRandomMessage();
    return await this.postComment(account, videoId, msg);
  }
}

module.exports = new YouTubeCommenterService();
