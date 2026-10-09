import React, { useState, useEffect } from 'react';

export default function ControlsOverlay({ engineRef, isStream }) {
  const [showSettings, setShowSettings] = useState(false);
  const [channelWatermark, setChannelWatermark] = useState('@FlagsBattleSimulator');
  const [wmOpacity, setWmOpacity] = useState(0.15);
  const [wmSize, setWmSize] = useState(36);
  const [wmCount, setWmCount] = useState(3);
  const [wmAngle, setWmAngle] = useState(-15);

  // Gameplay & Chat Rules
  const [reviveVotes, setReviveVotes] = useState(4);
  const [audienceBias, setAudienceBias] = useState(true);

  // Physics
  const [rotSpeed, setRotSpeed] = useState(0.0035);
  const [gravity, setGravity] = useState(0.0);
  const [speedMult, setSpeedMult] = useState(1);
  const [sfx, setSfx] = useState(true);

  // Load existing settings on mount
  useEffect(() => {
    fetch('/api/status', {
      headers: {
        'x-login-key': localStorage.getItem('fb_login_key') || ''
      }
    })
      .then(r => r.json())
      .then(data => {
        const gs = data?.settings?.gameSettings;
        if (gs) {
          if (gs.watermark !== undefined) setChannelWatermark(gs.watermark);
          if (gs.wmOpacity !== undefined) setWmOpacity(Number(gs.wmOpacity));
          if (gs.wmSize !== undefined) setWmSize(Number(gs.wmSize));
          if (gs.wmCount !== undefined) setWmCount(Number(gs.wmCount));
          if (gs.wmAngle !== undefined) setWmAngle(Number(gs.wmAngle));
          if (gs.reviveVotes !== undefined) setReviveVotes(Number(gs.reviveVotes));
          if (gs.bias !== undefined) setAudienceBias(Boolean(gs.bias));
          if (gs.speed !== undefined) setSpeedMult(Number(gs.speed));
          if (gs.gravity !== undefined) setGravity(Number(gs.gravity));
        }
      })
      .catch(() => {});

    // Listen for live updates from dashboard iframe parent or server
    const handleMessage = (e) => {
      if (e.data && e.data.type === 'LIVE_SETTINGS_UPDATE') {
        const gs = e.data.settings;
        if (gs) {
          if (gs.watermark !== undefined) setChannelWatermark(gs.watermark);
          if (gs.wmOpacity !== undefined) setWmOpacity(Number(gs.wmOpacity));
          if (gs.wmSize !== undefined) setWmSize(Number(gs.wmSize));
          if (gs.wmCount !== undefined) setWmCount(Number(gs.wmCount));
          if (gs.wmAngle !== undefined) setWmAngle(Number(gs.wmAngle));
          if (gs.reviveVotes !== undefined) setReviveVotes(Number(gs.reviveVotes));
          if (gs.bias !== undefined) setAudienceBias(Boolean(gs.bias));
          if (gs.speed !== undefined) setSpeedMult(Number(gs.speed));
          if (gs.gravity !== undefined) setGravity(Number(gs.gravity));
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // When engine exists, apply settings to engine instance
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    
    engine.settings = engine.settings || {};
    engine.settings.watermark = channelWatermark;
    engine.settings.wmOpacity = wmOpacity;
    engine.settings.wmSize = wmSize;
    engine.settings.wmCount = wmCount;
    engine.settings.wmAngle = wmAngle;
    engine.settings.reviveVotes = Number(reviveVotes);
    engine.settings.bias = audienceBias;
    engine.settings.rotSpeed = Number(rotSpeed);
    engine.settings.gravity = Number(gravity);
    engine.settings.speedMult = Number(speedMult);
    
    engine.GATE_SPIN = Number(rotSpeed);
  }, [engineRef, channelWatermark, wmOpacity, wmSize, wmCount, wmAngle, reviveVotes, audienceBias, rotSpeed, gravity, speedMult]);

  // Handle Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const engine = engineRef.current;
      if (!engine) return;
      if (e.code === 'Space') {
        e.preventDefault();
        engine.start();
      } else if (e.key === 'p' || e.key === 'P') {
        engine.running = !engine.running;
      } else if (e.key === 'r' || e.key === 'R') {
        engine.newRound();
      } else if (e.key === 'm' || e.key === 'M') {
        engine.setSoundEnabled(!engine.soundEnabled);
        setSfx(engine.soundEnabled);
      } else if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engineRef]);

  const handleApplyAndSave = async () => {
    const engine = engineRef.current;
    if (engine) {
      engine.settings = engine.settings || {};
      engine.settings.watermark = channelWatermark;
      engine.settings.wmOpacity = wmOpacity;
      engine.settings.wmSize = wmSize;
      engine.settings.wmCount = wmCount;
      engine.settings.wmAngle = wmAngle;
      engine.settings.reviveVotes = Number(reviveVotes);
      engine.settings.bias = audienceBias;
      engine.settings.rotSpeed = Number(rotSpeed);
      engine.settings.gravity = Number(gravity);
      engine.settings.speedMult = Number(speedMult);
      engine.GATE_SPIN = Number(rotSpeed);
    }
    if (typeof window !== 'undefined') {
      window.__liveSettings = {
        watermark: channelWatermark,
        wmOpacity,
        wmSize,
        wmCount,
        wmAngle,
        reviveVotes: Number(reviveVotes),
        bias: audienceBias,
        rotSpeed: Number(rotSpeed),
        gravity: Number(gravity),
        speed: Number(speedMult),
      };
    }

    // Persist to server
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-login-key': localStorage.getItem('fb_login_key') || ''
        },
        body: JSON.stringify({
          gameSettings: {
            watermark: channelWatermark,
            wmOpacity,
            wmSize,
            wmCount,
            wmAngle,
            reviveVotes: Number(reviveVotes),
            bias: audienceBias,
            rotSpeed: Number(rotSpeed),
            gravity: Number(gravity),
            speed: Number(speedMult),
          }
        })
      });
    } catch (e) {
      console.warn('Could not persist settings to server:', e);
    }

    setShowSettings(false);
  };

  // Watermark element
  const watermarkComponent = (
    <div className="watermark-overlay" style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
      pointerEvents: 'none', zIndex: 1, overflow: 'hidden'
    }}>
      {Array.from({ length: wmCount }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: `${(i + 1) * (100 / (wmCount + 1))}%`,
          left: '50%',
          transform: `translate(-50%, -50%) rotate(${wmAngle}deg)`,
          opacity: wmOpacity,
          fontSize: `${wmSize}px`,
          fontWeight: 'bold',
          color: 'white',
          whiteSpace: 'nowrap',
          textShadow: '2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'
        }}>
          {channelWatermark}
        </div>
      ))}
    </div>
  );

  if (isStream) {
    // If it's a stream/recording, we ONLY render the watermark overlay!
    return watermarkComponent;
  }

  return (
    <>
      {watermarkComponent}

      {/* Bottom Controls Bar (Matches Vertical UI design) */}
      <div 
        id="controls-panel" 
        style={{ 
          zIndex: 50, 
          position: 'relative', 
          width: '100%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          gap: '8px', 
          padding: '6px 10px',
          background: 'rgba(8, 4, 4, 0.95)',
          borderTop: '1px solid rgba(180, 12, 12, 0.4)'
        }}
      >
        <div className="ctrl-group" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <button className="ctrl-btn primary" onClick={() => engineRef.current?.start()} title="Start Round (Space)">
            ▶ START
          </button>
          <button 
            className="ctrl-btn" 
            onClick={() => { 
              if (engineRef.current) engineRef.current.running = !engineRef.current.running; 
            }} 
            title="Pause (P)"
          >
            ⏸ PAUSE
          </button>
          <button className="ctrl-btn" onClick={() => engineRef.current?.newRound()} title="Full Reset (R)">
            ↺ RESET
          </button>
        </div>

        <div className="ctrl-group" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <label className="ctrl-label" style={{ fontSize: '11px', color: '#e0d8b0', letterSpacing: '0.5px' }}>
            Speed
          </label>
          <input 
            type="range" 
            min="1" 
            max="5" 
            step="0.5" 
            value={speedMult} 
            onChange={e => setSpeedMult(Number(e.target.value))} 
            style={{ width: '70px', accentColor: '#ff2222', cursor: 'pointer' }}
          />
          <span style={{ fontSize: '11px', color: '#ffd700', minWidth: '22px' }}>{speedMult}×</span>
        </div>

        <div className="ctrl-group" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <button 
            className="ctrl-btn icon" 
            onClick={() => { 
              if (engineRef.current) {
                engineRef.current.setSoundEnabled(!engineRef.current.soundEnabled);
                setSfx(engineRef.current.soundEnabled);
              }
            }} 
            title="Toggle Mute (M)"
          >
            {sfx ? '🔊' : '🔇'}
          </button>
          <button 
            className="ctrl-btn icon" 
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
              } else {
                document.exitFullscreen().catch(() => {});
              }
            }} 
            title="Toggle Fullscreen (F)"
          >
            ⛶
          </button>
          <button 
            className="ctrl-btn icon" 
            onClick={() => setShowSettings(true)} 
            title="Gameplay & Watermark Settings (⚙)"
            style={{ background: 'rgba(212,175,55,0.25)', borderColor: '#ffd700', color: '#ffd700', fontWeight: 'bold' }}
          >
            ⚙
          </button>
        </div>
      </div>

      <div 
        id="key-hint" 
        style={{ 
          textAlign: 'center', 
          fontSize: '9px', 
          color: 'rgba(255,255,255,0.4)', 
          padding: '2px 0 4px 0', 
          letterSpacing: '1px',
          background: 'rgba(4, 2, 2, 0.95)'
        }}
      >
        Space · P pause · R reset · M mute · F fullscreen · ⚙ settings
      </div>

      {/* Settings Modal Drawer */}
      <div 
        id="settings-panel" 
        className={showSettings ? 'open active' : ''} 
        aria-label="Settings" 
        style={{ zIndex: 10000 }}
      >
        <div className="sp-header">
          <h3>⚙ GAME & WATERMARK SETTINGS</h3>
          <button id="settings-close" onClick={handleApplyAndSave}>✕ APPLY & SAVE</button>
        </div>

        <div className="sp-body">
          {/* Section: BRANDING */}
          <div className="sp-section-label">BRANDING & WATERMARK</div>
          <div className="sg">
            <label>Channel Watermark</label>
            <input 
              type="text" 
              value={channelWatermark} 
              onChange={e => setChannelWatermark(e.target.value)} 
              placeholder="@YourChannel"
            />
          </div>

          <div className="sg">
            <label>Watermark Opacity</label>
            <div className="range-row">
              <span>0</span>
              <input type="range" min="0" max="1" step="0.01" value={wmOpacity} onChange={e => setWmOpacity(Number(e.target.value))} />
              <span>1</span>
            </div>
          </div>

          <div className="sg">
            <label>Watermark Font Size</label>
            <div className="range-row">
              <span>10</span>
              <input type="range" min="10" max="150" step="1" value={wmSize} onChange={e => setWmSize(Number(e.target.value))} />
              <span>150</span>
            </div>
          </div>

          <div className="sg">
            <label>Watermark Density (Count)</label>
            <div className="range-row">
              <span>1</span>
              <input type="range" min="1" max="10" step="1" value={wmCount} onChange={e => setWmCount(Number(e.target.value))} />
              <span>10</span>
            </div>
          </div>

          <div className="sg">
            <label>Watermark Angle (Degrees)</label>
            <div className="range-row">
              <span>-90°</span>
              <input type="range" min="-90" max="90" step="1" value={wmAngle} onChange={e => setWmAngle(Number(e.target.value))} />
              <span>90°</span>
            </div>
          </div>

          <hr className="sp-hr" />

          {/* Section: GAMEPLAY & CHAT RULES */}
          <div className="sp-section-label">GAMEPLAY & CHAT RULES</div>
          <div className="sg">
            <label>Comments / Votes Needed to Revive Flag</label>
            <input 
              type="number" 
              min="1" 
              max="50" 
              step="1" 
              value={reviveVotes} 
              onChange={e => setReviveVotes(Math.max(1, parseInt(e.target.value) || 1))} 
            />
            <small style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', marginTop: '2px', display: 'block' }}>
              When an eliminated country is commented this many times, it immediately revives into the battle.
            </small>
          </div>

          <div className="sg">
            <div className="toggle-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input 
                type="checkbox" 
                id="setting-bias-chk" 
                checked={audienceBias} 
                onChange={e => setAudienceBias(e.target.checked)} 
              />
              <label htmlFor="setting-bias-chk" style={{ fontSize: '11px', cursor: 'pointer' }}>
                Audience Retention Mode <small style={{ color: 'rgba(255,255,255,0.4)' }}>(AVD bias)</small>
              </label>
            </div>
          </div>

          <hr className="sp-hr" />

          {/* Section: PHYSICS & SPEED */}
          <div className="sp-section-label">PHYSICS & SPEED</div>
          <div className="sg">
            <label>Arena Rotation Speed</label>
            <input 
              type="number" 
              min="0" 
              max="0.05" 
              step="0.001" 
              value={rotSpeed} 
              onChange={e => setRotSpeed(Number(e.target.value))} 
            />
          </div>

          <div className="sg">
            <label>Gravity Magnitude (0 = Float, 1.0 = Downward pull)</label>
            <input 
              type="number" 
              min="0" 
              max="5" 
              step="0.1" 
              value={gravity} 
              onChange={e => setGravity(Number(e.target.value))} 
            />
          </div>
          
          <div className="sg">
            <label>Game Speed Multiplier</label>
            <input 
              type="number" 
              min="1" 
              max="5" 
              step="0.5" 
              value={speedMult} 
              onChange={e => setSpeedMult(Number(e.target.value))} 
            />
          </div>

          <div style={{ marginTop: '20px' }}>
            <button 
              onClick={handleApplyAndSave}
              style={{
                width: '100%',
                padding: '10px',
                background: 'linear-gradient(135deg, #b91c1c, #dc2626)',
                border: '1px solid #ef4444',
                borderRadius: '4px',
                color: 'white',
                fontWeight: 'bold',
                cursor: 'pointer',
                letterSpacing: '1px',
                fontSize: '11px'
              }}
            >
              ✓ SAVE & APPLY TO GAME
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
