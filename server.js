const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const https = require('https');
const { EventEmitter } = require('events');
const { startYoutubeChatPolling, testYoutubeChatConnection, parseYoutubeTarget } = require('./youtubeChat.js');
const { StreamScheduler } = require('./streamScheduler.js');
const commenter = require('./youtubeCommenter.js');

const app = express();
app.use(express.json());

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const LOG_FILE = path.join(DATA_DIR, 'stream.log');
const LOGIN_KEY = process.env.LOGIN_KEY || 'admin';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
commenter.init({ dataDir: DATA_DIR });

// Logger utility
function logMsg(msg, isError = false) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${isError ? 'ERROR' : 'INFO'}: ${msg}\n`;
    console.log(logLine.trim());
    try {
        fs.appendFileSync(LOG_FILE, logLine);
    } catch (e) {
        console.error("Could not write to log file", e);
    }
}

const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');

// Telemetry for real-time encoder health & speed (detects CPU bottlenecks early)
let streamTelemetry = {
    fps: 0,
    bitrate: '',
    speed: '0x',
    health: 'offline', // 'excellent' | 'fair' | 'struggling' | 'offline'
    lastUpdate: 0
};

// Ensure Linux PulseAudio connection points to local daemon
if (process.platform !== 'darwin' && !process.env.PULSE_SERVER) {
    process.env.PULSE_SERVER = '127.0.0.1:4713';
}

function createDefaultProfile(id = 'profile-default', name = 'Channel 1 - Primary', existing = {}) {
    return {
        id,
        name,
        color: existing.color || '#38bdf8',
        streamUrl: existing.streamUrl || '',
        streamKey: existing.streamKey || '',
        bitrate: existing.bitrate !== undefined ? Number(existing.bitrate) : 4500,
        fps: existing.fps !== undefined ? Number(existing.fps) : 30,
        preset: existing.preset || 'ultrafast',
        resolution: existing.resolution || '1080x1920',
        crop: existing.crop || { enabled: false, x: 0, y: 0, w: 1080, h: 1920 },
        activeEngine: existing.activeEngine || 'vertical',
        youtubeChatMode: existing.youtubeChatMode || 'player',
        youtubePollInterval: existing.youtubePollInterval !== undefined ? Number(existing.youtubePollInterval) : 500,
        youtubeApiKey: existing.youtubeApiKey || '',
        youtubeLiveId: existing.youtubeLiveId || '',
        youtubeChannelId: existing.youtubeChannelId || '',
        gameSettings: existing.gameSettings || {
            watermark: '@FlagBattleLive',
            speed: 1,
            rotSpeed: 0.015,
            gravity: 0.15,
            bias: false
        },
        schedulerConfig: existing.schedulerConfig || {
            enabled: false,
            mode: 'schedule',
            startAt: null,
            durationMinutes: 60,
            repeat: 'none',
            repeatDays: [],
            graceMinutes: 5
        },
        createdAt: existing.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

let profilesState = {
    activeProfileId: 'profile-default',
    profiles: []
};

function loadProfiles() {
    if (fs.existsSync(PROFILES_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
            if (Array.isArray(data.profiles) && data.profiles.length > 0) {
                profilesState = data;
                if (!profilesState.activeProfileId || !profilesState.profiles.find(p => p.id === profilesState.activeProfileId)) {
                    profilesState.activeProfileId = profilesState.profiles[0].id;
                }
                logMsg(`Loaded ${profilesState.profiles.length} stream profile(s) from persistent storage.`);
                return;
            }
        } catch (e) {
            logMsg(`Failed reading profiles.json: ${e.message}`, true);
        }
    }

    // Migration from legacy settings.json
    let legacySettings = {};
    if (fs.existsSync(SETTINGS_FILE)) {
        try {
            legacySettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        } catch (e) {}
    }
    const def = createDefaultProfile('profile-default', 'Channel 1 - Primary', legacySettings);
    profilesState = {
        activeProfileId: 'profile-default',
        profiles: [def]
    };
    saveProfiles();
    logMsg("Initialized default stream profile from settings.json.");
}

function saveProfiles() {
    try {
        fs.writeFileSync(PROFILES_FILE, JSON.stringify(profilesState, null, 2));
        const active = getActiveProfile();
        if (active) {
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(active, null, 2));
        }
    } catch (e) {
        logMsg(`Failed saving profiles.json: ${e.message}`, true);
    }
}

function getActiveProfile() {
    return profilesState.profiles.find(p => p.id === profilesState.activeProfileId) || profilesState.profiles[0];
}

function getProfileById(id) {
    if (!id) return getActiveProfile();
    return profilesState.profiles.find(p => p.id === id) || null;
}

loadProfiles();
let currentSettings = getActiveProfile();

// Active multi-stream runtime sessions (profileId -> session)
const activeSessions = new Map();

// Helper to provide active live stream target video IDs to Auto-Commenter
commenter.getActiveLiveTargets = () => {
    const targets = [];
    for (const [id, s] of activeSessions.entries()) {
        if (s.isStreaming && s.profile?.youtubeLiveId) {
            const { liveVideoId } = parseYoutubeTarget(s.profile.youtubeLiveId);
            if (liveVideoId && !targets.includes(liveVideoId)) targets.push(liveVideoId);
        }
    }
    return targets;
};

// Global legacy references proxy to active session for backwards compatibility
let streamProcess = null;
let browser = null;
let currentPage = null;
let isStreaming = false;
let isRecording = false;
let recordingProgress = null;
let liveViewerCount = null;

const schedulersMap = new Map();
const chatPollersMap = new Map();
const youtubeChatStatusMap = new Map();

function updateGlobalLegacyState() {
    isStreaming = Array.from(activeSessions.values()).some(s => s.isStreaming);
    isRecording = Array.from(activeSessions.values()).some(s => s.isRecording);
    const activeSess = activeSessions.get(profilesState.activeProfileId) || activeSessions.values().next().value;
    if (activeSess) {
        streamProcess = activeSess.streamProcess;
        browser = activeSess.browser;
        currentPage = activeSess.currentPage;
        streamTelemetry = activeSess.telemetry;
        liveViewerCount = activeSess.liveViewerCount;
    } else {
        streamProcess = null;
        browser = null;
        currentPage = null;
        streamTelemetry = { fps: 0, bitrate: '', speed: '0x', health: 'offline', lastUpdate: 0 };
        liveViewerCount = null;
    }
}

function getSchedulerForProfile(profileId) {
    const pid = profileId || profilesState.activeProfileId;
    if (!schedulersMap.has(pid)) {
        const schedFile = pid === 'default'
            ? path.join(DATA_DIR, 'schedule.json')
            : path.join(DATA_DIR, `schedule_${pid}.json`);
        const sched = new StreamScheduler({
            filePath: schedFile,
            tickMs: 15000,
            isStreaming: () => {
                const s = activeSessions.get(pid);
                return !!(s && (s.isStreaming || s.isRecording));
            },
            onStart: () => beginStream(pid),
            onStop: (reason) => endStream(pid, reason),
            onLog: (msg, isErr) => {
                const prof = getProfileById(pid);
                logMsg(`[${prof ? prof.name : pid}] ${msg}`, isErr);
            }
        });
        sched.load();
        sched.start();
        schedulersMap.set(pid, sched);
    }
    return schedulersMap.get(pid);
}

function getYoutubeChatStatusForProfile(profileId) {
    const pid = profileId || profilesState.activeProfileId;
    return youtubeChatStatusMap.get(pid) || { state: 'idle', mode: 'player', videoId: null, channelId: null, liveChatId: null, error: null, at: null };
}

function restartYoutubeChatForProfile(profile) {
    if (!profile) profile = getActiveProfile();
    if (!profile) return;
    const pid = profile.id;
    const existing = chatPollersMap.get(pid);
    if (existing) {
        try { existing.stop(); } catch(e){}
        chatPollersMap.delete(pid);
    }
    const chatMode = profile.youtubeChatMode || 'player';
    const pollInterval = Number(profile.youtubePollInterval) || 1000;
    const apiKey = profile.youtubeApiKey || process.env.YOUTUBE_API_KEY || '';
    const rawTarget = profile.youtubeLiveId || profile.youtubeChannelId || process.env.YOUTUBE_LIVE_VIDEO_ID || process.env.YOUTUBE_CHANNEL_ID || '';
    const { liveVideoId, channelId } = parseYoutubeTarget(rawTarget);

    const initialStatus = { state: 'starting', mode: chatMode, videoId: liveVideoId, channelId, liveChatId: null, error: null, at: Date.now() };
    youtubeChatStatusMap.set(pid, initialStatus);

    if (!liveVideoId && !channelId) {
        youtubeChatStatusMap.set(pid, {
            state: 'no-target',
            mode: chatMode,
            videoId: null,
            channelId: null,
            liveChatId: null,
            error: 'Please enter a Live Video ID, Video URL, or Channel ID in settings.',
            at: Date.now()
        });
        return;
    }

    if (chatMode === 'api' && !apiKey) {
        youtubeChatStatusMap.set(pid, {
            state: 'no-api-key',
            mode: chatMode,
            videoId: null,
            channelId: null,
            liveChatId: null,
            error: 'No YouTube API key configured. Switch to Zero-Quota Web Player for free unlimited mode.',
            at: Date.now()
        });
        return;
    }

    const profileBus = {
        emit: (event, data) => {
            if (event === 'chat') {
                const msgWithProfile = { ...data, profileId: pid };
                broadcastChat(msgWithProfile, pid);
                if (pid === profilesState.activeProfileId) bus.emit('chat', data);
            } else if (event === 'vote') {
                broadcastChat({ type: 'VOTE', ...data, profileId: pid }, pid);
                if (pid === profilesState.activeProfileId) bus.emit('vote', data);
            } else if (event === 'power') {
                broadcastChat({ type: 'POWER', ...data, profileId: pid, timestamp: new Date().toISOString() }, pid);
                if (pid === profilesState.activeProfileId) bus.emit('power', data);
            } else if (event === 'viewers') {
                const count = data?.count;
                const s = activeSessions.get(pid);
                if (s && typeof count === 'number') s.liveViewerCount = count;
                broadcastChat({ type: 'VIEWER_COUNT', count, profileId: pid }, pid);
                if (pid === profilesState.activeProfileId) bus.emit('viewers', data);
            }
        }
    };

    const poller = startYoutubeChatPolling({
        apiKey,
        liveVideoId,
        channelId,
        chatMode,
        pollInterval,
        bus: profileBus,
        onStatus: (s) => {
            const st = { ...s, mode: chatMode };
            youtubeChatStatusMap.set(pid, st);
            const sess = activeSessions.get(pid);
            if (sess) sess.youtubeChatStatus = st;
        },
        log: {
            info: msg => logMsg(`[${profile.name}] ${msg}`),
            warn: msg => logMsg(`[${profile.name}] ${msg}`, true),
            error: (msg, err) => logMsg(`[${profile.name}] ${msg} ${err || ''}`, true)
        }
    });
    chatPollersMap.set(pid, poller);
}

// Clean up stale temp recordings on boot to optimize storage
try {
    const recordDir = path.join(__dirname, 'recordings');
    if (fs.existsSync(recordDir)) {
        fs.readdirSync(recordDir).forEach(file => {
            if (file.endsWith('.mp4.tmp')) {
                fs.unlinkSync(path.join(recordDir, file));
                logMsg(`Cleaned up stale temp recording file: ${file}`);
            }
        });
    }
} catch (e) {
    logMsg("Error during temp recording cleanup: " + e.message, true);
}

// Auth Middleware
function checkAuth(req, res, next) {
    const key = req.headers['x-login-key'];
    if (key === LOGIN_KEY) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized. Invalid Login Key.' });
}

// Healthcheck endpoints (Public, no auth needed) for Coolify / Docker / Traefik
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', uptime: Math.floor(process.uptime()) }));
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok', uptime: Math.floor(process.uptime()) }));

// Serve Dashboard at /dashboard
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// API Routes
app.post('/api/login', (req, res) => {
    const { key } = req.body;
    if (key === LOGIN_KEY) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Invalid key' });
    }
});

app.get('/api/status', checkAuth, (req, res) => {
    const targetId = req.query.profileId || profilesState.activeProfileId;
    const profile = getProfileById(targetId) || getActiveProfile();
    const session = activeSessions.get(profile.id);
    const sched = getSchedulerForProfile(profile.id);

    let progress = null;
    if (session && session.isRecording && session.recordingProgress) {
        const elapsed = Date.now() - session.recordingProgress.startTime;
        progress = Math.min(100, Math.round((elapsed / session.recordingProgress.durationMs) * 100));
        if (elapsed > session.recordingProgress.durationMs + 30000) {
            logMsg(`[${profile.name}] Failsafe triggered: FFmpeg recording hung. Force killing...`);
            if (session.streamProcess) {
                try { session.streamProcess.kill('SIGKILL'); } catch(e){}
            }
            if (session.browser) { session.browser.close().catch(()=>{}); }
            activeSessions.delete(profile.id);
            progress = null;
        }
    }

    const isStreaming = !!(session && session.isStreaming);
    const isRecording = !!(session && session.isRecording);
    const streamTelemetry = session ? session.telemetry : { fps: 0, bitrate: '', speed: '0x', health: 'offline', lastUpdate: 0 };
    const liveViewerCount = session ? session.liveViewerCount : null;

    res.json({
        activeProfileId: profilesState.activeProfileId,
        selectedProfileId: profile.id,
        isStreaming,
        isRecording,
        streamTelemetry,
        progress,
        viewerCount: liveViewerCount,
        settings: profile,
        schedule: sched ? sched.getState() : { enabled: false },
        youtubeChat: session ? session.youtubeChatStatus : getYoutubeChatStatusForProfile(profile.id),
        profiles: profilesState.profiles.map(p => {
            const s = activeSessions.get(p.id);
            return {
                id: p.id,
                name: p.name,
                color: p.color,
                activeEngine: p.activeEngine,
                youtubeLiveId: p.youtubeLiveId,
                watermark: p.gameSettings?.watermark,
                isStreaming: !!(s && s.isStreaming),
                isRecording: !!(s && s.isRecording),
                telemetry: s ? s.telemetry : { health: 'offline', speed: '0x', fps: 0 },
                viewerCount: s ? s.liveViewerCount : null,
                startedAt: s ? s.startedAt : null
            };
        }),
        allSessions: Array.from(activeSessions.values()).map(s => ({
            profileId: s.profileId,
            profileName: s.profileName,
            isStreaming: s.isStreaming,
            isRecording: s.isRecording,
            startedAt: s.startedAt,
            slot: s.slot,
            telemetry: s.telemetry,
            viewerCount: s.liveViewerCount,
            engine: s.profile?.activeEngine
        }))
    });
});

app.post('/api/settings', checkAuth, (req, res) => {
    const targetId = req.body.profileId || profilesState.activeProfileId;
    let profile = getProfileById(targetId) || getActiveProfile();
    const oldSettings = { ...profile };
    Object.assign(profile, req.body);
    delete profile.profileId;
    profile.updatedAt = new Date().toISOString();
    currentSettings = getActiveProfile();
    saveProfiles();
    logMsg(`[${profile.name}] Settings updated and saved to disk.`);

    const activeSession = activeSessions.get(profile.id);
    if (activeSession && (
        oldSettings.youtubeApiKey !== profile.youtubeApiKey ||
        oldSettings.youtubeLiveId !== profile.youtubeLiveId ||
        oldSettings.youtubeChannelId !== profile.youtubeChannelId ||
        oldSettings.youtubeChatMode !== profile.youtubeChatMode ||
        oldSettings.youtubePollInterval !== profile.youtubePollInterval
    )) {
        restartYoutubeChatForProfile(profile);
        if (profile.youtubeLiveId) {
            const { liveVideoId } = parseYoutubeTarget(profile.youtubeLiveId);
            if (liveVideoId) commenter.updateSettings({ targetVideoId: liveVideoId });
        }
    }

    broadcastChat({ type: 'SETTINGS_UPDATE', settings: profile.gameSettings || profile }, profile.id);
    res.json({ success: true, settings: profile });
});

// --- Multi-Stream Profiles Management API Routes ---
app.get('/api/profiles', checkAuth, (req, res) => {
    res.json({
        activeProfileId: profilesState.activeProfileId,
        profiles: profilesState.profiles,
        allSessions: Array.from(activeSessions.values()).map(s => ({
            profileId: s.profileId,
            profileName: s.profileName,
            isStreaming: s.isStreaming,
            isRecording: s.isRecording,
            startedAt: s.startedAt,
            slot: s.slot,
            telemetry: s.telemetry,
            viewerCount: s.liveViewerCount,
            engine: s.profile?.activeEngine
        }))
    });
});

app.post('/api/profiles', checkAuth, (req, res) => {
    const { id, name, color, ...rest } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Profile name is required' });

    let profile = id ? getProfileById(id) : null;
    if (profile) {
        Object.assign(profile, rest, { name: name.trim(), color: color || profile.color || '#38bdf8', updatedAt: new Date().toISOString() });
    } else {
        const newId = id || `profile-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        profile = createDefaultProfile(newId, name.trim(), rest);
        if (color) profile.color = color;
        profilesState.profiles.push(profile);
    }
    saveProfiles();
    currentSettings = getActiveProfile();
    res.json({ success: true, profile, profiles: profilesState.profiles, activeProfileId: profilesState.activeProfileId });
});

