const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const https = require('https');
const { EventEmitter } = require('events');
const { startYoutubeChatPolling, testYoutubeChatConnection, parseYoutubeTarget } = require('./youtubeChat.js');
const { StreamScheduler } = require('./streamScheduler.js');

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
let liveViewerCount = null;

// Default Settings
let currentSettings = {
    streamUrl: '',
    streamKey: '',
    bitrate: 8000, // 8000k standard for Super HD 1080p60
    preset: 'veryfast', // broadcast grade compression
    crop: { enabled: false, x: 0, y: 0, w: 1080, h: 1920 },
    activeEngine: 'vertical', // 'vertical' for Super HD Vertical, 'landscape' for React
    youtubeChatMode: 'player', // 'player' (Zero-Quota Web Player, Unlimited 24/7) | 'hybrid' | 'api'
    youtubePollInterval: 1000 // 800ms / 1000ms / 2000ms
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
    res.json({ isStreaming, isRecording, progress, viewerCount: liveViewerCount, settings: currentSettings, schedule: scheduler.getState(), youtubeChat: youtubeChatStatus });
});

app.post('/api/settings', checkAuth, (req, res) => {
    const oldSettings = { ...currentSettings };
    currentSettings = { ...currentSettings, ...req.body };
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2));
        logMsg("Settings updated and saved to disk.");
        
        if (oldSettings.youtubeApiKey !== currentSettings.youtubeApiKey ||
            oldSettings.youtubeLiveId !== currentSettings.youtubeLiveId ||
            oldSettings.youtubeChannelId !== currentSettings.youtubeChannelId ||
            oldSettings.youtubeChatMode !== currentSettings.youtubeChatMode ||
            oldSettings.youtubePollInterval !== currentSettings.youtubePollInterval) {
            restartYoutubeChat(currentSettings);
        }
        
        bus.emit('chat', { type: 'SETTINGS_UPDATE', settings: currentSettings.gameSettings || currentSettings });
        
        res.json({ success: true, settings: currentSettings });
    } catch (err) {
        logMsg("Failed to save settings: " + err.message, true);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

// Let the director verify the chat pipeline with precise mode testing
app.post('/api/youtube-chat-test', checkAuth, async (req, res) => {
    const chatMode = req.body.chatMode || currentSettings.youtubeChatMode || 'player';
    const apiKey = (req.body.apiKey !== undefined && req.body.apiKey !== '') ? req.body.apiKey : (currentSettings.youtubeApiKey || process.env.YOUTUBE_API_KEY || '');
    const rawTarget = (req.body.target !== undefined && req.body.target !== '') ? req.body.target : (currentSettings.youtubeLiveId || currentSettings.youtubeChannelId || process.env.YOUTUBE_LIVE_VIDEO_ID || process.env.YOUTUBE_CHANNEL_ID || '');
    const { liveVideoId, channelId } = parseYoutubeTarget(rawTarget);
    try {
        const result = await testYoutubeChatConnection({ apiKey, liveVideoId, channelId, chatMode });
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, state: 'error', message: err.message });
    }
});

