const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const { EventEmitter } = require('events');
const { startYoutubeChatPolling } = require('./youtubeChat.js');

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

let streamProcess = null;
let browser = null;
let currentPage = null;
let isStreaming = false;
let isRecording = false;
let recordingProgress = null;

// Default Settings
let currentSettings = {
    streamUrl: '',
    streamKey: '',
    bitrate: 6800,
    crop: { enabled: false, x: 0, y: 0, w: 1080, h: 1920 },
    activeEngine: 'landscape' // 'landscape' for React, 'vertical' for original
};

// Load settings on boot
if (fs.existsSync(SETTINGS_FILE)) {
    try {
        const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
        currentSettings = { ...currentSettings, ...JSON.parse(data) };
        logMsg("Loaded settings from persistent storage.");
    } catch (err) {
        logMsg("Failed to load settings: " + err.message, true);
    }
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
    let progress = null;
    if (isRecording && recordingProgress) {
        const elapsed = Date.now() - recordingProgress.startTime;
        progress = Math.min(100, Math.round((elapsed / recordingProgress.durationMs) * 100));
        
        // Failsafe: if it's stuck 30 seconds past the expected end time, kill it
        if (elapsed > recordingProgress.durationMs + 30000) {
            logMsg("Failsafe triggered: FFmpeg hung past expected duration. Force killing...");
            if (streamProcess) {
                try { streamProcess.kill('SIGKILL'); } catch(e){}
                streamProcess = null;
            }
            isRecording = false;
            recordingProgress = null;
            if (browser) { browser.close(); browser = null; }
            currentPage = null;
            progress = null; // Reset
        }
    }
    res.json({ isStreaming, isRecording, progress, settings: currentSettings });
});

app.post('/api/settings', checkAuth, (req, res) => {
    const oldSettings = { ...currentSettings };
    currentSettings = { ...currentSettings, ...req.body };
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2));
        logMsg("Settings updated and saved to disk.");
        
        // Check if YouTube settings changed
        if (oldSettings.youtubeApiKey !== currentSettings.youtubeApiKey ||
            oldSettings.youtubeLiveId !== currentSettings.youtubeLiveId ||
            oldSettings.youtubeChannelId !== currentSettings.youtubeChannelId) {
            restartYoutubeChat(currentSettings);
        }
        
        res.json({ success: true });
    } catch (err) {
        logMsg("Failed to save settings: " + err.message, true);
        res.status(500).json({ error: 'Failed to save settings' });
    }
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

