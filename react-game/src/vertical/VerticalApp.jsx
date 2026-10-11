import React, { useEffect, useRef } from 'react';
import './style.css';
import { FlagBattle } from './lib/game.js';

export default function VerticalApp() {
  const initialized = useRef(false);
  const params = new URLSearchParams(window.location.search);
  const isStream = params.get('headless') === 'true' || params.get('stream') === 'true' || params.get('clean') === 'true';

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      // Initialize the legacy game engine inside this component
      window.gameInstance = new FlagBattle();
    }

    const handleMessage = (e) => {
      if (e.data?.type === 'SYNC_SETTINGS' || e.data?.type === 'LIVE_SETTINGS_UPDATE') {
        const settings = e.data.settings;
        window.__liveSettings = settings;
        
        if (window.gameInstance) {
          const gi = window.gameInstance;
          gi.cfg = { ...(gi.cfg || {}), ...settings };
          if (settings.watermark !== undefined && gi.ui?.setBranding) {
             gi.ui.setBranding(settings.watermark);
             if (gi.renderer) gi.renderer.watermarkText = settings.watermark;
          }
          if (gi.renderer) {
             if (settings.watermarkOpacity !== undefined) gi.renderer.watermarkOpacity = settings.watermarkOpacity;
             if (settings.watermarkSize !== undefined) gi.renderer.watermarkSize = settings.watermarkSize;
             if (settings.watermarkCount !== undefined) gi.renderer.watermarkCount = settings.watermarkCount;
             if (settings.watermarkAngle !== undefined) gi.renderer.watermarkAngle = settings.watermarkAngle;
          }
          if (settings.speed !== undefined && gi.physics?.setStepsPerFrame) {
             // `speed` is gameplay speed (1-5), NOT arena rotation.
             gi.physics.setStepsPerFrame(Number(settings.speed));
          }
          if (settings.rotSpeed !== undefined && gi.physics?.setRotSpeed) {
             gi.physics.setRotSpeed(Number(settings.rotSpeed));
          }
          if (settings.gravity !== undefined && gi.physics?.setGravity) {
             gi.physics.setGravity(Number(settings.gravity));
          }
          if (settings.bias !== undefined) gi.audienceBias = settings.bias;
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);
  useEffect(() => {
    const adjustScale = () => {
      const wrapper = document.getElementById('game-wrapper');
      if (!wrapper) return;
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      const scale = Math.min(winW / 540, winH / 960);
      wrapper.style.transform = `translate(-50%, -50%) scale(${scale})`;
      wrapper.style.transformOrigin = 'center center';
      if (window.gameInstance && window.gameInstance.updateCanvasSize) {
        window.gameInstance.updateCanvasSize();
      }
    };
    
    adjustScale();
    window.addEventListener('resize', adjustScale);
    return () => window.removeEventListener('resize', adjustScale);
  }, []);

  return (
    <div className="vertical-app-container">
      <div id="app">
        <div id="game-wrapper">
          <canvas id="game-canvas" width="1080" height="1920"></canvas>

          <div id="countdown-overlay" className="hidden">
            <div id="countdown-num">3</div>
          </div>

          <div id="hud">
            <div id="round-header">
              <span id="round-label">ROUND 1</span>
              <span className="hdr-sep">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="#f97316" style={{ display: 'inline-block', verticalAlign: '-1.5px' }}>
                  <path d="M12 23c-4.97 0-9-4.03-9-9 0-3.66 2.22-6.84 5.39-8.23.47-.2.77.34.46.72C7.75 7.84 7.5 9.38 8 10.74c.26.7.99 1.15 1.74.97.87-.21 1.46-.99 1.46-1.89V3.5c0-.46.52-.72.87-.43C15.86 6.06 21 10.97 21 14c0 4.97-4.03 9-9 9z"/>
                </svg>
              </span>
              <span id="timer-display">00:00</span>
              <span className="hdr-sep">·</span>
              <span id="phase-label">READY</span>
            </div>

            <div id="panels-row">
              <div id="qualified-panel">
                <div id="qualified-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="#f59e0b">
                    <path d="M19 4h-3V2H8v2H5c-1.1 0-2 .9-2 2v2c0 2.5 1.9 4.6 4.3 4.9.7 1.4 1.9 2.5 3.4 2.9V18H8v2h8v-2h-2.7v-2.2c1.5-.4 2.7-1.5 3.4-2.9 2.4-.3 4.3-2.4 4.3-4.9V6c0-1.1-.9-2-2-2zM5 8V6h3v4.8C6.3 10.4 5 9.4 5 8zm14 0c0 1.4-1.3 2.4-3 2.8V6h3v2z" />
                  </svg>
                  <span>CAMPAIGN WINNERS</span>
                </div>
                <div id="qualified-list"><div className="q-empty">Awaiting first champion…</div></div>
              </div>
              <div id="supporters-panel">
                <div id="supporters-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="#38bdf8">
                    <path d="M12 2L4 8l8 14 8-14-8-6zm0 2.5l5.2 3.9H6.8L12 4.5zM6 9.8h4.5L12 18 6 9.8zm7.5 0H18l-6 8.2 1.5-8.2z"/>
                  </svg>
                  <span>TOP SUPPORTERS ·</span>
                </div>
                <div id="supporters-list">
                  <div className="sup-empty">No supporters yet</div>
                </div>
              </div>
            </div>

            <div id="team-panel" className="hidden">
              <div id="team-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="#38bdf8">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
                </svg>
                <span>TEAM UP MODE</span>
              </div>
              <div id="team-list"></div>
            </div>

            <div id="sub-row">
              <span id="mod-label">[ BATTLE MOD ]</span>
              <span id="qualifying-mid">
                <span id="qualifying-text">QUALIFYING</span>
                <span id="qualifying-timer">· 00:00</span>
              </span>
            </div>

            <div id="bottom-right-stack">
              <div id="revive-trackers"></div>
              <div id="chat-cta" className="hidden">Comment Your Country Flag Name To Save</div>
            </div>
            <div id="elimination-feed"></div>

            <div id="engagement-cta" className="hidden"></div>

            <div id="winner-screen" className="hidden">
              <div id="winner-title">ROUND WINNER</div>
              <div id="winner-trophy">
                <svg viewBox="0 0 24 24" width="62" height="62" fill="url(#goldTrophyGrad)" style={{ filter: 'drop-shadow(0 0 18px rgba(245,158,11,0.85))', display: 'block', margin: '0 auto' }}>
                  <defs>
                    <linearGradient id="goldTrophyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#fef08a" />
                      <stop offset="40%" stopColor="#f59e0b" />
                      <stop offset="75%" stopColor="#d97706" />
                      <stop offset="100%" stopColor="#92400e" />
                    </linearGradient>
                  </defs>
                  <path d="M19 4h-3V2H8v2H5c-1.1 0-2 .9-2 2v2c0 2.5 1.9 4.6 4.3 4.9.7 1.4 1.9 2.5 3.4 2.9V18H8v2h8v-2h-2.7v-2.2c1.5-.4 2.7-1.5 3.4-2.9 2.4-.3 4.3-2.4 4.3-4.9V6c0-1.1-.9-2-2-2zM5 8V6h3v4.8C6.3 10.4 5 9.4 5 8zm14 0c0 1.4-1.3 2.4-3 2.8V6h3v2z" />
                </svg>
              </div>
              <div id="winner-flag-wrap">
                <img id="winner-flag-img" src="" alt="" crossOrigin="anonymous" />
              </div>
              <div id="winner-name"></div>
              <div id="winner-team"></div>
              <div id="podium-row">
                <div className="podium-item" id="podium-2nd">
                  <img id="second-flag-img" src="" alt="2nd" crossOrigin="anonymous" />
                  <span id="second-name">--</span>
                  <span className="podium-rank">2</span>
                </div>
                <div className="podium-item podium-winner" id="podium-1st">
                  <img id="first-flag-img-podium" src="" alt="1st" crossOrigin="anonymous" />
                  <span id="first-name-podium">--</span>
                  <span className="podium-rank">1</span>
                </div>
                <div className="podium-item" id="podium-3rd">
                  <img id="third-flag-img" src="" alt="3rd" crossOrigin="anonymous" />
                  <span id="third-name">--</span>
                  <span className="podium-rank">3</span>
                </div>
              </div>
              <div id="next-tournament" className="hidden">NEXT TOURNAMENT IN <span id="next-timer">60</span>s</div>
            </div>

            <div id="milestone-popup" className="hidden"></div>
            <div id="suspense-notice" className="hidden"></div>
            <div className="hud-push"></div>

            <div id="counter-section">
              <div id="progress-bg"><div id="progress-fill"></div></div>
              <div id="counter-text">0 / 0 FLAGS</div>
            </div>

            <div id="top5-tracker" className="hidden">
              <div id="top5-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="#facc15"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>
                <span>TOP 5 FINALISTS — WHO WILL WIN?</span>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="#facc15"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>
              </div>
              <div id="top5-cards"></div>
            </div>

            <div id="roster-section">
              <div id="roster-header">Active Countries</div>
              <div id="roster-grid"></div>
            </div>

            <div id="branding">★ @FlagsBattleSimulator ★</div>
          </div>
        </div>

        {!isStream && (
          <>
            <div id="controls-panel">
              <div className="ctrl-group">
                <button id="btn-start" className="ctrl-btn primary" title="Start round (Space)">▶ START</button>
                <button id="btn-pause" className="ctrl-btn" title="Pause (P)" disabled>⏸ PAUSE</button>
                <button id="btn-reset" className="ctrl-btn" title="Full reset (R)">↺ RESET</button>
              </div>

              <div className="ctrl-group">
                <label className="ctrl-label">Speed</label>
                <input type="range" id="speed-slider" min="1" max="5" defaultValue="1" />
                <span id="speed-value">1×</span>
              </div>

              <div className="ctrl-group">
                <button id="btn-mute" className="ctrl-btn icon" title="Toggle mute (M)">🔊</button>
                <button id="btn-fs" className="ctrl-btn icon" title="Fullscreen (F)">⛶</button>
                <button id="btn-record" className="ctrl-btn record" title="Record canvas">⏺ REC</button>
                <button id="btn-stop" className="ctrl-btn" disabled>⏹ STOP</button>
                <button id="btn-download" className="ctrl-btn" disabled>⬇ SAVE</button>
                <div id="rec-badge"><span className="rec-dot"></span> REC</div>
                <button id="btn-settings" className="ctrl-btn icon" title="Settings">⚙</button>
              </div>
            </div>

            <div id="key-hint">Space · P pause · R reset · M mute · F fullscreen</div>
          </>
        )}
      </div>

      <div id="settings-panel" aria-label="Settings">
        <div className="sp-header">
          <h3>⚙ SETTINGS</h3>
          <button id="settings-close" title="Apply & Close">✕ APPLY</button>
        </div>

        <div className="sp-body">
          <div className="sp-section-label">BRANDING</div>
          <div className="sg">
            <label>Channel Watermark</label>
            <input type="text" id="setting-channel" defaultValue="@FlagsBattleSimulator" placeholder="@YourChannel" />
          </div>

          <div className="sg">
            <label>Watermark Opacity</label>
            <div className="range-row">
              <span>0</span>
              <input type="range" id="setting-wm-opacity" min="0" max="1" step="0.01" defaultValue="0.15" />
              <span>1</span>
            </div>
          </div>

          <div className="sg">
            <label>Watermark Font Size</label>
            <div className="range-row">
              <span>10</span>
              <input type="range" id="setting-wm-size" min="10" max="150" step="1" defaultValue="36" />
              <span>150</span>
            </div>
          </div>

          <div className="sg">
            <label>Watermark Density (Count)</label>
            <div className="range-row">
              <span>1</span>
              <input type="range" id="setting-wm-count" min="1" max="10" step="1" defaultValue="3" />
              <span>10</span>
            </div>
          </div>

          <div className="sg">
            <label>Watermark Angle (Degrees)</label>
            <div className="range-row">
              <span>-90°</span>
              <input type="range" id="setting-wm-angle" min="-90" max="90" step="1" defaultValue="0" />
              <span>90°</span>
            </div>
          </div>

          <hr className="sp-hr" />
          <div className="sp-section-label">PHYSICS</div>

          <div className="sg">
            <div className="toggle-row">
              <input type="checkbox" id="setting-audience-bias" defaultChecked />
              <label htmlFor="setting-audience-bias">YouTube Audience Retention Mode <small>(Favors high-viewership countries for AVD)</small></label>
            </div>
          </div>

          <div className="sg">
            <label>Arena Rotation Speed <small>(rad/step, default 0.0028)</small></label>
            <input type="number" id="setting-rot-speed" defaultValue="0.0028" min="0" max="0.05" step="0.001" />
          </div>

          <div className="sg">
            <label>Gravity <small>(default 1.0)</small></label>
            <input type="number" id="setting-gravity" defaultValue="1.0" min="0.1" max="5" step="0.1" />
          </div>

          <div className="sg">
            <label>Hole Opening Frequency <small>(1 = rare → 5 = constant)</small></label>
            <div className="range-row">
              <span>Rare</span>
              <input type="range" id="setting-hole-freq" min="1" max="5" defaultValue="3" />
              <span>Often</span>
            </div>
          </div>

          <div className="sg">
            <label>Hole Duration (ms)</label>
            <input type="number" id="setting-hole-dur" defaultValue="4000" min="500" max="15000" step="500" />
          </div>

          <div className="sg">
            <label>Countdown Before Round (s)</label>
            <input type="number" id="setting-countdown" defaultValue="3" min="0" max="10" step="1" />
          </div>

          <hr className="sp-hr" />
          <div className="sp-section-label">VOICE / TTS</div>

          <div className="sg">
            <label>TTS Provider</label>
            <select id="setting-tts" defaultValue="browser">
              <option value="browser">Browser Web Speech API (free)</option>
              <option value="google">Google Cloud TTS (API key required)</option>
            </select>
          </div>

          <div className="sg">
            <label>Google Cloud TTS API Key</label>
            <input type="password" id="setting-gemini-key" placeholder="AIza…" />
          </div>

          <div className="sg">
            <label>Browser Voice</label>
            <select id="setting-voice"><option value="0">Default</option></select>
          </div>

          <hr className="sp-hr" />
          <div className="sp-section-label">AUDIO</div>

          <div className="sg">
            <div className="toggle-row">
              <input type="checkbox" id="setting-sfx" defaultChecked />
              <label htmlFor="setting-sfx">Sound Effects (elimination, fanfare)</label>
            </div>
            <div className="range-row" style={{ marginTop: '8px' }}>
              <span>🔈</span>
              <input type="range" id="setting-sfx-vol" min="0" max="1" step="0.05" defaultValue="0.5" />
              <span>🔊</span>
            </div>
          </div>

          <div className="sg">
            <div className="toggle-row">
              <input type="checkbox" id="setting-music" defaultChecked />
              <label htmlFor="setting-music">Background Music</label>
            </div>
            <div className="range-row" style={{ marginTop: '8px' }}>
              <span>🔈</span>
              <input type="range" id="setting-music-vol" min="0" max="1" step="0.05" defaultValue="0.35" />
              <span>🔊</span>
            </div>
          </div>

          <div className="sg">
            <label>Upload Background Music (MP3 / OGG / WAV)</label>
            <input type="file" id="music-upload" accept="audio/*" />
          </div>

        </div>
      </div>
    </div>
  );
}
