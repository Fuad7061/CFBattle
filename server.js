const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const fs = require('fs');

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

// Default Settings
let currentSettings = {
    streamUrl: '',
    streamKey: '',
    bitrate: 6800,
    crop: { enabled: false, x: 0, y: 0, w: 540, h: 960 }
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

// Auth Middleware
function checkAuth(req, res, next) {
    const key = req.headers['x-login-key'];
    if (key === LOGIN_KEY) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized. Invalid Login Key.' });
}

// Serve Dashboard at root FIRST
app.get('/', (req, res) => {
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
    res.json({ isStreaming, settings: currentSettings });
});

app.post('/api/settings', checkAuth, (req, res) => {
    currentSettings = { ...currentSettings, ...req.body };
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2));
        logMsg("Settings updated and saved to disk.");
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
    if (isStreaming) {
        return res.status(400).json({ error: 'Stream is already running' });
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
            '--disable-software-rasterizer',
            '--window-size=540,960',
            '--window-position=0,0',
            '--autoplay-policy=no-user-gesture-required',
            '--kiosk'
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
            defaultViewport: { width: 540, height: 960 },
            args: puppeteerArgs
        });

        currentPage = await browser.newPage();
        
        const gameUrl = `http://localhost:${process.env.PORT || 3000}/game.html?stream=true`;
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
                '-framerate', '24',
                '-i', '1:0', // Typically 1 is screen, 0 is mic on mac. Or 'default'
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-tune', 'zerolatency',
                '-threads', '2',
                '-b:v', bitrateStr,
                '-maxrate', bitrateStr,
                '-bufsize', bufsizeStr,
                '-vf', videoFilter,
                '-g', '48', 
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ar', '44100',
                '-f', 'flv',
                rtmpUrl
            ];
        } else {
            // Linux/VPS mode (Xvfb + Pulse)
            ffmpegArgs = [
                '-f', 'x11grab',
                '-video_size', '540x960',
                '-framerate', '24',
                '-i', process.env.DISPLAY || ':99',
                '-f', 'pulse',
                '-i', 'default',
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-tune', 'zerolatency',
                '-threads', '2',
                '-b:v', bitrateStr,
                '-maxrate', bitrateStr,
                '-bufsize', bufsizeStr,
                '-vf', videoFilter,
                '-g', '48', 
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
    if (!isStreaming) {
        return res.status(400).json({ error: 'Stream is not running' });
    }
    
    logMsg("Stopping stream by user request...");
    isStreaming = false;
    
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

// Remote Control for the Game inside the stream
app.post('/api/control', checkAuth, async (req, res) => {
    if (!isStreaming || !currentPage) {
        return res.status(400).json({ error: 'Stream is not running. Start the stream first.' });
    }
    
    const { action, payload } = req.body;
    try {
        if (action === 'start') {
            await currentPage.evaluate(() => {
                const btn = document.getElementById('btn-start');
                if (btn && !btn.disabled) btn.click();
            });
            logMsg("Game start triggered remotely.");
        } else if (action === 'pause') {
            await currentPage.evaluate(() => {
                const btn = document.getElementById('btn-pause');
                if (btn && !btn.disabled) btn.click();
            });
            logMsg("Game pause triggered remotely.");
        } else if (action === 'reset') {
            await currentPage.evaluate(() => {
                const btn = document.getElementById('btn-reset');
                if (btn) btn.click();
            });
            logMsg("Game reset triggered remotely.");
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
app.use(express.static(path.join(__dirname, '.')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logMsg(`Server booted. Listening on port ${PORT}`);
});