app.post('/api/start-stream', checkAuth, async (req, res) => {
    if (isStreaming || isRecording) {
        return res.status(400).json({ error: 'Engine is already running (Stop it first)' });
    }
    
    if (!currentSettings.streamUrl || !currentSettings.streamKey) {
        return res.status(400).json({ error: 'Stream URL and Secret Key are required. Please set them in the Settings tab.' });
    }

    try {
        isStreaming = true;
        logMsg("Starting stream process...");

        // Detect Chrome executable
        const defaultChrome = process.platform === 'darwin'
            ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
            : '/usr/bin/chromium';
        const chromeExecutable = process.env.CHROME_BIN || defaultChrome;

        const puppeteerArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--window-size=1080,1920',
            '--window-position=0,0',
            '--autoplay-policy=no-user-gesture-required',
            '--kiosk',
            '--js-flags="--max-old-space-size=512"'
        ];

        if (process.env.DISPLAY) {
            puppeteerArgs.push(`--display=${process.env.DISPLAY}`);
        } else if (process.platform !== 'darwin') {
            puppeteerArgs.push('--display=:99');
        }

        // Launch Puppeteer (Optimized for minimal CPU)
        browser = await puppeteer.launch({
            executablePath: chromeExecutable,
            headless: process.platform === 'darwin' ? false : false, 
            defaultViewport: { width: 1080, height: 1920 },
            args: puppeteerArgs,
            ignoreDefaultArgs: ['--enable-automation']
        });

        currentPage = await browser.newPage();
        
        let queryParam = currentSettings.activeEngine === 'vertical' ? '?view=vertical&stream=true' : '?stream=true';
        let gameUrl = `http://localhost:${process.env.PORT || 3000}/${queryParam}`;
        logMsg(`Puppeteer navigating to ${gameUrl}`);
        await currentPage.goto(gameUrl, { waitUntil: 'networkidle2' });

        if (currentSettings.gameSettings) {
            await currentPage.evaluate((s) => {
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
                if (s.speed !== undefined) setVal('setting-rot-speed', s.speed);
                if (s.gravity !== undefined) setVal('setting-gravity', s.gravity);
                if (s.bias !== undefined) setChk('setting-audience-bias', s.bias);
                const closeBtn = document.getElementById('settings-close');
                if (closeBtn) closeBtn.click();
                
                // If game instance exists, apply directly
                if (window.gameInstance) {
                    if (s.watermark !== undefined) window.gameInstance.ui.setChannel(s.watermark);
                    if (s.speed !== undefined) window.gameInstance.physics.setStepsPerFrame(s.speed);
                    if (s.gravity !== undefined) window.gameInstance.physics.setGravity(s.gravity);
                    if (s.bias !== undefined) window.gameInstance.audienceBias = s.bias;
                }
            }, currentSettings.gameSettings);
            logMsg("Applied saved game settings on stream boot.");
        }

        // Auto-start gameplay
        await currentPage.evaluate(() => {
            const btn = document.getElementById('btn-start');
            if (btn && !btn.disabled) btn.click();
        });
        logMsg("Auto-started gameplay for the stream.");

        logMsg("Starting FFmpeg streaming...");

        // Construct FFmpeg Args based on crop settings
        let videoFilter = 'format=yuv420p';
        if (currentSettings.crop && currentSettings.crop.enabled) {
            const { w, h, x, y } = currentSettings.crop;
            videoFilter = `crop=${w}:${h}:${x}:${y},format=yuv420p`;
            logMsg(`Applying crop filter: ${videoFilter}`);
        }

        const bitrateStr = currentSettings.bitrate ? `${currentSettings.bitrate}k` : '6800k';
        const bufsizeStr = currentSettings.bitrate ? `${currentSettings.bitrate * 2}k` : '13600k';
        const rtmpUrl = (currentSettings.streamUrl.endsWith('/') ? currentSettings.streamUrl : currentSettings.streamUrl + '/') + currentSettings.streamKey;

        // Build FFmpeg Args conditionally based on OS
        let ffmpegArgs = [];
        if (process.platform === 'darwin') {
            logMsg("macOS detected: using avfoundation for local testing capture.");
            ffmpegArgs = [
                '-f', 'avfoundation',
                '-framerate', '60',
                '-i', '1:none', // Disable audio capture on Mac to avoid device errors
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-tune', 'zerolatency',
                '-threads', '2',
                '-b:v', bitrateStr,
                '-maxrate', bitrateStr,
                '-bufsize', bufsizeStr,
                '-vf', videoFilter,
                '-g', '48',
                '-an', // Disable audio completely for local mac tests

                '-f', 'flv',
                rtmpUrl
            ];
        } else {
            // Linux/VPS mode (Xvfb + Pulse)
            ffmpegArgs = [
                '-thread_queue_size', '1024',
                '-f', 'x11grab',
                '-video_size', '1080x1920',
                '-framerate', '60',
                '-draw_mouse', '0',
                '-i', process.env.DISPLAY || ':99',
                '-thread_queue_size', '1024',
                '-f', 'pulse',
                '-i', 'v1.monitor',
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-tune', 'zerolatency',
                '-threads', '0',
                '-b:v', bitrateStr,
                '-minrate', bitrateStr,
                '-maxrate', bitrateStr,
                '-bufsize', bufsizeStr,
                '-nal-hrd', 'cbr',
                '-vf', videoFilter,
                '-g', '60', 
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ar', '44100',
                '-f', 'flv',
                rtmpUrl
            ];
        }

        streamProcess = spawn('ffmpeg', ffmpegArgs);

        streamProcess.stderr.on('data', (data) => {
            const msg = data.toString();
            // Suppress verbose FFmpeg output, only log errors to file
            if (msg.toLowerCase().includes('error') || msg.toLowerCase().includes('fail')) {
                logMsg(`FFmpeg ERR: ${msg.trim()}`, true);
            }
        });

        streamProcess.on('close', (code) => {
            logMsg(`FFmpeg exited with code ${code}`);
            isStreaming = false;
            currentPage = null;
            if (browser) {
                browser.close();
                browser = null;
            }
        });

        res.json({ success: true, message: 'Stream started successfully' });

    } catch (error) {
        logMsg(`Failed to start stream: ${error.message}`, true);
        isStreaming = false;
        if (browser) browser.close();
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/stop-stream', checkAuth, async (req, res) => {
    if (!isStreaming && !isRecording) {
        return res.status(400).json({ error: 'Engine is not running' });
    }
    
    logMsg("Stopping engine by user request...");
    isStreaming = false;
    isRecording = false;
    recordingProgress = null;
    
    if (streamProcess) {
        streamProcess.kill('SIGINT');
        streamProcess = null;
    }
    
    if (browser) {
        await browser.close();
        browser = null;
    }
    currentPage = null;
    
    res.json({ success: true, message: 'Stream stopped' });
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

        const puppeteerArgs = [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
            '--window-size=1080,1920', '--window-position=0,0',
            '--autoplay-policy=no-user-gesture-required', '--kiosk',
            '--js-flags="--max-old-space-size=512"'
        ];

        if (process.env.DISPLAY) puppeteerArgs.push(`--display=${process.env.DISPLAY}`);
        else if (process.platform !== 'darwin') puppeteerArgs.push('--display=:99');

        browser = await puppeteer.launch({
            executablePath: chromeExecutable,
            headless: false, 
            defaultViewport: { width: 1080, height: 1920 },
            args: puppeteerArgs,
            ignoreDefaultArgs: ['--enable-automation']
        });

        currentPage = await browser.newPage();
        
        let queryParam = currentSettings.activeEngine === 'vertical' ? '?view=vertical&stream=true' : '?stream=true';
        let gameUrl = `http://localhost:${process.env.PORT || 3000}/${queryParam}`;
        await currentPage.goto(gameUrl, { waitUntil: 'networkidle2' });

        if (currentSettings.gameSettings) {
            await currentPage.evaluate((s) => {
                window.__liveSettings = s;
                if (window.gameInstance) {
                    if (s.watermark !== undefined) window.gameInstance.ui.setChannel(s.watermark);
                    if (s.speed !== undefined) window.gameInstance.physics.setStepsPerFrame(s.speed);
                    if (s.gravity !== undefined) window.gameInstance.physics.setGravity(s.gravity);
                    if (s.bias !== undefined) window.gameInstance.audienceBias = s.bias;
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
    if ((!isStreaming && !isRecording) || !currentPage) {
        return res.status(400).json({ error: 'Engine is not running. Start the stream or recording first.' });
    }
    
    const { action, payload } = req.body;
    try {
        if (action === 'new-round') {
            await currentPage.evaluate(() => {
                if (window.gameInstance && typeof window.gameInstance.newRound === 'function') {
                    window.gameInstance.newRound();
                } else {
                    const btn = document.getElementById('btn-start');
                    if (btn && !btn.disabled) btn.click();
                }
            });
            logMsg("Game new-round triggered remotely.");
        } else if (action === 'shrink-arena') {
            await currentPage.evaluate(() => {
                if (window.gameInstance && typeof window.gameInstance.shrinkArena === 'function') {
                    window.gameInstance.shrinkArena();
                }
            });
            logMsg("Game shrink-arena triggered remotely.");
        } else if (action === 'toggle-sound') {
            await currentPage.evaluate(() => {
                if (window.gameInstance && typeof window.gameInstance.setSoundEnabled === 'function') {
                    window.gameInstance.primeAudioOnGesture();
                    window.gameInstance.setSoundEnabled(!window.gameInstance.soundEnabled);
                }
            });
            logMsg("Game toggle-sound triggered remotely.");
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
                    if (s.watermark !== undefined) window.gameInstance.ui.setChannel(s.watermark);
                    if (s.speed !== undefined) window.gameInstance.physics.setStepsPerFrame(s.speed);
                    if (s.gravity !== undefined) window.gameInstance.physics.setGravity(s.gravity);
                    if (s.bias !== undefined) window.gameInstance.audienceBias = s.bias;
                }
            }, payload);
            logMsg("Game live settings updated remotely.");
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
    if (req.query.view === 'landscape' || req.query.view === 'vertical') {
        res.sendFile(path.join(__dirname, 'react-game', 'dist', 'index.html'));
    } else {
        res.sendFile(path.join(__dirname, 'dashboard.html'));
    }
});
app.use('/assets', express.static(path.join(__dirname, 'react-game', 'dist', 'assets')));
app.use('/flags', express.static(path.join(__dirname, 'react-game', 'dist', 'flags')));

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

const sseClients = new Set();
app.get('/api/chat-stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
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

setInterval(() => {
  for (const client of sseClients) client.write(': ping\n\n');
}, 25000);

app.get('/api/votes', (req, res) => res.json(voteTally));
app.post('/api/votes/reset', (req, res) => {
  voteTally = {};
  res.json({ ok: true });
});

let chatPoller = null;
function restartYoutubeChat(settings) {
    if (chatPoller) {
        chatPoller.stop();
        chatPoller = null;
    }
    const apiKey = settings.youtubeApiKey || process.env.YOUTUBE_API_KEY;
    const liveVideoId = settings.youtubeLiveId || process.env.YOUTUBE_LIVE_VIDEO_ID;
    const channelId = settings.youtubeChannelId || process.env.YOUTUBE_CHANNEL_ID;
    
    if (apiKey && (liveVideoId || channelId)) {
        chatPoller = startYoutubeChatPolling({
            apiKey, liveVideoId, channelId, bus,
            log: {
                info: msg => logMsg(msg),
                warn: msg => logMsg(msg, true),
                error: (msg, err) => logMsg(`${msg} ${err || ''}`, true)
            }
        });
    }
}

// --------------------------------

app.listen(PORT, () => {
    logMsg(`Server booted. Listening on port ${PORT}`);
    const settings = fs.existsSync(SETTINGS_FILE) ? JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) : {};
    restartYoutubeChat(settings);
});