app.get('/api/youtube-chat-status', checkAuth, (req, res) => {
    res.json(youtubeChatStatus);
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
 * Boot the game in Chrome and push it to the RTMP endpoint.
 * Extracted from the /api/start-stream route so the scheduler can start a run
 * on a timer through exactly the same path a manual click uses.
 */
async function beginStream() {
    if (isStreaming || isRecording) {
        return { ok: false, error: 'Engine is already running (Stop it first)' };
    }
    if (!currentSettings.streamUrl || !currentSettings.streamKey) {
        return { ok: false, error: 'Stream URL and Secret Key are required. Please set them in the Stream Config tab.' };
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
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--window-size=1080,1920',
            '--window-position=0,0',
            '--autoplay-policy=no-user-gesture-required',
            '--kiosk',
            '--js-flags="--max-old-space-size=1024"',
            '--enable-features=CanvasOopRasterization',
            '--enable-gpu-rasterization',
            '--ignore-gpu-blocklist',
            '--force-device-scale-factor=1',
            '--force-color-profile=srgb',
            '--disable-breakpad',
            '--disable-component-update',
            '--disable-ipc-flooding-protection',
            '--disable-features=CalculateNativeWinOcclusion,TranslateUI',
            '--disable-gpu-vsync',
            '--disable-frame-rate-limit',
            '--run-all-compositor-stages-before-draw',
            '--disable-threaded-scrolling'
        ];

        if (process.platform !== 'darwin' && !process.env.USE_GPU) {
            puppeteerArgs.push('--disable-gpu');
        }

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
        
        let queryParam = currentSettings.activeEngine === 'vertical' ? '?view=vertical&stream=true&headless=true' : '?view=landscape&stream=true&headless=true';
        let gameUrl = `http://localhost:${process.env.PORT || 3000}/${queryParam}`;
        logMsg(`Puppeteer navigating to ${gameUrl}`);
        await currentPage.goto(gameUrl, { waitUntil: 'networkidle2' });

        if (currentSettings.gameSettings) {
            await currentPage.evaluate((s) => {
                // Single source of truth for "what does a setting mean". The
                // same mapping is mirrored in dashboard.html
                // (applyGameToPreview) and in both engines' live-settings
                // handlers, so the preview, the in-game drawer and the on-air
                // stream can never disagree.
                window.applyGameSettings = function (gi, s) {
                    if (!gi || !s) return;
                    gi.cfg = { ...(gi.cfg || {}), ...s };
                    gi.settings = { ...(gi.settings || {}), ...s };

                    // `speed` is GAMEPLAY speed (1-5), never arena rotation.
                    const speed = s.speed !== undefined ? Number(s.speed) : 1;
                    const rot = s.rotSpeed !== undefined ? Number(s.rotSpeed) : undefined;
                    const grav = s.gravity !== undefined ? Number(s.gravity) : undefined;

                    // Landscape engine reads these off `settings`.
                    if (gi.settings) {
                        gi.settings.speedMult = speed;
                        if (rot !== undefined) gi.settings.rotSpeed = rot;
                        if (grav !== undefined) gi.settings.gravity = grav;
                    }
                    if (rot !== undefined && 'GATE_SPIN' in gi) gi.GATE_SPIN = rot;

                    // Vertical engine drives its own physics object.
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
                // Mirror the values into the vertical settings form so its
                // "APPLY" button reads sane values. NOTE: speed and rotation
                // are separate settings - writing `speed` into the rotation
                // field used to spin the arena orders of magnitude too fast.
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

        const bitrateVal = currentSettings.bitrate || 8000;
        const bitrateStr = `${bitrateVal}k`;
        const bufsizeStr = `${bitrateVal * 2}k`;
        const presetVal = currentSettings.preset || 'veryfast';
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
                '-preset', presetVal,
                '-threads', '2',
                '-b:v', bitrateStr,
                '-maxrate', bitrateStr,
                '-bufsize', bufsizeStr,
                '-pix_fmt', 'yuv420p',
                '-vf', videoFilter,
                '-g', '120',
                '-an', // Disable audio completely for local mac tests
                '-f', 'flv',
                rtmpUrl
            ];
        } else {
            // Linux/VPS mode (Xvfb + Pulse) - Broadcast Grade 1080p60 Low-Latency Real-Time
            ffmpegArgs = [
                '-thread_queue_size', '1024',
                '-f', 'x11grab',
                '-video_size', '1080x1920',
                '-framerate', '60',
                '-draw_mouse', '0',
                '-use_wallclock_as_timestamps', '1',
                '-i', process.env.DISPLAY || ':99',
                '-thread_queue_size', '1024',
                '-f', 'pulse',
                '-i', 'v1.monitor',
                '-c:v', 'libx264',
                '-preset', presetVal,
                '-tune', 'zerolatency',
                '-threads', '0',
                '-b:v', bitrateStr,
                '-minrate', bitrateStr,
                '-maxrate', bitrateStr,
                '-bufsize', bitrateStr, // 1.0x buffer for real-time responsiveness without backlog lag
                '-nal-hrd', 'cbr',
                '-pix_fmt', 'yuv420p',
                '-vf', videoFilter,
                '-g', '120', // Strict 2.0-second GOP for 60fps (YouTube Live specification)
                '-c:a', 'aac',
                '-b:a', '160k',
                '-ar', '44100',
                '-af', 'aresample=async=1000',
                '-flvflags', 'no_duration_filesize',
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
            // Tell the scheduler the run ended on its own so it does not later
            // try to "stop" something that is already gone.
            if (scheduler) {
                scheduler.handleStreamStopped('Stream ended unexpectedly (FFmpeg exited).');
            }
        });

        return { ok: true, message: 'Stream started successfully' };

    } catch (error) {
        logMsg(`Failed to start stream: ${error.message}`, true);
        isStreaming = false;
        if (browser) { browser.close(); browser = null; }
        return { ok: false, error: error.message };
    }
}

app.post('/api/start-stream', checkAuth, async (req, res) => {
    const result = await beginStream();
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ success: true, message: result.message });
});

/**
 * Tear the engine down. Shared by the stop route and the scheduler's auto-stop
 * so a scheduled end is indistinguishable from a manual one.
 */
async function endStream(reason = 'user request') {
    if (!isStreaming && !isRecording) {
        return { ok: false, error: 'Engine is not running' };
    }

    logMsg(`Stopping engine (${reason})...`);
    isStreaming = false;
    isRecording = false;
    recordingProgress = null;

    if (streamProcess) {
        try { streamProcess.kill('SIGINT'); } catch (e) { /* already gone */ }
        streamProcess = null;
    }

    if (browser) {
        try { await browser.close(); } catch (e) { /* already closed */ }
        browser = null;
    }
    currentPage = null;

    return { ok: true, message: 'Stream stopped' };
}

app.post('/api/stop-stream', checkAuth, async (req, res) => {
    const result = await endStream('user request');
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ success: true, message: result.message });
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
            '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
            '--window-size=1080,1920', '--window-position=0,0',
            '--autoplay-policy=no-user-gesture-required', '--kiosk',
            '--js-flags="--max-old-space-size=1024"',
            '--enable-features=CanvasOopRasterization',
            '--enable-gpu-rasterization',
            '--ignore-gpu-blocklist'
        ];

        if (process.platform !== 'darwin' && !process.env.USE_GPU) {
            puppeteerArgs.push('--disable-gpu');
        }

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
        
        let queryParam = currentSettings.activeEngine === 'vertical' ? '?view=vertical&stream=true' : '?view=landscape&stream=true';
        let gameUrl = `http://localhost:${process.env.PORT || 3000}/${queryParam}`;
        await currentPage.goto(gameUrl, { waitUntil: 'networkidle2' });

        if (currentSettings.gameSettings) {
            await currentPage.evaluate((s) => {
                window.__liveSettings = s;
                if (window.applyGameSettings) {
                    window.applyGameSettings(window.gameInstance, s);
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
        } else if (action === 'pause' || action === 'toggle-pause' || action === 'resume') {
            await currentPage.evaluate((act) => {
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
                        else gi.paused = !gi.paused;
                    }
                } else {
                    const btn = document.getElementById('btn-pause') || document.getElementById('dir-btn-pause');
                    if (btn) btn.click();
                }
            }, action);
            logMsg(`Game ${action} triggered remotely.`);
        } else if (action === 'clear-supporters' || action === 'reset-supporters') {
            bus.emit('chat', { type: 'RESET_SUPPORTERS' });
            if (currentPage) {
                await currentPage.evaluate(() => {
                    try {
                        localStorage.removeItem('fb_top_supporters_map');
                        localStorage.removeItem('fb_top_supporters_vertical');
                        if (window.gameInstance && window.gameInstance.ui && typeof window.gameInstance.ui.resetSupporters === 'function') {
                            window.gameInstance.ui.resetSupporters(true);
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
                
                // Dispatch message for React landscape view
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

const sseClients = new Set();
app.get('/api/chat-stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (res.flushHeaders) res.flushHeaders();
  res.write('\n');
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

function broadcastChat(msg) {
  const payload = `data: ${JSON.stringify(msg)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
      if (typeof client.flush === 'function') client.flush();
    } catch (e) {}
  }
}
bus.on('chat', broadcastChat);
bus.on('power', (p) => broadcastChat({ type: 'POWER', ...p, timestamp: new Date().toISOString() }));
bus.on('viewers', ({ count }) => broadcastChat({ type: 'VIEWER_COUNT', count }));

setInterval(() => {
  for (const client of sseClients) client.write(': ping\n\n');
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

app.post('/api/test-chat', express.json(), (req, res) => {
  const { author, text, superChat, tier, amount } = req.body;
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

  bus.emit('chat', msg);
  if (vote) bus.emit('vote', vote);
  if (power) bus.emit('power', power);

  res.json({ ok: true, msg });
});

let chatPoller = null;
let youtubeChatStatus = { state: 'idle', mode: 'player', videoId: null, channelId: null, liveChatId: null, error: null, at: null };
function restartYoutubeChat(settings = currentSettings) {
    if (chatPoller) {
        chatPoller.stop();
        chatPoller = null;
    }
    const chatMode = settings.youtubeChatMode || 'player';
    const pollInterval = Number(settings.youtubePollInterval) || 1000;
    const apiKey = settings.youtubeApiKey || process.env.YOUTUBE_API_KEY || '';
    const rawTarget = settings.youtubeLiveId || settings.youtubeChannelId || process.env.YOUTUBE_LIVE_VIDEO_ID || process.env.YOUTUBE_CHANNEL_ID || '';
    const { liveVideoId, channelId } = parseYoutubeTarget(rawTarget);

    youtubeChatStatus = { state: 'starting', mode: chatMode, videoId: liveVideoId, channelId, liveChatId: null, error: null, at: Date.now() };

    if (chatMode === 'player' || chatMode === 'hybrid') {
        if (!liveVideoId && !channelId) {
            youtubeChatStatus = {
                state: 'no-target',
                mode: chatMode,
                videoId: null,
                channelId: null,
                liveChatId: null,
                error: 'Please enter a Live Video ID, Video URL, or Channel ID in settings.',
                at: Date.now()
            };
            return;
        }
        chatPoller = startYoutubeChatPolling({
            apiKey,
            liveVideoId,
            channelId,
            chatMode,
            pollInterval,
            bus,
            onStatus: (s) => { youtubeChatStatus = { ...s, mode: chatMode }; },
            log: {
                info: msg => logMsg(msg),
                warn: msg => logMsg(msg, true),
                error: (msg, err) => logMsg(`${msg} ${err || ''}`, true)
            }
        });
    } else {
        // 'api' mode
        if (!apiKey) {
            youtubeChatStatus = {
                state: 'no-api-key',
                mode: chatMode,
                videoId: null,
                channelId: null,
                liveChatId: null,
                error: 'No YouTube API key configured. Switch to Zero-Quota Web Player for free unlimited mode.',
                at: Date.now()
            };
            return;
        }
        if (!liveVideoId && !channelId) {
            youtubeChatStatus = {
                state: 'no-target',
                mode: chatMode,
                videoId: null,
                channelId: null,
                liveChatId: null,
                error: 'No Live Video ID or Channel ID configured.',
                at: Date.now()
            };
            return;
        }
        chatPoller = startYoutubeChatPolling({
            apiKey,
            liveVideoId,
            channelId,
            chatMode,
            pollInterval,
            bus,
            onStatus: (s) => { youtubeChatStatus = { ...s, mode: chatMode }; },
            log: {
                info: msg => logMsg(msg),
                warn: msg => logMsg(msg, true),
                error: (msg, err) => logMsg(`${msg} ${err || ''}`, true)
            }
        });
    }
}

// Normalise the ID fields using parseYoutubeTarget
function youtubeTargets(settings = currentSettings) {
    const rawTarget = settings.youtubeLiveId || settings.youtubeChannelId || process.env.YOUTUBE_LIVE_VIDEO_ID || process.env.YOUTUBE_CHANNEL_ID || '';
    return parseYoutubeTarget(rawTarget);
}


// --------------------------------
// Stream scheduler
// --------------------------------

const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');

const scheduler = new StreamScheduler({
    filePath: SCHEDULE_FILE,
    tickMs: 15000,
    isStreaming: () => isStreaming || isRecording,
    onStart: (reason) => beginStream(),
    onStop: (reason) => endStream(reason),
    onLog: (msg, isError) => logMsg(msg, isError)
});
scheduler.load();

app.get('/api/schedule', checkAuth, (req, res) => {
    res.json(scheduler.getState());
});

// Create or replace the schedule. Does not start anything by itself.
app.post('/api/schedule', checkAuth, (req, res) => {
    const result = scheduler.set(req.body || {});
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ success: true, state: scheduler.getState() });
});

// "Go live now, auto-stop after N minutes" - starts immediately and arms the
// stop timer, so the operator never has to come back and press stop.
app.post('/api/schedule/start-now', checkAuth, async (req, res) => {
    const result = await scheduler.startNow(req.body?.durationMinutes);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ success: true, state: scheduler.getState() });
});

// Turn the schedule off. Deliberately leaves a running stream alone.
app.post('/api/schedule/clear', checkAuth, (req, res) => {
    scheduler.clear();
    res.json({ success: true, state: scheduler.getState() });
});

// --------------------------------

app.listen(PORT, () => {
    logMsg(`Server booted. Listening on port ${PORT}`);
    const settings = fs.existsSync(SETTINGS_FILE) ? JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) : {};
    restartYoutubeChat(settings);
    // Start the scheduler tick loop (recovers the persisted schedule on boot).
    scheduler.start();
    logMsg(`Scheduler: ${scheduler.describe()}`);
});