app.post('/api/profiles/switch', checkAuth, (req, res) => {
    const { profileId } = req.body;
    const found = getProfileById(profileId);
    if (!found) return res.status(404).json({ error: 'Profile not found' });
    profilesState.activeProfileId = found.id;
    currentSettings = found;
    saveProfiles();
    logMsg(`Switched active profile to "${found.name}" (${found.id}).`);
    res.json({ success: true, activeProfileId: found.id, profile: found });
});

app.post('/api/profiles/:id/duplicate', checkAuth, (req, res) => {
    const source = getProfileById(req.params.id);
    if (!source) return res.status(404).json({ error: 'Source profile not found' });
    const newId = `profile-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newProfile = JSON.parse(JSON.stringify(source));
    newProfile.id = newId;
    newProfile.name = `${source.name} (Copy)`;
    const colors = ['#38bdf8', '#e11d48', '#eab308', '#10b981', '#a855f7', '#ec4899', '#f97316'];
    newProfile.color = colors[profilesState.profiles.length % colors.length];
    newProfile.createdAt = new Date().toISOString();
    newProfile.updatedAt = new Date().toISOString();
    profilesState.profiles.push(newProfile);
    saveProfiles();
    logMsg(`Duplicated profile "${source.name}" -> "${newProfile.name}".`);
    res.json({ success: true, profile: newProfile, profiles: profilesState.profiles });
});

app.delete('/api/profiles/:id', checkAuth, async (req, res) => {
    if (profilesState.profiles.length <= 1) {
        return res.status(400).json({ error: 'Cannot delete the only remaining profile.' });
    }
    const idx = profilesState.profiles.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Profile not found' });

    if (activeSessions.has(req.params.id)) {
        await endStream(req.params.id, 'profile deleted');
    }

    const removed = profilesState.profiles.splice(idx, 1)[0];
    if (profilesState.activeProfileId === removed.id) {
        profilesState.activeProfileId = profilesState.profiles[0].id;
        currentSettings = profilesState.profiles[0];
    }
    saveProfiles();
    logMsg(`Deleted profile "${removed.name}". Active profile is now "${profilesState.activeProfileId}".`);
    res.json({ success: true, removed, profiles: profilesState.profiles, activeProfileId: profilesState.activeProfileId });
});

// Let the director verify the chat pipeline with precise mode testing
app.post('/api/youtube-chat-test', checkAuth, async (req, res) => {
    const profile = (req.body.profileId ? getProfileById(req.body.profileId) : null) || getActiveProfile();
    const chatMode = req.body.chatMode || profile.youtubeChatMode || 'player';
    const apiKey = (req.body.apiKey !== undefined && req.body.apiKey !== '') ? req.body.apiKey : (profile.youtubeApiKey || process.env.YOUTUBE_API_KEY || '');
    const rawTarget = (req.body.target !== undefined && req.body.target !== '') ? req.body.target : (profile.youtubeLiveId || profile.youtubeChannelId || process.env.YOUTUBE_LIVE_VIDEO_ID || process.env.YOUTUBE_CHANNEL_ID || '');
    const { liveVideoId, channelId } = parseYoutubeTarget(rawTarget);
    try {
        const result = await testYoutubeChatConnection({ apiKey, liveVideoId, channelId, chatMode });
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, state: 'error', message: err.message });
    }
});

app.get('/api/youtube-chat-status', checkAuth, (req, res) => {
    const targetId = req.query.profileId || profilesState.activeProfileId;
    res.json(getYoutubeChatStatusForProfile(targetId));
});

// --- VPS YouTube Live Auto-Commenter API Routes ---
app.get('/api/bot/state', checkAuth, (req, res) => {
    const state = commenter.getStateSanitized();
    if (!state.settings.targetVideoId && currentSettings.youtubeLiveId) {
        const { liveVideoId } = parseYoutubeTarget(currentSettings.youtubeLiveId);
        if (liveVideoId) state.settings.targetVideoId = liveVideoId;
    }
    res.json(state);
});

app.post('/api/bot/settings', checkAuth, (req, res) => {
    const updated = commenter.updateSettings(req.body);
    res.json(updated);
});

app.post('/api/bot/accounts', checkAuth, (req, res) => {
    const updated = commenter.upsertAccount(req.body);
    res.json(updated);
});

app.delete('/api/bot/accounts/:id', checkAuth, (req, res) => {
    const updated = commenter.deleteAccount(req.params.id);
    res.json(updated);
});

app.post('/api/bot/toggle', checkAuth, (req, res) => {
    const newEnabled = !commenter.isRunning;
    const updated = commenter.updateSettings({ enabled: newEnabled });
    res.json(updated);
});

app.post('/api/bot/test/:id', checkAuth, async (req, res) => {
    const result = await commenter.testSingleAccount(req.params.id, req.body?.customMessage);
    res.json(result);
});

app.post('/api/bot/verify/:id', checkAuth, async (req, res) => {
    let videoId = req.body?.videoId || commenter.state?.settings?.targetVideoId;
    if (!videoId && currentSettings.youtubeLiveId) {
        const { liveVideoId } = parseYoutubeTarget(currentSettings.youtubeLiveId);
        videoId = liveVideoId;
    }
    const result = await commenter.verifyAccount(req.params.id, videoId);
    res.json(result);
});

app.get('/api/logs', checkAuth, (req, res) => {
    try {
        if (!fs.existsSync(LOG_FILE)) return res.send("No logs yet.");
        const data = fs.readFileSync(LOG_FILE, 'utf8');
        const lines = data.split('\n').filter(Boolean);
        res.send(lines.slice(-200).join('\n'));
    } catch (err) {
        res.status(500).send("Error reading logs");
    }
});

app.post('/api/logs/clear', checkAuth, (req, res) => {
    try {
        fs.writeFileSync(LOG_FILE, '');
        logMsg("Logs cleared by user.");
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to clear logs' });
    }
});

/**
 * Returns optimized, ultra-lightweight Puppeteer arguments for headless Linux/VPS execution.
 * Strips out unnecessary Chromium background services to minimize CPU usage.
 */
function allocateSlotForProfile(profileId) {
    const usedSlots = new Set();
    for (const [id, s] of activeSessions.entries()) {
        if (s.slot !== undefined && s.slot !== null) usedSlots.add(s.slot);
    }
    for (let i = 0; i < 4; i++) {
        if (!usedSlots.has(i)) return i;
    }
    return -1;
}

/**
 * Returns optimized, ultra-lightweight Puppeteer arguments for headless Linux/VPS execution.
 * Strips out unnecessary Chromium background services to minimize CPU usage.
 */
function getPuppeteerArgs(slot = 0) {
    const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--window-size=1080,1920',
        '--window-position=0,0',
        '--autoplay-policy=no-user-gesture-required',
        '--kiosk',
        '--js-flags="--max-old-space-size=512 --expose-gc"',
        '--renderer-process-limit=4',
        '--enable-features=CanvasOopRasterization',
        '--force-device-scale-factor=1',
        '--force-color-profile=srgb',
        '--disable-breakpad',
        '--disable-component-update',
        '--disable-ipc-flooding-protection',
        '--disable-features=CalculateNativeWinOcclusion,TranslateUI,Translate,MediaRouter,OptimizationHints,AudioServiceSandbox,InterestFeedContentSuggestions,BackForwardCache,MediaEngagementBypassAutoplayPolicies,PreloadMediaEngagementData,Autofill',
        '--enable-audio-service-sandbox=false',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-threaded-scrolling',
        '--disable-logging',
        '--disable-gpu-watchdog',
        '--disable-renderer-accessibility',
        '--disable-sync',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-hang-monitor',
        '--disable-domain-reliability',
        '--disable-client-side-phishing-detection',
        '--disable-speech-api',
        '--metrics-recording-only',
        '--password-store=basic',
        '--use-mock-keychain',
        '--disable-software-rasterizer'
    ];

    if (process.platform !== 'darwin' && !process.env.USE_GPU) {
        args.push('--disable-gpu');
    }

    if (process.platform !== 'darwin') {
        const displayNum = 99 + slot;
        args.push(`--display=:${displayNum}`);
    }

    return args;
}

/**
 * Boot the game in Chrome and push it to the RTMP endpoint for a specific profile.
 * Supports running multiple profiles concurrently with isolated virtual displays & PulseAudio sinks.
 */
async function beginStream(targetProfileId = null) {
    const profile = (targetProfileId ? getProfileById(targetProfileId) : null) || getActiveProfile();
    if (!profile) return { ok: false, error: 'Target profile not found' };

    if (activeSessions.has(profile.id)) {
        return { ok: false, error: `Channel "${profile.name}" is already streaming live.` };
    }
    if (!profile.streamUrl || !profile.streamKey) {
        return { ok: false, error: `Stream URL and Secret Key are required for "${profile.name}". Please set them in Stream Config.` };
    }

    const slot = allocateSlotForProfile(profile.id);
    if (slot === -1) {
        return { ok: false, error: 'Maximum concurrent streams (4) reached. Please stop an active channel first.' };
    }

    const displayStr = process.platform === 'darwin' ? ':0' : `:${99 + slot}`;
    const pulseSinkStr = `v${slot + 1}`;
    logMsg(`[${profile.name}] Starting broadcast session (Slot: ${slot}, Display: ${displayStr}, Audio: ${pulseSinkStr})...`);

    let sessionBrowser = null;
    let sessionPage = null;

    try {
        const defaultChrome = process.platform === 'darwin'
            ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
            : '/usr/bin/chromium';
        const chromeExecutable = process.env.CHROME_BIN || defaultChrome;

        const puppeteerArgs = getPuppeteerArgs(slot);
        const customEnv = {
            ...process.env,
            DISPLAY: displayStr,
            PULSE_SINK: pulseSinkStr
        };

        sessionBrowser = await puppeteer.launch({
            executablePath: chromeExecutable,
            headless: false,
            defaultViewport: { width: 1080, height: 1920 },
            args: puppeteerArgs,
            env: customEnv,
            ignoreDefaultArgs: ['--enable-automation']
        });

        sessionPage = await sessionBrowser.newPage();
        try { await sessionPage.setCacheEnabled(true); } catch(e) {}

        let queryParam = `?view=landscape&stream=true&headless=true&profile=${encodeURIComponent(profile.id)}`;
        if (profile.activeEngine === 'hero-tournament' || profile.activeEngine === 'multiverse') {
            queryParam = `?view=hero-tournament&stream=true&headless=true&profile=${encodeURIComponent(profile.id)}`;
        } else if (profile.activeEngine === 'points-race') {
            queryParam = `?view=points-race&stream=true&headless=true&profile=${encodeURIComponent(profile.id)}`;
        } else if (profile.activeEngine === 'vertical') {
            queryParam = `?view=vertical&stream=true&headless=true&profile=${encodeURIComponent(profile.id)}`;
        }

        const internalHost = process.env.INTERNAL_HOST || '127.0.0.1';
        const internalPort = process.env.PORT || 3000;
        const gameUrl = `http://${internalHost}:${internalPort}/${queryParam}`;
        logMsg(`[${profile.name}] Puppeteer navigating to ${gameUrl}`);

        await sessionPage.goto(gameUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        try {
            await sessionPage.waitForSelector('#game-canvas, canvas, #game-wrapper, #app', { timeout: 8000 });
        } catch (e) {}
        await new Promise(r => setTimeout(r, 800));

        if (profile.gameSettings) {
            await sessionPage.evaluate((s) => {
                window.applyGameSettings = function (gi, s) {
                    if (!gi || !s) return;
                    gi.cfg = { ...(gi.cfg || {}), ...s };
                    gi.settings = { ...(gi.settings || {}), ...s };
                    const speed = s.speed !== undefined ? Number(s.speed) : 1;
                    const rot = s.rotSpeed !== undefined ? Number(s.rotSpeed) : undefined;
                    const grav = s.gravity !== undefined ? Number(s.gravity) : undefined;

                    if (gi.settings) {
                        gi.settings.speedMult = speed;
                        if (rot !== undefined) gi.settings.rotSpeed = rot;
                        if (grav !== undefined) gi.settings.gravity = grav;
                    }
                    if (rot !== undefined && 'GATE_SPIN' in gi) gi.GATE_SPIN = rot;

                    if (gi.physics) {
                        if (gi.physics.setStepsPerFrame) gi.physics.setStepsPerFrame(speed);
                        if (rot !== undefined && gi.physics.setRotSpeed) gi.physics.setRotSpeed(rot);
                        if (grav !== undefined && gi.physics.setGravity) gi.physics.setGravity(grav);
                    }

                    if (s.watermark !== undefined) {
                        if (gi.ui?.setBranding) gi.ui.setBranding(s.watermark);
                        if (gi.ui?.setChannel) gi.ui.setChannel(s.watermark);
                    }
                    if (s.bias !== undefined) gi.audienceBias = s.bias;
                };

                window.__liveSettings = s;
                const setVal = (id, val) => {
                    const el = document.getElementById(id);
                    if (el && val !== undefined) {
                        el.value = val;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                };
                const setChk = (id, val) => {
                    const el = document.getElementById(id);
                    if (el && val !== undefined) {
                        el.checked = val;
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                };
                if (s.watermark !== undefined) setVal('setting-channel', s.watermark);
                if (s.rotSpeed !== undefined) setVal('setting-rot-speed', s.rotSpeed);
                if (s.gravity !== undefined) setVal('setting-gravity', s.gravity);
                if (s.bias !== undefined) setChk('setting-audience-bias', s.bias);
                const closeBtn = document.getElementById('settings-close');
                if (closeBtn) closeBtn.click();

                applyGameSettings(window.gameInstance, s);
                if (window.heroTournament && typeof window.heroTournament.setSettings === 'function') {
                    window.heroTournament.setSettings(s);
                }
                if (window.pointsRace && typeof window.pointsRace.setSettings === 'function') {
                    window.pointsRace.setSettings(s);
                }
            }, profile.gameSettings);
            logMsg(`[${profile.name}] Applied saved game settings.`);
        }

        // Auto-start gameplay and sound engine
        await sessionPage.evaluate(() => {
            const btn = document.getElementById('btn-start');
            if (btn && !btn.disabled) {
                btn.click();
            } else if (window.gameInstance && !window.gameInstance.running && typeof window.gameInstance.start === 'function') {
                window.gameInstance.start();
            }
            try {
                if (window.gameInstance && window.gameInstance.audio) {
                    if (typeof window.gameInstance.audio.playBgMusic === 'function') {
                        window.gameInstance.audio.playBgMusic();
                    }
                    const actx = window.gameInstance.audio._ctx ? window.gameInstance.audio._ctx() : null;
                    if (actx && actx.state === 'suspended') {
                        actx.resume().catch(() => {});
                    }
                }
            } catch (e) {}
        });
        logMsg(`[${profile.name}] Auto-started gameplay and sound engine.`);

        // Setup FFmpeg
        const filterParts = [];
        if (profile.crop && profile.crop.enabled) {
            const { w, h, x, y } = profile.crop;
            filterParts.push(`crop=${w}:${h}:${x}:${y}`);
        }
        if (profile.resolution === '720x1280') {
            filterParts.push('scale=720:1280');
        }
        filterParts.push('format=yuv420p');
        const videoFilter = filterParts.join(',');

        const bitrateVal = Number(profile.bitrate) || 4500;
        const bitrateStr = `${bitrateVal}k`;
        const bufsizeStr = `${bitrateVal * 2}k`;
        const fpsVal = Number(profile.fps) || 30;
        const presetVal = profile.preset || 'ultrafast';
        const rtmpUrl = (profile.streamUrl.endsWith('/') ? profile.streamUrl : profile.streamUrl + '/') + profile.streamKey;

        const totalCores = require('os').cpus()?.length || 4;
        const ffmpegThreads = Math.max(1, Math.min(3, Math.floor(totalCores / Math.max(1, activeSessions.size + 1)) || 2));

        let ffmpegArgs = [];
        if (process.platform === 'darwin') {
            ffmpegArgs = [
                '-f', 'avfoundation',
                '-framerate', String(fpsVal),
                '-i', '1:none',
                '-c:v', 'libx264',
                '-preset', presetVal,
                '-tune', 'zerolatency',
                '-threads', String(ffmpegThreads),
                '-x264opts', 'no-scenecut=1:rc-lookahead=0:ref=1:bframes=0',
                '-b:v', bitrateStr,
                '-maxrate', bitrateStr,
                '-bufsize', bufsizeStr,
                '-pix_fmt', 'yuv420p',
                '-vf', videoFilter,
                '-g', String(fpsVal * 2),
                '-an',
                '-f', 'flv',
                rtmpUrl
            ];
        } else {
            const gopVal = String(fpsVal * 2);
            const keyintMinVal = String(fpsVal);
            ffmpegArgs = [
                '-thread_queue_size', '1024',
                '-f', 'x11grab',
                '-video_size', '1080x1920',
                '-framerate', String(fpsVal),
                '-draw_mouse', '0',
                '-use_wallclock_as_timestamps', '1',
                '-i', displayStr,
                '-thread_queue_size', '1024',
                '-f', 'pulse',
                '-i', `${pulseSinkStr}.monitor`,
                '-c:v', 'libx264',
                '-preset', presetVal,
                '-tune', 'zerolatency',
                '-threads', String(ffmpegThreads),
                '-x264opts', 'no-scenecut=1:rc-lookahead=0:ref=1:bframes=0:subme=1:me=dia',
                '-b:v', bitrateStr,
                '-maxrate', bitrateStr,
                '-bufsize', bufsizeStr,
                '-pix_fmt', 'yuv420p',
                '-vf', videoFilter,
                '-g', gopVal,
                '-keyint_min', keyintMinVal,
                '-sc_threshold', '0',
                '-vsync', 'cfr',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ar', '44100',
                '-af', 'aresample=async=1000:min_hard_comp=0.100000:first_pts=0,apad',
                '-flvflags', 'no_duration_filesize',
                '-f', 'flv',
                rtmpUrl
            ];
        }

        const proc = spawn('ffmpeg', ffmpegArgs);

        const session = {
            profileId: profile.id,
            profileName: profile.name,
            profile,
            slot,
            display: displayStr,
            pulseSink: pulseSinkStr,
            browser: sessionBrowser,
            currentPage: sessionPage,
            streamProcess: proc,
            isStreaming: true,
            isRecording: false,
            startedAt: Date.now(),
            telemetry: { fps: 0, bitrate: '', speed: '0x', health: 'starting', lastUpdate: Date.now() },
            liveViewerCount: null,
            youtubeChatStatus: getYoutubeChatStatusForProfile(profile.id)
        };
        activeSessions.set(profile.id, session);
        updateGlobalLegacyState();

        // Boot chat poller for this profile
        restartYoutubeChatForProfile(profile);

        proc.stderr.on('data', (data) => {
            const msg = data.toString();
            const statsMatch = msg.match(/fps=\s*([\d.]+).*?bitrate=\s*([\d.]+\s*\w*bits\/s).*?speed=\s*([\d.]+)x/i);
            if (statsMatch) {
                const curFps = parseFloat(statsMatch[1]) || 0;
                const curBitrate = statsMatch[2].trim();
                const curSpeed = parseFloat(statsMatch[3]) || 0;
                let health = 'excellent';
                if (curSpeed < 0.90) health = 'struggling';
                else if (curSpeed < 0.98) health = 'fair';

                session.telemetry = {
                    fps: curFps,
                    bitrate: curBitrate,
                    speed: `${curSpeed.toFixed(2)}x`,
                    health,
                    lastUpdate: Date.now()
                };
                updateGlobalLegacyState();
            }
            if (msg.toLowerCase().includes('error') || msg.toLowerCase().includes('fail')) {
                logMsg(`[${profile.name}] FFmpeg ERR: ${msg.trim()}`, true);
            }
        });

        proc.on('close', (code) => {
            logMsg(`[${profile.name}] FFmpeg exited with code ${code}`);
            if (activeSessions.has(profile.id)) {
                activeSessions.delete(profile.id);
            }
            updateGlobalLegacyState();
            if (sessionBrowser) {
                try { sessionBrowser.close(); } catch (e) {}
            }
            const s = getSchedulerForProfile(profile.id);
            if (s) {
                s.handleStreamStopped('Stream ended unexpectedly (FFmpeg exited).');
            }
        });

        return { ok: true, message: `Stream started for "${profile.name}"` };

    } catch (error) {
        logMsg(`[${profile.name}] Failed to start stream: ${error.message}`, true);
        if (sessionBrowser) {
            try { sessionBrowser.close(); } catch(e){}
        }
        activeSessions.delete(profile.id);
        updateGlobalLegacyState();
        return { ok: false, error: error.message };
    }
}

app.post('/api/start-stream', checkAuth, async (req, res) => {
    const targetId = req.body?.profileId || profilesState.activeProfileId;
    const result = await beginStream(targetId);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ success: true, message: result.message, profileId: targetId });
});

/**
 * Tear a stream session down. Supports stopping a specific channel by profileId.
 */
async function endStream(targetProfileId = null, reason = 'user request') {
    const pid = targetProfileId || profilesState.activeProfileId;
    const session = activeSessions.get(pid);
    if (!session) {
        // Fallback: if single session running, stop it
        if (activeSessions.size === 1) {
            const only = activeSessions.values().next().value;
            return endStream(only.profileId, reason);
        }
        return { ok: false, error: 'Engine is not running for this channel' };
    }

    logMsg(`[${session.profileName}] Stopping engine (${reason})...`);
    session.isStreaming = false;
    session.isRecording = false;

    if (session.streamProcess) {
        try { session.streamProcess.kill('SIGINT'); } catch (e) {}
        session.streamProcess = null;
    }

    if (session.browser) {
        try { await session.browser.close(); } catch (e) {}
        session.browser = null;
    }
    session.currentPage = null;

    activeSessions.delete(pid);
    updateGlobalLegacyState();

    return { ok: true, message: `Stream stopped for "${session.profileName}"` };
}

app.post('/api/stop-stream', checkAuth, async (req, res) => {
    const targetId = req.body?.profileId || profilesState.activeProfileId;
    const result = await endStream(targetId, 'user request');
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ success: true, message: result.message, profileId: targetId });
});

