import React, { useCallback, useEffect, useState } from 'react';

// "Physics" section for the landscape gameplay preview (royal-style panel).
// Gravity / Simulation speed / Impact particles / particle mesh are wired
// straight onto the project's own engine settings; "Perfectly elastic" is a
// locked readout because the engine's collisions are already lossless.
export default function PhysicsControls({ engineRef }) {
  const [gravity, setGravity] = useState(0);
  const [speed, setSpeed] = useState(100); // percent (100 = 1x)
  const [particles, setParticles] = useState(true);
  const [mesh, setMesh] = useState(false);

  const apply = useCallback(
    (patch) => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.settings = { ...(engine.settings || {}), ...patch };
      if (typeof window !== 'undefined') {
        window.__liveSettings = { ...(window.__liveSettings || {}), ...patch };
      }
    },
    [engineRef]
  );

  // Hydrate from the engine's current settings.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const s = engine.settings || {};
    if (typeof s.gravity === 'number') setGravity(s.gravity);
    if (typeof s.speedMult === 'number') setSpeed(Math.round(s.speedMult * 100));
    if (typeof s.particles === 'boolean') setParticles(s.particles);
    if (typeof s.mesh === 'boolean') setMesh(s.mesh);
  }, [engineRef]);

  // Reflect dashboard live-updates so the panel never drifts from the engine.
  useEffect(() => {
    const onMessage = (e) => {
      if (!e.data || e.data.type !== 'LIVE_SETTINGS_UPDATE') return;
      const gs = e.data.settings || {};
      if (gs.gravity !== undefined) setGravity(Number(gs.gravity));
      if (gs.speed !== undefined) setSpeed(Math.round(Number(gs.speed) * 100));
      if (gs.particles !== undefined) setParticles(Boolean(gs.particles));
      if (gs.mesh !== undefined) setMesh(Boolean(gs.mesh));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const gravityLabel = gravity === 0 ? 'Zero-G' : gravity >= 1 ? 'Heavy' : `${gravity.toFixed(2)} g`;

  return (
    <>
      <div className="section-heading">
        <h2>Physics</h2>
        <span className="physics-dot" />
      </div>

      <div className="slider-field">
        <div>
          <label htmlFor="ls-gravity">Gravity</label>
          <output htmlFor="ls-gravity">{gravityLabel}</output>
        </div>
        <input
          id="ls-gravity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={gravity}
          onChange={(e) => {
            const n = Number(e.target.value);
            setGravity(n);
            apply({ gravity: n });
          }}
        />
        <div className="range-caption"><span>Zero-G</span><span>Heavy</span></div>
      </div>

      <div className="slider-field">
        <div>
          <label htmlFor="ls-bounce">Perfectly elastic</label>
          <output htmlFor="ls-bounce">100% · forever</output>
        </div>
        <input id="ls-bounce" type="range" min="20" max="100" value="100" disabled readOnly />
        <div className="range-caption"><span>No friction or drag</span><span>No energy loss</span></div>
      </div>

      <div className="slider-field">
        <div>
          <label htmlFor="ls-speed">Simulation speed</label>
          <output htmlFor="ls-speed">{speed / 100}×</output>
        </div>
        <input
          id="ls-speed"
          type="range"
          min="25"
          max="300"
          step="25"
          value={speed}
          onChange={(e) => {
            const n = Number(e.target.value);
            setSpeed(n);
            apply({ speedMult: n / 100 });
          }}
        />
      </div>

      <label className="toggle-row">
        Impact particles
        <input
          type="checkbox"
          checked={particles}
          onChange={(e) => {
            const on = e.target.checked;
            setParticles(on);
            apply({ particles: on });
          }}
        />
        <span className="switch" />
      </label>

      <label className="toggle-row">
        Show particle mesh
        <input
          type="checkbox"
          checked={mesh}
          onChange={(e) => {
            const on = e.target.checked;
            setMesh(on);
            apply({ mesh: on });
          }}
        />
        <span className="switch" />
      </label>

      <div className="elastic-note">∞ &nbsp; No collision damage. Flags keep bouncing.</div>
    </>
  );
}