// Recording Feature
app.post('/api/start-record', checkAuth, async (req, res) => {
    if (isStreaming || isRecording) {
        return res.status(400).json({ error: 'Engine is already running. Please stop the current stream/recording first.' });
    }
    
    const durationMinutes = req.body.duration || 5;
    const durationSeconds = durationMinutes * 60;
    
    try {
        isRecording = true;
        recordingProgress = {
            startTime: Date.now(),
            durationMs: durationSeconds * 1000
        };
        logMsg(`Starting local recording for ${durationMinutes} minutes...`);

        const defaultChrome = process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/chromium';
        const chromeExecutable = process.env.CHROME_BIN || defaultChrome;

        const puppeteerArgs = getPuppeteerArgs();

        browser = await puppeteer.launch({
            executablePath: chromeExecutable,
            headless: false, 
            defaultViewport: { width: 1080, height: 1920 },
            args: puppeteerArgs,
            ignoreDefaultArgs: ['--enable-automation']
        });

        currentPage = await browser.newPage();
        
        let queryParam = '?view=landscape&stream=true';
        if (currentSettings.activeEngine === 'hero-tournament' || currentSettings.activeEngine === 'multiverse') {
            queryParam = '?view=hero-tournament&stream=true';
        } else if (currentSettings.activeEngine === 'points-race') {
            queryParam = '?view=points-race&stream=true';
        } else if (currentSettings.activeEngine === 'vertical') {
            queryParam = '?view=vertical&stream=true';
        }
        const recHost = process.env.INTERNAL_HOST || '127.0.0.1';
        const recPort = process.env.PORT || 3000;
        let gameUrl = `http://${recHost}:${recPort}/${queryParam}`;
        logMsg(`Puppeteer navigating to ${gameUrl}`);
        await currentPage.goto(gameUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        try {
            await currentPage.waitForSelector('#game-canvas, canvas, #game-wrapper, #app', { timeout: 8000 });
        } catch (e) {}
        await new Promise(r => setTimeout(r, 800));

        if (currentSettings.gameSettings) {
            await currentPage.evaluate((s) => {
                window.__liveSettings = s;
                if (window.applyGameSettings) {
                    window.applyGameSettings(window.gameInstance, s);
                }
                if (window.heroTournament && typeof window.heroTournament.setSettings === 'function') {
                    window.heroTournament.setSettings(s);
                }
                if (window.pointsRace && typeof window.pointsRace.setSettings === 'function') {
                    window.pointsRace.setSettings(s);
                } else if (window.gameInstance) {
                    const gi = window.gameInstance;
                    const speed = s.speed !== undefined ? Number(s.speed) : 1;
                    gi.settings = { ...(gi.settings || {}), ...s };
                    gi.cfg = { ...(gi.cfg || {}), ...s };
                    if (gi.settings) {
                        gi.settings.speedMult = speed;
                        if (s.rotSpeed !== undefined) gi.settings.rotSpeed = Number(s.rotSpeed);
                        if (s.gravity !== undefined) gi.settings.gravity = Number(s.gravity);
                    }
                    if (s.rotSpeed !== undefined && 'GATE_SPIN' in gi) gi.GATE_SPIN = Number(s.rotSpeed);
                    if (gi.physics) {
                        if (gi.physics.setStepsPerFrame) gi.physics.setStepsPerFrame(speed);
                        if (s.rotSpeed !== undefined && gi.physics.setRotSpeed) gi.physics.setRotSpeed(Number(s.rotSpeed));
                        if (s.gravity !== undefined && gi.physics.setGravity) gi.physics.setGravity(Number(s.gravity));
                    }
                    if (s.watermark !== undefined) {
                        if (gi.ui?.setBranding) gi.ui.setBranding(s.watermark);
                        if (gi.ui?.setChannel) gi.ui.setChannel(s.watermark);
                    }
                    if (s.bias !== undefined) gi.audienceBias = s.bias;
                }
            }, currentSettings.gameSettings);
        }

        await currentPage.evaluate(() => {
            const btn = document.getElementById('btn-start');
            if (btn && !btn.disabled) btn.click();
        });

        const recordDir = path.join(__dirname, 'recordings');
        if (!fs.existsSync(recordDir)) fs.mkdirSync(recordDir, { recursive: true });
        const fileName = `gameplay_${Date.now()}.mp4`;
        const tmpPath = path.join(recordDir, fileName + '.tmp');
        const finalPath = path.join(recordDir, fileName);

        let ffmpegArgs = [];
        if (process.platform === 'darwin') {
            logMsg("macOS detected: using avfoundation for local testing capture.");
            ffmpegArgs = [
                '-f', 'avfoundation',
                '-framerate', '60',
                '-i', '1:none', // Disable audio capture on Mac to avoid device errors
                '-t', durationSeconds.toString(),
                '-c:v', 'h264_videotoolbox', // Hardware accelerated encoding
                '-b:v', '10M', // 10 Mbps for 1080p60 high quality
                '-an', // Disable audio processing for local mac tests
                '-y',
                tmpPath
            ];
        } else {
            ffmpegArgs = [
                '-thread_queue_size', '1024',
                '-f', 'x11grab',
                '-video_size', '1080x1920',
                '-framerate', '60',
                '-draw_mouse', '0',
                '-i', process.env.DISPLAY || ':99'
            ];

            // Conditionally add audio if pulse audio source exists
            try {
                const execSync = require('child_process').execSync;
                execSync('pactl list sources | grep v1.monitor');
                ffmpegArgs.push(
                    '-thread_queue_size', '1024',
                    '-f', 'pulse',
                    '-i', 'v1.monitor'
                );
                logMsg("Pulse audio source v1.monitor detected. Recording with audio.");
            } catch (e) {
                logMsg("Pulse audio source v1.monitor NOT found. Recording video ONLY.", true);
            }

            ffmpegArgs.push(
                '-t', durationSeconds.toString(), // Automatically stop after duration
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '18',
                '-threads', '0',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ar', '44100',
                '-y', // Overwrite if exists
                tmpPath
            );
        }

        streamProcess = spawn('ffmpeg', ffmpegArgs);

        streamProcess.stderr.on('data', (data) => {
            const str = data.toString();
            // Log any obvious errors from FFmpeg output
            if (str.toLowerCase().includes('error') || str.toLowerCase().includes('failed') || str.toLowerCase().includes('cannot open')) {
                logMsg(`FFmpeg RECORD ERR: ${str.trim()}`, true);
            }
        });

        streamProcess.on('close', (code) => {
            logMsg(`Recording process exited with code ${code}. Renaming temp file...`);
            if (fs.existsSync(tmpPath)) {
                try {
                    fs.renameSync(tmpPath, finalPath);
                } catch (e) {
                    logMsg(`Failed to rename tmp file: ${e.message}`, true);
                }
            }
            isRecording = false;
            recordingProgress = null;
            currentPage = null;
            if (browser) { browser.close(); browser = null; }
        });

        res.json({ success: true, message: 'Recording started successfully!' });
    } catch (error) {
        logMsg(`Failed to start recording: ${error.message}`, true);
        isRecording = false;
        recordingProgress = null;
        if (browser) browser.close();
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/recordings', checkAuth, (req, res) => {
    const recordDir = path.join(__dirname, 'recordings');
    if (!fs.existsSync(recordDir)) return res.json([]);
    try {
        const files = fs.readdirSync(recordDir)
            .filter(f => f.endsWith('.mp4'))
            .map(f => {
                const stat = fs.statSync(path.join(recordDir, f));
                return { file: f, url: `/recordings/${f}`, time: stat.mtimeMs };
            })
            .sort((a, b) => b.time - a.time); // Newest first
        res.json(files);
    } catch (e) {
        res.json([]);
    }
});

// Delete recording
app.post('/api/recordings/delete', checkAuth, (req, res) => {
    const { file } = req.body;
    if (!file) return res.status(400).json({error:'No file provided'});
    const filePath = path.join(__dirname, 'recordings', path.basename(file));
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    res.json({success: true});
});

// Remote Control for the Game inside the stream
app.post('/api/control', checkAuth, async (req, res) => {
    const targetId = req.body?.profileId || profilesState.activeProfileId;
    const session = activeSessions.get(targetId);
    const targetPage = session ? session.currentPage : currentPage;
    if ((!isStreaming && !isRecording) || !targetPage) {
        return res.status(400).json({ error: 'Engine is not running for this channel. Start the stream or recording first.' });
    }
    
    const { action, payload } = req.body;
    try {
        if (action === 'new-round' || action === 'reset') {
            await targetPage.evaluate(() => {
                if (window.heroTournament && typeof window.heroTournament.reset === 'function') {
                    window.heroTournament.reset();
                } else if (window.pointsRace && typeof window.pointsRace.reset === 'function') {
                    window.pointsRace.reset();
                } else if (window.gameInstance && typeof window.gameInstance.newRound === 'function') {
                    window.gameInstance.newRound();
                } else {
                    const btn = document.getElementById('btn-start');
                    if (btn && !btn.disabled) btn.click();
                }
            });
            logMsg(`[${targetId}] Game new-round / reset triggered remotely.`);
        } else if (action === 'next-stage') {
            await targetPage.evaluate(() => {
                if (window.heroTournament && typeof window.heroTournament.nextStage === 'function') {
                    window.heroTournament.nextStage();
                } else if (window.pointsRace && typeof window.pointsRace.nextStage === 'function') {
                    window.pointsRace.nextStage();
                }
            });
            logMsg(`[${targetId}] Game next-stage triggered remotely.`);
        } else if (action === 'shrink-arena') {
            await targetPage.evaluate(() => {
                if (window.gameInstance && typeof window.gameInstance.shrinkArena === 'function') {
                    window.gameInstance.shrinkArena();
                }
            });
            logMsg(`[${targetId}] Game shrink-arena triggered remotely.`);
        } else if (action === 'toggle-sound') {
            await targetPage.evaluate(() => {
                if (window.heroAudio && typeof window.heroAudio.toggleMute === 'function') {
                    window.heroAudio.toggleMute();
                }
                if (window.pointsAudio && typeof window.pointsAudio.toggleMute === 'function') {
                    window.pointsAudio.toggleMute();
                }
                if (window.gameInstance && typeof window.gameInstance.setSoundEnabled === 'function') {
                    window.gameInstance.primeAudioOnGesture();
                    window.gameInstance.setSoundEnabled(!window.gameInstance.soundEnabled);
                }
            });
            logMsg(`[${targetId}] Game toggle-sound triggered remotely.`);
        } else if (action === 'speed') {
            await targetPage.evaluate((spd) => {
                if (window.heroTournament && typeof window.heroTournament.setSpeed === 'function') {
                    window.heroTournament.setSpeed(spd);
                }
                if (window.pointsRace && typeof window.pointsRace.setSpeed === 'function') {
                    window.pointsRace.setSpeed(spd);
                }
                if (window.__flagBattleInstance && window.__flagBattleInstance.physics) {
                    window.__flagBattleInstance.physics.setStepsPerFrame(spd);
                }
                if (window.gameInstance) {
                    window.gameInstance.settings = window.gameInstance.settings || {};
                    window.gameInstance.settings.speedMult = spd;
                }
            }, payload?.speed || 1);
            logMsg(`[${targetId}] Game speed set to ${payload?.speed || 1} remotely.`);
        } else if (action === 'pause' || action === 'toggle-pause' || action === 'resume') {
            await targetPage.evaluate((act) => {
                if (window.heroTournament) {
                    if (act === 'pause') window.heroTournament.pause?.();
                    else if (act === 'resume') window.heroTournament.resume?.();
                    else window.heroTournament.togglePause?.();
                }
                if (window.pointsRace) {
                    if (act === 'pause') window.pointsRace.pause?.();
                    else if (act === 'resume') window.pointsRace.resume?.();
                    else window.pointsRace.togglePause?.();
                }
                if (window.gameInstance) {
                    const gi = window.gameInstance;
                    if (act === 'pause') {
                        if (typeof gi.pause === 'function') gi.pause();
                        else gi.paused = true;
                    } else if (act === 'resume') {
                        if (typeof gi.resume === 'function') gi.resume();
                        else gi.paused = false;
                    } else {
                        if (typeof gi.togglePause === 'function') gi.togglePause();
                        else if (gi.paused && typeof gi.resume === 'function') gi.resume();
                        else if (typeof gi.pause === 'function') gi.pause();
                    }
                }
            }, action);
            logMsg(`[${targetId}] Game ${action} triggered remotely.`);
        } else if (action === 'clear-supporters' || action === 'reset-supporters') {
            bus.emit('chat', { type: 'RESET_SUPPORTERS' });
            if (targetPage) {
                await targetPage.evaluate(() => {
                    try {
                        localStorage.removeItem('fb_top_supporters_map');
                        localStorage.removeItem('fb_top_supporters_vertical');
                        if (window.heroTournament && typeof window.heroTournament.resetSupporters === 'function') {
                            window.heroTournament.resetSupporters();
                        }
                        if (window.gameInstance && window.gameInstance.ui && typeof window.gameInstance.ui.resetSupporters === 'function') {
                            window.gameInstance.ui.resetSupporters(true);
                        }
                        if (window.pointsRace && typeof window.pointsRace.resetSupporters === 'function') {
                            window.pointsRace.resetSupporters();
                        }
                    } catch (e) {}
                    window.postMessage({ type: 'RESET_SUPPORTERS' }, '*');
                });
            }
            logMsg("Top supporters leaderboard reset remotely.");
        } else if (action === 'settings') {
            await currentPage.evaluate((s) => {
                window.__liveSettings = s;
                const setVal = (id, val) => {
                    const el = document.getElementById(id);
                    if (el && val !== undefined) {
                        el.value = val;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                };
                const setChk = (id, val) => {
                    const el = document.getElementById(id);
                    if (el && val !== undefined) {
                        el.checked = val;
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                };
                
                if (s.watermark !== undefined) setVal('setting-channel', s.watermark);
                if (s.speed !== undefined) setVal('setting-rot-speed', s.speed);
                if (s.gravity !== undefined) setVal('setting-gravity', s.gravity);
                if (s.bias !== undefined) setChk('setting-audience-bias', s.bias);
                
                // Force settings panel close logic which triggers _applySettings() internally
                const closeBtn = document.getElementById('settings-close');
                if (closeBtn) closeBtn.click();
                
                // If game instance exists, apply new liveSettings directly to it
                if (window.gameInstance) {
                    const gi = window.gameInstance;
                    const speed = s.speed !== undefined ? Number(s.speed) : 1;
                    gi.settings = { ...(gi.settings || {}), ...s };
                    gi.cfg = { ...(gi.cfg || {}), ...s };
                    if (gi.settings) {
                        gi.settings.speedMult = speed;
                        if (s.rotSpeed !== undefined) gi.settings.rotSpeed = Number(s.rotSpeed);
                        if (s.gravity !== undefined) gi.settings.gravity = Number(s.gravity);
                    }
                    if (s.rotSpeed !== undefined && 'GATE_SPIN' in gi) gi.GATE_SPIN = Number(s.rotSpeed);
                    if (gi.physics) {
                        if (gi.physics.setStepsPerFrame) gi.physics.setStepsPerFrame(speed);
                        if (s.rotSpeed !== undefined && gi.physics.setRotSpeed) gi.physics.setRotSpeed(Number(s.rotSpeed));
                        if (s.gravity !== undefined && gi.physics.setGravity) gi.physics.setGravity(Number(s.gravity));
                    }
                    if (s.watermark !== undefined) {
                        if (gi.ui?.setBranding) gi.ui.setBranding(s.watermark);
                        if (gi.ui?.setChannel) gi.ui.setChannel(s.watermark);
                    }
                    if (s.bias !== undefined) gi.audienceBias = s.bias;

                    if (gi.renderer) {
                        if (s.watermark !== undefined) gi.renderer.watermarkText = s.watermark;
                        if (s.wmOpacity !== undefined) gi.renderer.watermarkOpacity = s.wmOpacity;
                        if (s.wmSize !== undefined) gi.renderer.watermarkSize = s.wmSize;
                        if (s.wmCount !== undefined) gi.renderer.watermarkCount = s.wmCount;
                        if (s.wmAngle !== undefined) gi.renderer.watermarkAngle = s.wmAngle;
                    }
                }
                
                // If pointsRace engine exists, update settings
                if (window.pointsRace && typeof window.pointsRace.setSettings === 'function') {
                    window.pointsRace.setSettings(s);
                }
                // If heroTournament engine exists, update settings
                if (window.heroTournament && typeof window.heroTournament.setSettings === 'function') {
                    window.heroTournament.setSettings(s);
                }
                if (window.pointsAudio) {
                    if (s.musicVol !== undefined) window.pointsAudio.setBgVolume(Number(s.musicVol));
                    if (s.customMusicUrl) window.pointsAudio.loadBgMusic(s.customMusicUrl);
                }

                // Dispatch message for React landscape and vertical views
                window.postMessage({ type: 'LIVE_SETTINGS_UPDATE', settings: s }, '*');
            }, payload);
            bus.emit('chat', { type: 'SETTINGS_UPDATE', settings: payload });
            logMsg("Game live settings updated remotely and broadcast.");
        }
        res.json({ success: true });
    } catch (err) {
        logMsg("Control action failed: " + err.message, true);
        res.status(500).json({ error: err.message });
    }
});

// Serve Static files (Must be after root route)
app.use('/recordings', express.static(path.join(__dirname, 'recordings')));

// Root route serves dashboard, or game if view param is set
app.get('/', (req, res) => {
    if (req.query.view === 'landscape' || req.query.view === 'vertical' || req.query.view === 'points-race' || req.query.view === 'hero-tournament' || req.query.view === 'multiverse') {
        res.sendFile(path.join(__dirname, 'react-game', 'dist', 'index.html'));
    } else {
        res.sendFile(path.join(__dirname, 'dashboard.html'));
    }
});
app.use('/assets', express.static(path.join(__dirname, 'react-game', 'dist', 'assets')));
app.use('/flags', express.static(path.join(__dirname, 'react-game', 'dist', 'flags')));
app.use('/flags', express.static(path.join(__dirname, 'react-game', 'public', 'flags')));

app.use(express.static(path.join(__dirname, '.'), {
    setHeaders: (res, reqPath) => {
        if (reqPath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        } else {
            // Aggressive 1-day caching for JS, CSS, Images to save CPU
            res.setHeader('Cache-Control', 'public, max-age=86400');
        }
    }
}));

const PORT = process.env.PORT || 3000;

// --- YouTube Chat Integration ---
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

// Hybrid Super Chat: POWER tokens are broadcast to every running engine.
bus.on('power', (power) => {
  recentMessages.push({ type: 'POWER', ...power, timestamp: new Date().toISOString() });
  if (recentMessages.length > RECENT_MESSAGES_CAP) {
    recentMessages = recentMessages.slice(-RECENT_MESSAGES_CAP);
  }
});

// Best-effort live YouTube concurrent viewer count (real data, never faked).
bus.on('viewers', ({ count }) => {
  if (typeof count === 'number' && count >= 0) liveViewerCount = count;
});

const sseClients = new Map();
app.get('/api/chat-stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (res.flushHeaders) res.flushHeaders();
  res.write('\n');
  const clientProfile = req.query.profile || null;
  sseClients.set(res, clientProfile);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

function broadcastChat(msg, targetProfileId = null) {
  const payload = `data: ${JSON.stringify(msg)}\n\n`;
  for (const [client, clientProfile] of sseClients.entries()) {
    try {
      // Deliver if client did not specify a profile filter, or targetProfileId is null (global), or matches client's profile
      if (!clientProfile || !targetProfileId || clientProfile === targetProfileId) {
        client.write(payload);
        if (typeof client.flush === 'function') client.flush();
      }
    } catch (e) {}
  }
}
bus.on('chat', (m) => broadcastChat(m, m.profileId || null));
bus.on('power', (p) => broadcastChat({ type: 'POWER', ...p, timestamp: new Date().toISOString() }, p.profileId || null));
bus.on('viewers', ({ count, profileId }) => broadcastChat({ type: 'VIEWER_COUNT', count }, profileId || null));

setInterval(() => {
  for (const [client] of sseClients.entries()) {
    try { client.write(': ping\n\n'); } catch (e) {}
  }
}, 25000);

app.get('/api/votes', (req, res) => res.json(voteTally));
app.post('/api/votes/reset', (req, res) => {
  voteTally = {};
  res.json({ ok: true });
});

app.post('/api/supporters/reset', (req, res) => {
  bus.emit('chat', { type: 'RESET_SUPPORTERS' });
  logMsg("Top supporters leaderboard reset via API.");
  res.json({ ok: true });
});

// Points Race State Persistence (Round history & All-Time hall of fame)
const POINTS_RACE_FILE = path.join(__dirname, 'data', 'points_race_history.json');

app.get('/api/points-race/state', (req, res) => {
  try {
    if (fs.existsSync(POINTS_RACE_FILE)) {
      const data = fs.readFileSync(POINTS_RACE_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (!parsed.targetPoints || parsed.targetPoints > 100) parsed.targetPoints = 50;
      return res.json(parsed);
    }
  } catch (e) {}
  res.json({ round: 1, targetPoints: 50, champions: [], allTimeScores: {}, topFans: [] });
});

app.post('/api/points-race/state', (req, res) => {
  try {
    const dir = path.join(__dirname, 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(POINTS_RACE_FILE, JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// In-memory cache for synthesized voice lines so repeated announcements stream in 0ms
const ttsCache = new Map();

// High-fidelity TTS audio endpoint: plays through HTML5 Audio/Web Audio directly into PulseAudio on Linux/VPS
app.get('/api/tts', async (req, res) => {
  const text = String(req.query.text || '').trim();
  if (!text) return res.status(400).send('Missing text parameter');
  if (text.length > 300) return res.status(400).send('Text too long');

  const cacheKey = text.toLowerCase();
  if (ttsCache.has(cacheKey)) {
    const cached = ttsCache.get(cacheKey);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(cached);
  }

  const googleKey = currentSettings.googleTtsApiKey || process.env.GOOGLE_TTS_API_KEY;
  if (googleKey) {
    try {
      const gRes = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'en-US', ssmlGender: 'NEUTRAL' },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95 },
        }),
      });
      if (gRes.ok) {
        const { audioContent } = await gRes.json();
        const buf = Buffer.from(audioContent, 'base64');
        if (ttsCache.size > 200) ttsCache.delete(ttsCache.keys().next().value);
        ttsCache.set(cacheKey, buf);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(buf);
      }
    } catch (err) {
      // Fall through to Google Translate TTS
    }
  }

  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=${encodeURIComponent(text)}`;
    const ttsReq = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (ttsRes) => {
      if (ttsRes.statusCode !== 200) {
        return res.status(502).send('TTS upstream error');
      }
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
    ttsReq.on('error', (err) => {
      res.status(500).send('TTS request error: ' + err.message);
    });
  } catch (err) {
    res.status(500).send('TTS error: ' + err.message);
  }
});

// Upload and replace custom background music MP3 file
app.post('/api/upload-music', express.json({ limit: '50mb' }), checkAuth, (req, res) => {
  try {
    const { filename, data } = req.body;
    if (!data) return res.status(400).json({ error: 'Missing audio data' });

    // Handle base64 data URL or raw base64
    const base64Clean = data.replace(/^data:audio\/\w+;base64,/, '').replace(/^data:application\/octet-stream;base64,/, '');
    const audioBuffer = Buffer.from(base64Clean, 'base64');

    const targetPath = path.join(__dirname, 'custom-music.mp3');
    fs.writeFileSync(targetPath, audioBuffer);

    currentSettings.customMusicUrl = '/custom-music.mp3';
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2));
    } catch (e) {}

    // Broadcast update to all connected viewers and engines
    bus.emit('chat', { type: 'MUSIC_UPDATE', src: '/custom-music.mp3' });
    if (currentPage) {
      currentPage.evaluate(() => {
        if (window.pointsAudio) {
          window.pointsAudio.loadBgMusic('/custom-music.mp3');
          window.pointsAudio.playBgMusic();
        }
      }).catch(() => {});
    }

    logMsg("Custom background music uploaded and activated.");
    res.json({ success: true, url: '/custom-music.mp3' });
  } catch (err) {
    logMsg("Upload music error: " + err.message, true);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/test-chat', express.json(), (req, res) => {
  const { author, text, superChat, tier, amount, avatar } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });

  const { parseCommand, superChatWeight, superChatTier } = require('./youtubeChat.js');
  const command = parseCommand(text);

  // Simulate a Super Chat from either an explicit `tier` (1-7) or `amount` (whole units).
  let amountMicros = 0;
  const TIER_UNITS = [1, 5, 10, 20, 50, 100, 200];
  if (superChat) {
    if (amount != null) {
      amountMicros = Math.max(0, Number(amount)) * 1_000_000;
    } else {
      const t = Math.max(1, Math.min(7, Number(tier) || 1));
      amountMicros = TIER_UNITS[t - 1] * 1_000_000;
    }
  }
  const scTier = superChat
    ? (tier ? Math.max(1, Math.min(7, Number(tier))) : superChatTier(amountMicros))
    : 0;
  const superWeight = superChat ? superChatWeight(amountMicros) : 1;

  let vote = null;
  let power = null;
  if (command && command.kind === 'vote') {
    vote = { code: command.code, countryName: command.countryName, weight: superWeight, superChat: Boolean(superChat), tier: scTier };
  } else if (command && command.kind === 'power') {
    const isNuke = command.power === 'nuke';
    const isInstantRevive = command.power === 'revive';
    if (superChat || (!isNuke && !isInstantRevive)) {
      power = { power: command.power, code: command.code, countryName: command.countryName, weight: superWeight, tier: scTier, superChat: Boolean(superChat) };
    } else if (isInstantRevive && command.code) {
      vote = { code: command.code, countryName: command.countryName, weight: 1, superChat: false, tier: 0 };
    }
  }

  if (!vote && req.body.vote) {
    vote = req.body.vote;
  }
  if (!power && req.body.power) {
    power = req.body.power;
  }

  const msg = {
    id: `test-${Date.now()}`,
    author: author || 'Test User',
    avatar: avatar || req.body.avatar || null,
    text,
    timestamp: new Date().toISOString(),
    vote,
    power,
    superChat: superChat
      ? {
          amountMicros,
          amountDisplayString: `$${(amountMicros / 1_000_000).toFixed(2)}`,
          currency: 'USD',
          tier: scTier,
        }
      : null,
    tier: scTier,
  };

  const targetPid = req.body.profileId || (profilesState && profilesState.activeProfileId) || null;
  msg.profileId = targetPid;
  if (vote) vote.profileId = targetPid;
  if (power) power.profileId = targetPid;

  bus.emit('chat', msg);
  if (vote) bus.emit('vote', vote);
  if (power) bus.emit('power', power);

  res.json({ ok: true, msg });
});

function restartYoutubeChat(settings = currentSettings) {
    restartYoutubeChatForProfile(settings);
}

// Normalise the ID fields using parseYoutubeTarget
function youtubeTargets(settings = currentSettings) {
    const rawTarget = settings.youtubeLiveId || settings.youtubeChannelId || process.env.YOUTUBE_LIVE_VIDEO_ID || process.env.YOUTUBE_CHANNEL_ID || '';
    return parseYoutubeTarget(rawTarget);
}

// Global proxy scheduler object for backward compatibility
const scheduler = {
    getState: () => getSchedulerForProfile(profilesState.activeProfileId).getState(),
    set: (cfg) => getSchedulerForProfile(profilesState.activeProfileId).set(cfg),
    startNow: (dur) => getSchedulerForProfile(profilesState.activeProfileId).startNow(dur),
    clear: () => getSchedulerForProfile(profilesState.activeProfileId).clear(),
    handleStreamStopped: (r) => getSchedulerForProfile(profilesState.activeProfileId).handleStreamStopped(r),
    describe: () => getSchedulerForProfile(profilesState.activeProfileId).describe()
};

app.get('/api/schedule', checkAuth, (req, res) => {
    const targetId = req.query.profileId || profilesState.activeProfileId;
    const sched = getSchedulerForProfile(targetId);
    res.json(sched.getState());
});

// Create or replace the schedule for a specific profile. Does not start anything by itself.
app.post('/api/schedule', checkAuth, (req, res) => {
    const targetId = req.body.profileId || profilesState.activeProfileId;
    const sched = getSchedulerForProfile(targetId);
    const result = sched.set(req.body || {});
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ success: true, state: sched.getState(), profileId: targetId });
});

// "Go live now, auto-stop after N minutes" for a specific profile
app.post('/api/schedule/start-now', checkAuth, async (req, res) => {
    const targetId = req.body?.profileId || profilesState.activeProfileId;
    const sched = getSchedulerForProfile(targetId);
    const result = await sched.startNow(req.body?.durationMinutes);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ success: true, state: sched.getState(), profileId: targetId });
});

// Turn the schedule off for a specific profile. Leaves a running stream alone.
app.post('/api/schedule/clear', checkAuth, (req, res) => {
    const targetId = req.body?.profileId || profilesState.activeProfileId;
    const sched = getSchedulerForProfile(targetId);
    sched.clear();
    res.json({ success: true, state: sched.getState(), profileId: targetId });
});

// Modify or extend duration of a running (or scheduled) livestream
app.post('/api/schedule/modify-duration', checkAuth, (req, res) => {
    const targetId = req.body?.profileId || profilesState.activeProfileId;
    const sched = getSchedulerForProfile(targetId);
    const result = sched.modifyRunningDuration(req.body || {});
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ success: true, message: result.message, state: sched.getState(), profileId: targetId });
});

// --------------------------------

app.listen(PORT, () => {
    logMsg(`Server booted. Listening on port ${PORT}`);
    // Boot scheduler for all configured profiles
    for (const p of profilesState.profiles) {
        try {
            const s = getSchedulerForProfile(p.id);
            logMsg(`[${p.name}] Scheduler active: ${s.describe()}`);
        } catch (e) {
            logMsg(`[${p.name}] Error loading scheduler: ${e.message}`, true);
        }
    }
    const active = getActiveProfile();
    if (active) {
        restartYoutubeChatForProfile(active);
    }
});
