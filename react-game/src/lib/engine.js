// FlagBattleEngine — framework-agnostic physics + tournament engine.
//
// Ported faithfully from the single-file prototype: circular arena with
// elastic (no energy loss) collisions, a rotating gate flags can exit
// through, a rotating "blocker" arc that temporarily seals the gate, a
// 6-stage tournament bracket, sprite-cached flag rendering (now backed by
// real flag-icons SVGs instead of hand-drawn vector shapes), a flying
// elimination animation, fireworks, synthesized Web Audio sound effects,
// and a Web Speech champion announcement.
//
// This class owns no DOM outside the <canvas> it's given. React components
// subscribe to state changes via the small event-emitter API below instead
// of the prototype's direct DOM manipulation.
//
// ---------------------------------------------------------------------
// Public API
//   new FlagBattleEngine(canvas, countries)   countries: [{code, name}]
//   engine.start()                             begins the render loop
//   engine.stop()                              cancels the render loop
//   engine.resize(width, height)               call on container resize
//   engine.setSoundEnabled(bool)
//   engine.shrinkArena()
//   engine.newRound()                          resets the whole tournament
//   engine.applyVoteBoost(code, boostFactor, durationMs)
//   engine.on(event, cb) / engine.off(event, cb)
//
// Events emitted (all payloads are plain objects, safe to setState with):
//   'hud'                 { alive, total, progressPct, roundNumber,
//                            stageLabel, qualifiedCount, stageTarget }
//   'winner'               { show, label, name, code } | { show: false }
//   'stage'                 { show, title, subtitle } | { show: false }
//   'eliminated'            full current array of {code, name} chips, oldest first
//   'qualifiedListChanged'  { title, rows: [{idx, code, name}] } (already
//                            windowed to the current 3-row rotation)
//   'timer'                 { mm, ss } (string-padded, once per second)
//   'soundChanged'          { enabled }
// ---------------------------------------------------------------------

import { REGION_ORDER, REGION_META, getRegion } from '../data/regions.js';

const STAGES = [
  { label: 'QUALIFYING', target: 32 },
  { label: 'ROUND OF 32', target: 16 },
  { label: 'ROUND OF 16', target: 8 },
  { label: 'QUARTERFINALS', target: 4 },
  { label: 'SEMIFINALS', target: 2 },
  { label: 'FINAL', target: 1 },
];

function rand(min, max) {
  return min + Math.random() * (max - min);
}
function norm(a) {
  while (a < 0) a += Math.PI * 2;
  while (a >= Math.PI * 2) a -= Math.PI * 2;
  return a;
}
function angleDiff(a, b) {
  let d = norm(a - b);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

function randomFlagMotion() {
  return { angle: rand(0, Math.PI * 2), spin: rand(-0.2, 0.2) };
}

// High-viewership countries protected by the vertical engine's clutch
// near-miss audience-retention behavior.
const POPULAR_COUNTRY_CODES = [
  'IN', 'US', 'ID', 'BR', 'MX', 'JP', 'DE', 'VN', 'PH', 'TR',
  'PK', 'GB', 'FR', 'BD', 'EG', 'TH', 'KR', 'IT', 'ES', 'CA',
];

// Angular slack on each side of a pocket, matching vertical's one-segment
// neighbour tolerance (1/60th of a full turn).
const GATE_EDGE_TOLERANCE = (2 * Math.PI) / 60;

class EventEmitter {
  constructor() {
    this._listeners = new Map();
  }
  on(event, cb) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(cb);
    return () => this.off(event, cb);
  }
  off(event, cb) {
    const set = this._listeners.get(event);
    if (set) set.delete(cb);
  }
  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    set.forEach((cb) => {
      try {
        cb(payload);
      } catch (e) {
        // A subscriber error should never crash the engine's render loop.
        console.error(`[FlagBattleEngine] listener for "${event}" threw:`, e);
      }
    });
  }
}

export class FlagBattleEngine extends EventEmitter {
  constructor(canvas, countries) {
    super();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._pixelRatio = 1;
    this._canvasPixelW = 0;
    this._canvasPixelH = 0;
    this._applyCanvasScale();
    this.countries = countries; // [{code, name}]
    this.countryNames = countries.reduce((acc, c) => {
      acc[c.code] = c.name;
      return acc;
    }, {});
    this.countryCodes = countries.map((c) => c.code);

    // ---- Arena / stage geometry ----
    this.STAGE_W = canvas.width || 800;
    this.STAGE_H = canvas.height || 600;
    this.CENTER = this._computeCenter(this.STAGE_W, this.STAGE_H);
    this.ARENA_RADIUS = this._computeArenaRadius(this.STAGE_W, this.STAGE_H);
    this.FLAG_R = this._computeFlagR();

    // Four permanent elimination pockets, matching the vertical engine. They
    // rotate together; the wall itself stays a continuous electric ring.
    this.GATES = [0, 1, 2, 3].map((pocket) => ({
      angle: pocket * (Math.PI / 2),
      half: (3 * ((Math.PI * 2) / 60)) / 2,
    }));
    this.GATE_SPIN = 0.0028;
    this._frame = 0;
    this._suspenseIntensity = 0;
    this._physAccum = 0;
    this._lastStepTs = 0;

    this.flags = [];
    this.running = true;
    this._rafId = null;

    this.roundNumber = 0;
    this.roundStartTime = Date.now();

    this.stagePool = [];
    this.qualifiedDisplayList = []; // [{code, idx}] campaign champions (winners list)
    this.qpRotationIndex = 0;

    // ---- Campaign flow (vertical parity) ----
    this.phase = 'qualifier';   // 'qualifier' | 'final'
    this.campaignNum = 1;
    this.finalists = [];
    this.teams = null;
    this.teamStats = null;
    this._teamSig = null;
    this._codeIndex = null;
    this._roundEnding = false;
    this._epoch = 0;

    this.fallingFlags = [];
    this.eliminatedList = []; // {code, name} — oldest first, mirrors the DOM chip strip
    this.fireworks = [];
    this.particles = []; // short-lived vertical-style elimination/boost debris

    // ---- Sound state ----
    this.soundEnabled = true;
    this.audioCtx = null;
    this.ambienceGain = null;
    this.ambienceStarted = false;
    this.lastThumpTime = 0;

    // ---- Settings ----
    this.settings = {
      reviveVotes: 4,
      gravity: 0.0,
      rotSpeed: 0.0028,
      speedMult: 1.0,
      bias: true,
      particles: true, // vertical-style impact particle debris
      mesh: false, // optional diagnostic lattice; vertical gameplay leaves it off
      watermark: '@FlagsBattleSimulator'
    };
    if (typeof window !== 'undefined' && window.__liveSettings) {
      this.settings = { ...this.settings, ...window.__liveSettings };
    }

    // ---- Comment Votes per Country (track & show revive progress) ----
    this.commentVotes = {};

    // ---- Vote-boost (temporary speed/resilience multiplier for a code) ----
    this._voteBoosts = new Map(); // code -> { factor, until }

    // ---- Power states ----
    this._slowUntil = 0;   // global slow-motion end timestamp
    this._slowFactor = 1;  // global speed multiplier while slowing
    this._suspenseSlow = false; // vertical-style Top 3 bullet-time state
    this._suspenseNotice = null;
    this._heartbeatTimer = null;
    this._resetSuspenseMilestones();

    this._sprites = new Map(); // code -> { img, canvas, ready }
    this._timerInterval = null;
    this._qpRotationInterval = null;

    // ---- Comment shoutout voice queue (vertical parity) ----
    this._shoutoutQueue = [];
    this._shoutoutBusy = false;
    this._shoutoutTimer = null;
    this._shoutoutFallback = null;
    this._shoutoutCooldownUntil = 0;
    this._lastShoutoutKey = null;
    this._lastShoutoutAt = 0;

    this._bindResize = this._bindResize.bind(this);
  }

  // ================= Public API =================

  start() {
    this.commentVotes = {};
    this.emit('commentVotes', { ...this.commentVotes });
    if (!this._timerInterval) this._timerInterval = setInterval(() => this._tickTimer(), 1000);
    if (!this._qpRotationInterval) this._qpRotationInterval = setInterval(() => this._rotateQualifiedList(), 4200);
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this._bindResize);
    }
    this._beginQualifier();
    this._loop();
  }

  /* Fresh qualifying round with the full (or configured) country pool. */
  _beginQualifier() {
    this.phase = 'qualifier';
    this.finalists = [];
    this._epoch++;
    this._roundEnding = false;
    const pool = this._shuffled(this.countryCodes.slice());
    const numToSpawn = parseInt(this._readSetting('totalCountries', 195), 10) || 195;
    this.stagePool = pool.slice(0, Math.min(numToSpawn, pool.length));
    this.running = true;
    this._spawnFlags();
  }

  /* The Grand Final: the top 4 flags battle in slow motion. */
  _beginFinal() {
    this.phase = 'final';
    this._epoch++;
    this._roundEnding = false;
    this._slowUntil = Date.now() + 999999; // slow-motion for the whole final
    this._slowFactor = 0.45;
    this.stagePool = this.finalists.slice(0, 4);
    this.running = true;
    this._spawnFlags();
  }

  stop() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    if (this._timerInterval) clearInterval(this._timerInterval);
    if (this._qpRotationInterval) clearInterval(this._qpRotationInterval);
    this._stopHeartbeat();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this._bindResize);
    }
    clearTimeout(this._shoutoutTimer);
    clearTimeout(this._shoutoutFallback);
    this._shoutoutQueue = [];
    this._shoutoutBusy = false;
  }

  resize(width, height) {
    const newW = Math.max(1, Math.round(width));
    const newH = Math.max(100, Math.round(height));
    const pixelRatio = typeof window !== 'undefined' && window.devicePixelRatio
      ? Math.min(Math.max(1, window.devicePixelRatio), 2)
      : 1;
    const pixelW = Math.max(1, Math.round(newW * pixelRatio));
    const pixelH = Math.max(1, Math.round(newH * pixelRatio));
    if (newW === this.STAGE_W && newH === this.STAGE_H && pixelW === this._canvasPixelW && pixelH === this._canvasPixelH) {
      this._applyCanvasScale();
      return;
    }
    this.STAGE_W = newW;
    this.STAGE_H = newH;
    this._pixelRatio = pixelRatio;
    this._canvasPixelW = pixelW;
    this._canvasPixelH = pixelH;
    this.canvas.width = pixelW;
    this.canvas.height = pixelH;
    this._applyCanvasScale();
    this.ARENA_RADIUS = this._computeArenaRadius(newW, newH);
    this.FLAG_R = this._computeFlagR();
    this.CENTER = this._computeCenter(newW, newH);
  }

  _applyCanvasScale() {
    const scale = this._pixelRatio || 1;
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    try {
      this.ctx.imageSmoothingQuality = 'high';
    } catch (e) {
      /* ignore */
    }
  }

  setSoundEnabled(enabled) {
    this.soundEnabled = enabled;
    if (!enabled) this._stopHeartbeat();
    this._ensureAudio();
    this._startCrowdAmbience();
    if (this.ambienceGain) this.ambienceGain.gain.value = enabled ? 0.05 : 0;
    if (!enabled) {
      if (this._currentVoiceAudio) {
        try { this._currentVoiceAudio.pause(); } catch(e){}
        this._currentVoiceAudio = null;
      }
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
    this.emit('soundChanged', { enabled });
  }

  shrinkArena() {
    this.ARENA_RADIUS = Math.max(180, this.ARENA_RADIUS - 50);
  }

  newRound() {
    this.commentVotes = {};
    this.emit('commentVotes', { ...this.commentVotes });
    this.qualifiedDisplayList = [];
    this.qpRotationIndex = 0;
    this.campaignNum = 1;
    this._physAccum = 0;
    this._lastStepTs = 0;
    this.teams = null;
    this.teamStats = null;
    this._teamSig = null;
    this._slowUntil = 0;
    this._slowFactor = 1;
    this.ARENA_RADIUS = this._computeArenaRadius(this.STAGE_W, this.STAGE_H);
    this.emit('teams', null);
    this._emitQualifiedList();
    this._beginQualifier();
  }

  // Vertical-style chat boost: a strong inward push plus a temporary cyan
  // highlight. The factor/duration arguments remain for dashboard callers.
  applyVoteBoost(countryCode, boostFactor = 1.4, durationMs = 5000) {
    if (!countryCode) return;
    const upper = countryCode.trim().toUpperCase();
    const now = Date.now();
    const until = now + durationMs;
    for (const [code, entry] of this._voteBoosts) {
      if (entry.until <= now) this._voteBoosts.delete(code);
    }
    this._voteBoosts.set(upper, { factor: boostFactor, until });
    const flag = this.flags.find((f) => (f.code || '').toUpperCase() === upper);
    if (!flag || !flag.alive) return;
    const dx = this.CENTER.x - flag.x;
    const dy = this.CENTER.y - flag.y;
    const d = Math.hypot(dx, dy) || 1;
    flag.vx = (dx / d) * 8;
    flag.vy = (dy / d) * 8;
    flag.spin = rand(-0.75, 0.75);
    flag.chatBoostEnd = until;
    this._spawnVerticalBurst(flag.x, flag.y, '#88ccff');
  }

  // Hybrid Super Chat powers (parity with vertical engine). Utility powers
  // work for free comments too; NUKE/instant-REVIVE are gated server-side.
  applyPower(power = {}) {
    const p = (power.power || '').toLowerCase();
    if (!p) return;
    const code = power.code;
    const paid = Boolean(power.superChat);
    const weight = Math.max(1, Number(power.weight) || 1);
    const dur = (base) => Math.round(paid ? base * 1.75 : base);
    const targetCode = code ? this._resolveCountryCode(code) : null;
    const flag = targetCode ? this.flags.find(f => (f.code || '').toUpperCase() === targetCode) : null;
    const author = power.author || power.displayName || power.name || '';
    const tname = targetCode ? (this.countryNames[targetCode] || targetCode) : 'the whole arena';

    switch (p) {
      case 'revive': {
        if (!targetCode) return;
        const isElim = this.eliminatedList.some(e => (e.code || '').toUpperCase() === targetCode);
        if (!isElim) {
          if (flag && !flag.alive) {
            flag.alive = true;
            flag.x = this.CENTER.x + (Math.random() * 30 - 15);
            flag.y = this.CENTER.y + (Math.random() * 30 - 15);
            this._reviveFlagMotion(flag);
            flag.flashUntil = Date.now() + 4500;
            flag.immunityUntil = Date.now() + 4500;
            this._emitHud();
            this._queueShoutout(author, tname, 'revived');
          }
          return;
        }
        const elimEntry = this.eliminatedList.find(e => (e.code || '').toUpperCase() === targetCode);
        if (!flag) {
          this.flags.push({
            code: targetCode,
            country: { code: targetCode, name: this.countryNames[targetCode] || elimEntry?.name || targetCode },
            x: this.CENTER.x, y: this.CENTER.y, r: this.FLAG_R, vx: 0, vy: 0, alive: false,
          });
        }
        const rf = this.flags.find(f => (f.code || '').toUpperCase() === targetCode);
        rf.alive = true;
        rf.x = this.CENTER.x + (Math.random() * 30 - 15);
        rf.y = this.CENTER.y + (Math.random() * 30 - 15);
        this._reviveFlagMotion(rf);
        rf.flashUntil = Date.now() + 4500;
        rf.immunityUntil = Date.now() + 4500;
        this.eliminatedList = this.eliminatedList.filter(e => (e.code || '').toUpperCase() !== targetCode);
        this.emit('eliminated', this.eliminatedList.slice());
        this._emitHud();
        this._queueShoutout(author, tname, 'revived');
        return;
      }
      case 'shield': {
        const isElim = this.eliminatedList.some(e => (e.code || '').toUpperCase() === targetCode);
        if (isElim) {
          // If flag is eliminated, "save/shield" acts as a revive vote
          this.instantPush(targetCode, weight, author, paid);
          return;
        }
        if (flag && flag.alive) {
          flag.immunityUntil = Date.now() + dur(6000);
          flag.flashUntil = Date.now() + dur(6000);
        }
        this.emit('power', { power: 'shield', code: targetCode });
        this._queueShoutout(author, tname, 'shielded');
        return;
      }
      case 'freeze': {
        if (flag && flag.alive) {
          flag.frozenUntil = Date.now() + dur(4500);
          flag.vx = 0; flag.vy = 0;
        }
        this.emit('power', { power: 'freeze', code: targetCode });
        this._queueShoutout(author, tname, 'froze');
        return;
      }
      case 'slow': {
        if (targetCode && flag && flag.alive) {
          // Targeted: "slow US" slows down just that country's flag.
          flag.slowUntil = Date.now() + dur(5000);
          this.emit('power', { power: 'slow', code: targetCode });
          this._queueShoutout(author, tname, 'slowed');
        } else {
          this._slowUntil = Date.now() + dur(5000);
          this._slowFactor = 0.45;
          this.emit('power', { power: 'slow' });
          this._queueShoutout(author, 'the whole arena', 'slowed');
        }
        return;
      }
      case 'quake': {
        const mag = paid ? 9 : 6;
        this.flags.filter(f => f.alive).forEach(f => {
          const a = Math.random() * Math.PI * 2;
          f.vx = Math.cos(a) * mag;
          f.vy = Math.sin(a) * mag;
          f.spin = rand(-0.75, 0.75);
        });
        this._playWhoosh();
        this.emit('power', { power: 'quake' });
        this._queueShoutout(author, 'the whole arena', 'shook');
        return;
      }
      case 'boost': {
        if (flag && flag.alive) {
          const dx = this.CENTER.x - flag.x;
          const dy = this.CENTER.y - flag.y;
          const d = Math.hypot(dx, dy) || 1;
          const mag = (paid ? 11 : 8) + Math.min(weight, 30) * 0.1;
          flag.vx = (dx / d) * mag;
          flag.vy = (dy / d) * mag;
          flag.spin = rand(-0.75, 0.75);
          flag.chatBoostEnd = Date.now() + dur(2500);
          this._spawnVerticalBurst(flag.x, flag.y, '#88ccff');
        }
        this.emit('power', { power: 'boost', code: targetCode });
        this._queueShoutout(author, tname, 'boosted');
        return;
      }
      case 'nuke': {
        if (flag && flag.alive) this._eliminate(flag);
        this.emit('power', { power: 'nuke', code: targetCode });
        this._queueShoutout(author, tname, 'nuked');
        return;
      }
      default:
        return;
    }
  }

  _resolveCountryCode(input) {
    if (!input) return null;
    const searchToken = String(input).trim().toUpperCase();
    const ALIASES = {
      'USA': 'US','AMERICA':'US','UNITED STATES':'US','UNITED STATES OF AMERICA':'US',
      'UK':'GB','BRITAIN':'GB','ENGLAND':'GB','UAE':'AE','EMIRATES':'AE',
      'KOREA':'KR','SOUTH KOREA':'KR','RUSSIA':'RU'
    };
    let targetCode = ALIASES[searchToken] || searchToken;
    const found = this.countries.find(c =>
      c.code.toUpperCase() === targetCode ||
      c.name.toUpperCase() === searchToken ||
      c.name.toUpperCase() === targetCode
    );
    if (found) targetCode = found.code.toUpperCase();
    return targetCode;
  }

  instantPush(countryCode, weight = 1, author = '', superChat = false) {
    if (!countryCode) return;
    const searchToken = countryCode.trim().toUpperCase();
    
    // Resolve code from code or name or common aliases
    const ALIASES = {
      'USA': 'US',
      'AMERICA': 'US',
      'UNITED STATES': 'US',
      'UNITED STATES OF AMERICA': 'US',
      'UK': 'GB',
      'BRITAIN': 'GB',
      'ENGLAND': 'GB',
      'UAE': 'AE',
      'EMIRATES': 'AE',
      'KOREA': 'KR',
      'SOUTH KOREA': 'KR',
      'RUSSIA': 'RU'
    };

    let targetCode = ALIASES[searchToken] || searchToken;
    const foundCountry = this.countries.find(c => 
      c.code.toUpperCase() === targetCode || 
      c.name.toUpperCase() === searchToken ||
      c.name.toUpperCase() === targetCode
    );
    if (foundCountry) {
      targetCode = foundCountry.code.toUpperCase();
    }
    
    let flag = this.flags.find((f) => (f.code || '').toUpperCase() === targetCode);
    const isEliminated = !flag || !flag.alive || this.eliminatedList.some(e => (e.code || '').toUpperCase() === targetCode);
    
    if (isEliminated) {
      this.commentVotes[targetCode] = (this.commentVotes[targetCode] || 0) + (weight || 1);
      const targetVotes = (this.settings && this.settings.reviveVotes !== undefined) 
        ? Math.max(1, Number(this.settings.reviveVotes))
        : (typeof window !== 'undefined' && window.__liveSettings?.reviveVotes ? Math.max(1, Number(window.__liveSettings.reviveVotes)) : 4);
      
      const currentVotes = this.commentVotes[targetCode];
      this.emit('commentVotes', { ...this.commentVotes });
      
      if (superChat || currentVotes >= targetVotes) {
        // Flag earned enough comments to be revived!
        delete this.commentVotes[targetCode];
        this.emit('commentVotes', { ...this.commentVotes });

        if (!flag) {
          const elimEntry = this.eliminatedList.find(e => (e.code || '').toUpperCase() === targetCode);
          flag = {
            code: targetCode,
            country: { code: targetCode, name: this.countryNames[targetCode] || elimEntry?.name || targetCode },
            x: this.CENTER.x,
            y: this.CENTER.y,
            r: this.FLAG_R,
            vx: 0,
            vy: 0,
            alive: false,
          };
          this.flags.push(flag);
        }

        flag.alive = true;
        // Spawn back safely near the center of the arena
        flag.x = this.CENTER.x + (Math.random() * 30 - 15);
        flag.y = this.CENTER.y + (Math.random() * 30 - 15);
        this._reviveFlagMotion(flag);
        flag.flashUntil = Date.now() + 4500;
        flag.immunityUntil = Date.now() + 4500;
        
        // Remove from eliminated list
        this.eliminatedList = this.eliminatedList.filter(e => (e.code || '').toUpperCase() !== targetCode);
        this.emit('eliminated', this.eliminatedList.slice());
        this._emitHud();
        
        if (this.soundEnabled) {
          this._playTone(1046, 0.6, 'sawtooth', 0, 0.2);
          const countryName = this.countryNames[targetCode] || targetCode;
          this._queueShoutout(author || 'The chat', countryName, 'revived');
        }
      }
      return;
    }

    // A plain country-name comment (or "!vote X") is a SAVE move: reverse the
    // flag's momentum so viewers can pull it back from the elimination gate,
    // and slow it briefly so the turnaround reads clearly on stream.
    const vx = -flag.vx;
    const vy = -flag.vy;

    if (Math.abs(vx) + Math.abs(vy) < 0.6) {
      // Nearly still: aim a firm nudge back toward the arena centre so the
      // save still visibly moves the flag.
      const dx = this.CENTER.x - flag.x;
      const dy = this.CENTER.y - flag.y;
      const dist = Math.hypot(dx, dy) || 1;
      flag.vx = (dx / dist) * 3.2;
      flag.vy = (dy / dist) * 3.2;
    } else {
      // Reverse direction (to the opposite side) with an extra kick for big Supers.
      const kick = 1.15 + Math.min(weight, 40) * 0.01;
      flag.vx = vx * kick;
      flag.vy = vy * kick;
    }

    // Brief slow-motion so the turnaround is easy to see.
    flag.slowUntil = Date.now() + Math.min(3000, 1500 + weight * 25);
    this._spawnVerticalBurst(flag.x, flag.y, '#66ff99');
    
    if (weight > 1 && this.soundEnabled) {
      this._playTone(880, 0.3, 'square', 0, 0.2 * Math.min(weight, 2));
      if (author) {
        const countryName = this.countryNames[flag.code] || flag.code;
        this._queueShoutout(author, countryName, 'saved');
      }
    }
  }

  // ================= Sound & TTS =================

  _speakNatural(text, onEnd) {
    if (!this.soundEnabled) { if (onEnd) onEnd(); return; }

    if (this._currentVoiceAudio) {
      try {
        this._currentVoiceAudio.pause();
        this._currentVoiceAudio.currentTime = 0;
      } catch (e) {}
      this._currentVoiceAudio = null;
    }
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }

    this._isVoicePlaying = true;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      this._isVoicePlaying = false;
      this._currentVoiceAudio = null;
      if (onEnd) onEnd();
    };

    // Use /api/tts audio endpoint. This routes directly into PulseAudio on Linux/VPS
    // and works reliably in headless Chromium where browser SpeechSynthesis has no voices.
    try {
      const audio = new Audio('/api/tts?text=' + encodeURIComponent(text));
      audio.volume = 1.0;
      this._currentVoiceAudio = audio;
      audio.onended = done;
      audio.onerror = () => {
        this._fallbackBrowserSpeak(text, done);
      };
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          this._fallbackBrowserSpeak(text, done);
        });
      }
    } catch (e) {
      this._fallbackBrowserSpeak(text, done);
    }
  }

  _fallbackBrowserSpeak(text, onEnd) {
    if (!('speechSynthesis' in window)) { if (onEnd) onEnd(); return; }
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 1.0;
      u.pitch = 1.0;
      u.onend = u.onerror = () => { if (onEnd) onEnd(); };
      window.speechSynthesis.speak(u);
    } catch (e) {
      if (onEnd) onEnd();
    }
  }

  // ---- Comment shoutouts: voice thanks so chat engagement is announced ----

  _cleanAuthorName(author) {
    let n = String(author ?? '').replace(/^@+/, '').replace(/\s+/g, ' ').trim();
    if (!n || /^(chat|unknown|undefined|null|nan)$/i.test(n)) return '';
    if (n.length > 18) {
      n = n.slice(0, 18);
      const sp = n.lastIndexOf(' ');
      if (sp > 8) n = n.slice(0, sp);
    }
    return n;
  }

  _queueShoutout(author, target, verb) {
    const name = this._cleanAuthorName(author);
    if (!name) return;
    const key = `${name}|${verb}|${target}`;
    if (this._shoutoutQueue.some((s) => s.key === key)) return;
    if (this._lastShoutoutKey === key && Date.now() - (this._lastShoutoutAt || 0) < 20000) return;
    this._shoutoutQueue.push({ key, name, target, verb });
    if (this._shoutoutQueue.length > 6) {
      this._shoutoutQueue.splice(0, this._shoutoutQueue.length - 6);
    }
    this._drainShoutouts();
  }

  _drainShoutouts() {
    clearTimeout(this._shoutoutTimer);
    if (this._shoutoutBusy || !this._shoutoutQueue.length) return;

    const now = Date.now();
    if (now < this._shoutoutCooldownUntil) {
      this._shoutoutTimer = setTimeout(() => this._drainShoutouts(), this._shoutoutCooldownUntil - now + 25);
      return;
    }
    // Never talk over a priority announcement / voice CTA that is already playing.
    if (this._isVoicePlaying || ('speechSynthesis' in window && window.speechSynthesis.speaking)) {
      this._shoutoutTimer = setTimeout(() => this._drainShoutouts(), 1200);
      return;
    }

    const s = this._shoutoutQueue.shift();
    this._lastShoutoutKey = s.key;
    this._lastShoutoutAt = Date.now();
    const lead = ['Shoutout to', 'Big thanks to', 'Power from', 'Respect to'][Math.floor(Math.random() * 4)];
    const line = `${lead} ${s.name}! You ${s.verb} ${s.target}!`;

    this._shoutoutBusy = true;
    const finish = () => {
      if (!this._shoutoutBusy) return;
      this._shoutoutBusy = false;
      this._shoutoutCooldownUntil = Date.now() + 1500;
      this._drainShoutouts();
    };
    this._speakNatural(line, finish);
    clearTimeout(this._shoutoutFallback);
    this._shoutoutFallback = setTimeout(() => {
      if (this._shoutoutBusy) {
        this._shoutoutBusy = false;
        this._shoutoutCooldownUntil = Date.now() + 1200;
        this._drainShoutouts();
      }
    }, Math.max(3200, line.length * 90));
  }

  _triggerVoiceCTA() {
    if (!this.running || !this.soundEnabled) return;
    
    const aliveFlags = this.flags.filter(f => f.alive);
    const randomCountry = aliveFlags.length > 0
      ? (this.countryNames[aliveFlags[Math.floor(Math.random() * aliveFlags.length)].code] || 'your country')
      : 'your country';

    const prompts = [
      'Comment your country to save your flag!',
      `${randomCountry} is still alive! Comment to save it!`,
      `${aliveFlags.length} flags still fighting! Who will survive?`,
      `Can ${randomCountry} make it to the Grand Final?`,
      'Did your country get eliminated? Comment its name 4 times to revive it!',
      'Superchats instantly revive eliminated countries or save them with a super boost!'
    ];
    
    this._speakNatural(prompts[Math.floor(Math.random() * prompts.length)]);
  }

  _ensureAudio() {
    if (!this.audioCtx) {
      const AudioCtxClass = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
      if (!AudioCtxClass) return null;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') this.audioCtx.resume();
    return this.audioCtx;
  }

  _startCrowdAmbience() {
    if (this.ambienceStarted) return;
    const c = this._ensureAudio();
    if (!c) return;
    this.ambienceStarted = true;
    const bufferSize = c.sampleRate * 2;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    // Two cascaded lowpass stages — keeps only a low rumble, like a distant
    // crowd murmur, rather than radio-static hiss from a single bandpass.
    const filter1 = c.createBiquadFilter();
    filter1.type = 'lowpass';
    filter1.frequency.value = 380;
    filter1.Q.value = 0.3;
    const filter2 = c.createBiquadFilter();
    filter2.type = 'lowpass';
    filter2.frequency.value = 220;
    filter2.Q.value = 0.3;
    this.ambienceGain = c.createGain();
    this.ambienceGain.gain.value = this.soundEnabled ? 0.05 : 0;
    src.connect(filter1);
    filter1.connect(filter2);
    filter2.connect(this.ambienceGain);
    this.ambienceGain.connect(c.destination);
    src.start();
  }

  _playTone(freq, duration, type, delay, peak) {
    if (!this.soundEnabled) return;
    const c = this._ensureAudio();
    if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak || 0.14, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  _playQualifyChime() {
    this._playTone(660, 0.12, 'triangle', 0, 0.1);
    this._playTone(880, 0.16, 'triangle', 0.1, 0.1);
  }
  _playStageFanfare() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._playTone(f, 0.28, 'triangle', i * 0.12, 0.13));
  }
  _playChampionFanfare() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this._playTone(f, 0.4, 'sawtooth', i * 0.1, 0.1));
  }
  _playWhoosh() {
    if (!this.soundEnabled) return;
    const c = this._ensureAudio();
    if (!c) return;
    const bufferSize = Math.floor(c.sampleRate * 0.22);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1100, c.currentTime);
    filter.frequency.exponentialRampToValueAtTime(280, c.currentTime + 0.22);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.06, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.22);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    src.start();
  }

  // Dramatic cinematic boom hit for Top 5 / Top 3 suspense.
  _playDramaticHit() {
    if (!this.soundEnabled) return;
    const c = this._ensureAudio();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(35, c.currentTime + 0.65);
    gain.gain.setValueAtTime(0.35, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.65);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.66);
  }

  // Realistic double-pulse heartbeat (lub-dub) for Top 3 suspense.
  _startHeartbeat(fast = false) {
    this._stopHeartbeat();
    if (!this.soundEnabled) return;
    const beat = () => {
      if (!this.soundEnabled) return;
      const c = this._ensureAudio();
      if (!c) return;
      try {
        const t0 = c.currentTime;
        const osc1 = c.createOscillator();
        const gain1 = c.createGain();
        osc1.connect(gain1);
        gain1.connect(c.destination);
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(70, t0);
        osc1.frequency.exponentialRampToValueAtTime(42, t0 + 0.11);
        gain1.gain.setValueAtTime(0.28, t0);
        gain1.gain.exponentialRampToValueAtTime(0.001, t0 + 0.11);
        osc1.start(t0);
        osc1.stop(t0 + 0.12);

        const t1 = t0 + 0.14;
        const osc2 = c.createOscillator();
        const gain2 = c.createGain();
        osc2.connect(gain2);
        gain2.connect(c.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(80, t1);
        osc2.frequency.exponentialRampToValueAtTime(46, t1 + 0.13);
        gain2.gain.setValueAtTime(0.32, t1);
        gain2.gain.exponentialRampToValueAtTime(0.001, t1 + 0.13);
        osc2.start(t1);
        osc2.stop(t1 + 0.14);
      } catch (e) {
        /* ignore */
      }
    };

    beat();
    this._heartbeatTimer = setInterval(beat, fast ? 620 : 840);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  _playNearMiss() {
    if (!this.soundEnabled) return;
    const c = this._ensureAudio();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, c.currentTime + 0.16);
    gain.gain.setValueAtTime(0.10, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.16);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.17);
  }

  _playThump() {
    if (!this.soundEnabled) return;
    const c = this._ensureAudio();
    if (!c) return;
    const now = c.currentTime;
    if (now - this.lastThumpTime < 0.05) return; // 50ms throttle
    this.lastThumpTime = now;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.09);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  _speakChampion(name) {
    if (!this.soundEnabled) return;
    this._speakNatural('The winner is ' + name + '! Congratulations!');
  }

  // Call on the first user gesture (e.g. a control button click) to satisfy
  // the browser's autoplay policy and "warm up" speech synthesis.
  primeAudioOnGesture() {
    this._ensureAudio();
    this._startCrowdAmbience();
    if ('speechSynthesis' in window) {
      try {
        const warm = new SpeechSynthesisUtterance(' ');
        warm.volume = 0;
        window.speechSynthesis.speak(warm);
      } catch (e) {
        /* ignore */
      }
    }
  }

  // ================= Campaign state machine (vertical parity) =================

  _shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  _readSetting(key, fallback) {
    const live = (typeof window !== 'undefined' && window.__liveSettings) || {};
    let v = this.settings && this.settings[key] !== undefined ? this.settings[key] : undefined;
    if (v === undefined) v = live[key];
    return v === undefined || v === null || v === '' ? fallback : v;
  }

  _resetSuspenseMilestones() {
    this._totalCount = this.stagePool.length;
    this._suspenseMilestones = {
      halfway: false,
      hundred: false,
      quarter: false,
      ten: false,
      cta8: false,
      top5: false,
      top3: false,
      top2: false,
    };
    this._suspenseSlow = false;
    this._suspenseNotice = null;
    this._stopHeartbeat();
  }

  _showSuspenseNotice(title, detail = '', kind = 'milestone', duration = 3200) {
    this._suspenseNotice = { title, detail, kind, until: Date.now() + duration };
  }

  _updateSuspenseMilestones() {
    const alive = this.flags.reduce((count, f) => count + (f.alive ? 1 : 0), 0);
    const total = this._totalCount || this.flags.length || this.stagePool.length;
    const done = this._suspenseMilestones;
    if (!done) return;

    if (!done.halfway && total > 1 && alive <= Math.floor(total / 2)) {
      done.halfway = true;
      this._showSuspenseNotice('🔥 HALFWAY POINT!');
      this._speakNatural('We are at the halfway point! Which countries will survive?');
    }
    if (!done.hundred && total - alive >= 100) {
      done.hundred = true;
      this._showSuspenseNotice('💥 100 FLAGS ELIMINATED!');
    }
    if (!done.quarter && total > 3 && alive <= Math.floor(total / 4)) {
      done.quarter = true;
      this._showSuspenseNotice(`⚡ ONLY ${alive} FLAGS LEFT!`);
      this._speakNatural(`Only ${alive} countries remain! Is your flag still alive?`);
    }
    if (!done.ten && alive === 10) {
      done.ten = true;
      this._showSuspenseNotice('🏆 TOP 10 SURVIVORS!');
    }
    if (!done.cta8 && alive <= 8) {
      done.cta8 = true;
      this._speakNatural('Comment your country to save your flag!');
    }
    if (!done.top5 && alive === 5) {
      done.top5 = true;
      this._playDramaticHit();
      this._showSuspenseNotice('🔥 TOP 5 SURVIVORS!');
    }
    if (!done.top3 && alive === 3) {
      done.top3 = true;
      this._playDramaticHit();
      this._startHeartbeat(false);
      this._suspenseSlow = true;
      this._showSuspenseNotice('⚡ FINAL 3 — WHO WILL TAKE THE CROWN?!', '', 'suspense');
    }
    if (!done.top2 && alive === 2) {
      done.top2 = true;
      this._playDramaticHit();
      this._startHeartbeat(true);
      this._showSuspenseNotice('🔥 1V1 SUDDEN DEATH!', '', 'suspense');
    }
  }

  _ringPositions(count, radius, itemR) {
    const positions = [];
    const spacing = itemR * 2 + 6;
    let ring = 0;
    while (positions.length < count) {
      const ringRadius = spacing * 0.9 + ring * spacing;
      if (ringRadius > radius - itemR) break;
      const circumference = 2 * Math.PI * ringRadius;
      const capacity = ring === 0 ? 1 : Math.max(1, Math.floor(circumference / spacing));
      for (let i = 0; i < capacity && positions.length < count; i++) {
        const a = (i / capacity) * Math.PI * 2 + ring * 0.3;
        positions.push({
          x: this.CENTER.x + Math.cos(a) * ringRadius,
          y: this.CENTER.y + Math.sin(a) * ringRadius,
        });
      }
      ring++;
    }
    return positions;
  }

  _reviveFlagMotion(flag) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(9.0, 13.0);
    flag.vx = Math.cos(angle) * speed;
    flag.vy = Math.sin(angle) * speed;
    flag.angle = rand(0, Math.PI * 2);
    flag.spin = rand(-0.2, 0.2);
    flag.nearMissCount = 0;
  }

  _spawnFlags() {
    this.flags = [];
    this.eliminatedList = [];
    this.fallingFlags = [];
    this.particles = [];
    this._resetSuspenseMilestones();
    this.commentVotes = {};
    this.emit('commentVotes', { ...this.commentVotes });
    this.emit('eliminated', this.eliminatedList.slice());

    const codes = this.stagePool.slice();
    const positions = this._ringPositions(codes.length, this.ARENA_RADIUS, this.FLAG_R);

    codes.forEach((code, i) => {
      const pos = positions[i] || { x: this.CENTER.x, y: this.CENTER.y };
      this.flags.push({
        code,
        x: pos.x,
        y: pos.y,
        r: this.FLAG_R,
        vx: rand(-7.0, 7.0),
        vy: rand(-7.0, 7.0),
        ...randomFlagMotion(),
        nearMissCount: 0,
        alive: true,
      });
    });

    this._setupTeams(codes);
    this.roundNumber++;
    this.roundStartTime = Date.now();
    this._emitHud();
    this._emitQualifiedList();
    this.emit('winner', { show: false });
    this.emit('stage', { show: false });
  }

  _emitHud() {
    const alive = this.flags.filter((f) => f.alive).length;
    const total = this.flags.length || this.stagePool.length;
    const isFinal = this.phase === 'final';
    this.emit('hud', {
      alive,
      total,
      progressPct: total ? (alive / total) * 100 : 100,
      roundNumber: this.campaignNum,
      campaignNum: this.campaignNum,
      stageLabel: isFinal ? 'GRAND FINAL' : 'QUALIFIER',
      qualifiedCount: this.qualifiedDisplayList.length,
      stageTarget: isFinal ? 1 : total,
      phase: this.phase,
      aliveRows: this.flags
        .filter((f) => f.alive)
        .slice(0, 40)
        .map((f) => ({ code: f.code, name: this.countryNames[f.code] || f.code })),
      rosterRows: this.flags.map((f) => ({ code: f.code, alive: f.alive })),
    });

    // Top-5 finalists tracker (vertical parity): once the qualifier narrows to
    // five or fewer survivors, surface them as the on-stream leaderboard.
    const showTop5 = this.phase === 'qualifier' && alive > 0 && alive <= 5;
    this.emit('top5', {
      show: showTop5,
      rows: showTop5
        ? this.flags.filter((f) => f.alive).slice(0, 5).map((f) => ({
            code: f.code,
            name: this.countryNames[f.code] || f.code,
            r: f.r,
          }))
        : [],
    });
  }

  _qualifiedPanelTitle() {
    return '🏆 CAMPAIGN WINNERS';
  }

  _emitQualifiedList() {
    const TOTAL_ROWS = 3;
    const chunks = [];
    for (let i = 0; i < this.qualifiedDisplayList.length; i += TOTAL_ROWS) {
      chunks.push(this.qualifiedDisplayList.slice(i, i + TOTAL_ROWS));
    }
    const current = chunks.length ? chunks[this.qpRotationIndex % chunks.length] : [];
    const rows = current.map((entry) => ({
      idx: entry.idx,
      code: entry.code,
      name: this.countryNames[entry.code] || entry.code,
    }));
    this.emit('qualifiedListChanged', { title: this._qualifiedPanelTitle(), rows });
  }

  _rotateQualifiedList() {
    this.qpRotationIndex++;
    this._emitQualifiedList();
  }

  _tickTimer() {
    const secs = Math.floor((Date.now() - this.roundStartTime) / 1000);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    this.emit('timer', { mm, ss });
  }

  _checkRoundEnd() {
    if (this._roundEnding) return;
    const aliveFlags = this.flags.filter((f) => f.alive);
    if (aliveFlags.length > 1 || aliveFlags.length === 0) return;

    const survivor = aliveFlags[0];
    if (!survivor) return;

    this._roundEnding = true;
    const epoch = this._epoch;
    this._showWinner(survivor);
    this.running = false;
    this._stopHeartbeat();
    this._spawnFireworksCelebration();
    this._playQualifyChime();
    this._emitHud();

    if (this.phase === 'final') {
      this._crownChampion(survivor.code, this._teamOfCode(survivor.code), epoch);
      return;
    }

    if (this._isTeamCampaign()) {
      // Team mode: top 4 = winner + the last three eliminated (2nd/3rd/4th).
      const recent = [
        ...this.eliminatedList.map((e) => e.code),
      ];
      this.finalists = [survivor.code, ...recent.slice(-3).reverse()].slice(0, 4);
      this._showFinalists(this.finalists);
      setTimeout(() => {
        if (epoch !== this._epoch) return;
        this.emit('winner', { show: false });
        this._beginFinal();
      }, 5000);
    } else {
      // Solo mode: the qualifier winner is the campaign champion.
      this._crownChampion(survivor.code, this._teamOfCode(survivor.code), epoch);
    }
  }

  /* Brief on-stream reveal of the four grand-finalists (one per line). */
  _showFinalists(codes) {
    const lineup = codes.map((c) => {
      const flag = this.flags.find((f) => (f.code || '').toUpperCase() === String(c).toUpperCase());
      return { code: c, name: this.countryNames[c] || c, r: flag ? flag.r : this.FLAG_R };
    });
    this.emit('stage', { show: true, title: 'GRAND FINAL', subtitle: 'TOP 4 · SLOW MOTION', lineup });
    this._speakNatural(`The Grand Final is set! ${codes.length} flags battle in slow motion for the crown!`);
  }

  /* Crown the campaign champion, celebrate, then loop a fresh campaign. */
  _crownChampion(code, team, epoch = this._epoch) {
    const name = this.countryNames[code] || code;
    this.running = false;
    this._stopHeartbeat();
    this.qualifiedDisplayList.push({ code, idx: this.campaignNum });
    this._emitQualifiedList();
    this._emitHud();

    this.emit('winner', {
      show: true,
      label: 'CAMPAIGN ' + this.campaignNum + ' CHAMPION',
      name,
      code,
      team: team ? { name: team.name, emoji: team.emoji } : null,
    });

    const winnerFlag = this.flags.find((f) => f.alive);
    if (winnerFlag) {
      this._spawnVerticalBurst(winnerFlag.x, winnerFlag.y, '#ffcc00');
      this._spawnFireworksCelebration();
    }
    this._playChampionFanfare();
    this._speakChampion(name);

    setTimeout(() => {
      if (epoch !== this._epoch) return;
      this.campaignNum++;
      this._slowUntil = 0;
      this._slowFactor = 1;
      this._beginQualifier();
    }, 8000);
  }

  _showWinner(f) {
    const label = this.phase === 'final' ? 'GRAND FINAL WINNER' : 'LAST FLAG STANDING';
    this.emit('winner', {
      show: true,
      label,
      name: this.countryNames[f.code] || f.code,
      code: f.code,
    });
  }

  _showStageAnnouncement(title, subtitle) {
    this.emit('stage', { show: true, title, subtitle });
  }

  // ================= Teams (Team Up Mode — campaigns end in a Grand Final) =================

  _setupTeams(codes) {
    const mode = String(this._readSetting('teams', 'none'));
    if (mode === 'none' || mode === 'false' || !mode) {
      this.teams = null;
      this.teamStats = null;
      this._teamSig = null;
      this.emit('teams', null);
      return;
    }

    if (mode === '2' || mode === '4') {
      const n = mode === '2' ? 2 : 4;
      const palette = [
        { name: 'Red', color: '#ff4d4d', emoji: '' },
        { name: 'Blue', color: '#4d8dff', emoji: '' },
        { name: 'Green', color: '#2ecc71', emoji: '' },
        { name: 'Gold', color: '#f5c518', emoji: '' },
      ];
      if (!this._codeIndex) {
        this._codeIndex = {};
        this.countries.forEach((c, i) => { this._codeIndex[String(c.code).toUpperCase()] = i; });
      }
      this.teams = palette.slice(0, n).map((p, i) => ({ id: 't' + i, name: p.name, color: p.color, emoji: p.emoji, codes: new Set() }));
      this.countryCodes.forEach((code) => {
        const idx = this._codeIndex[String(code).toUpperCase()];
        const t = (idx !== undefined ? idx : 0) % n;
        this.teams[t].codes.add(String(code).toUpperCase());
      });
    } else {
      // Continents
      this.teams = REGION_ORDER
        .filter((r) => r !== 'Other')
        .map((r) => ({ id: r.toLowerCase(), name: REGION_META[r].label, color: REGION_META[r].color, emoji: REGION_META[r].emoji, codes: new Set() }));
      this.countryCodes.forEach((code) => {
        const region = getRegion(code);
        let t = this.teams.find((x) => x.id === region.toLowerCase());
        if (!t) {
          t = { id: 'other', name: 'Other', color: REGION_META.Other.color, emoji: REGION_META.Other.emoji, codes: new Set() };
          this.teams.push(t);
        }
        t.codes.add(String(code).toUpperCase());
      });
    }

    this._updateTeamsIfChanged(true);
  }

  _teamOfCode(code) {
    if (!this.teams) return null;
    const upper = String(code).toUpperCase();
    return this.teams.find((t) => t.codes.has(upper)) || null;
  }

  _isTeamCampaign() {
    const m = String(this._readSetting('teams', 'none'));
    return m === '2' || m === '4' || m === 'continents';
  }

  _updateTeamsIfChanged(force = false) {
    if (!this.teams) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (!force && now - (this._lastTeamUpdate || 0) < 120) return;
    this._lastTeamUpdate = now;
    const alive = new Set(
      this.flags.filter((f) => f.alive).map((f) => String(f.code).toUpperCase())
    );
    const stats = this.teams.map((t) => {
      let a = 0;
      for (const code of t.codes) if (alive.has(code)) a++;
      return { id: t.id, name: t.name, color: t.color, emoji: t.emoji, alive: a, total: t.codes.size };
    });
    const sig = stats.map((s) => s.alive).join(',');
    this.teamStats = stats;
    if (force || sig !== this._teamSig) {
      this._teamSig = sig;
      this.emit('teams', stats);
    }
  }

  // ================= Flag sprites (real flag-icons SVGs) =================

  _flagSize(f) {
    const w = f.r * 2;
    const h = (f.r * 18) / 14;
    return { w, h };
  }

  _getSprite(code) {
    let entry = this._sprites.get(code);
    if (entry) return entry;
    entry = { img: null, canvas: null, ready: false };
    this._sprites.set(code, entry);
    const img = new Image();
    img.onload = () => {
      const sw = 128;
      const sh = 80;
      const off = document.createElement('canvas');
      off.width = sw;
      off.height = sh;
      const octx = off.getContext('2d');
      // Letterbox the (usually 4:3) source into our fixed sprite box.
      const scale = Math.min(sw / img.width, sh / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      octx.drawImage(img, (sw - dw) / 2, (sh - dh) / 2, dw, dh);
      entry.canvas = off;
      entry.ready = true;
    };
    img.onerror = () => {
      entry.ready = false;
    };
    img.src = `/flags/${code.toLowerCase()}.svg`;
    entry.img = img;
    return entry;
  }

  _drawFlagShape(f, showNameplate = false, highlightTop3 = false) {
    const ctx = this.ctx;
    // Vertical gameplay uses a 28x18 flag; preserve those proportions around
    // this engine's collision radius.
    const { w, h } = this._flagSize(f);
    const scale = w / 28;
    const now = Date.now();
    const isReviving = f.flashUntil && f.flashUntil > now;
    const isBoosted = f.chatBoostEnd && f.chatBoostEnd > now;

    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.angle || 0);

    // Soft grounded shadow beneath the flag for depth.
    ctx.save();
    ctx.shadowBlur = 6 * scale;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 3 * scale;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, 2 * scale);
    else ctx.rect(-w / 2, -h / 2, w, h);
    ctx.fill();
    ctx.restore();

    const sprite = this._getSprite(f.code);
    if (sprite.ready && sprite.canvas) {
      ctx.save();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, 2 * scale);
      else ctx.rect(-w / 2, -h / 2, w, h);
      ctx.clip();
      this._drawWavingFlag(ctx, sprite.canvas, w, h, f);
      ctx.restore();
    } else {
      ctx.fillStyle = this._codeColor(f.code);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(8, 9 * scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(f.code || '').slice(0, 2).toUpperCase(), 0, 0);
    }

    // Subtle border or Glow
    ctx.shadowBlur = 0;
    if (isReviving) {
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 3 * scale;
      ctx.shadowBlur = 10 * scale;
      ctx.shadowColor = '#ffff00';
    } else if (isBoosted) {
      ctx.strokeStyle = '#33ccff';
      ctx.lineWidth = 2.5 * scale;
      ctx.shadowBlur = 8 * scale;
      ctx.shadowColor = '#33ccff';
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.40)';
      ctx.lineWidth = 0.8 * scale;
    }

    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 2 * scale);
      ctx.stroke();
    } else {
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    }

    if (this.settings && this.settings.mesh) {
      this._drawFlagMesh(-w / 2, -h / 2, w, h, 0, 0);
    }

    ctx.restore();

    // Unrotated status overlays: SHIELD bubble, FREEZE frost ring, SLOW ring.
    this._drawFlagStatus(ctx, f.x, f.y, f, w, h);
    if (showNameplate) {
      this._drawFlagNameplate(ctx, f.x, f.y, this.countryNames[f.code] || f.code, highlightTop3, w);
    }
  }

  // Optional diagnostic lattice. It is off unless the user enables the mesh
  // setting; the vertical gameplay itself does not draw it.
  _drawFlagMesh(x0, y0, w, h, cx = 0, cy = 0) {
    const ctx = this.ctx;
    const cols = 4;
    const rows = 3;
    ctx.save();
    ctx.strokeStyle = 'rgba(199,243,107,0.45)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let i = 0; i <= cols; i++) {
      const x = x0 + (w * i) / cols;
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + h);
    }
    for (let j = 0; j <= rows; j++) {
      const y = y0 + (h * j) / rows;
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + w, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#fff6b2';
    for (let i = 0; i <= cols; i++) {
      for (let j = 0; j <= rows; j++) {
        ctx.beginPath();
        ctx.arc(x0 + (w * i) / cols, y0 + (h * j) / rows, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.strokeStyle = 'rgba(199,243,107,0.32)';
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(w, h) / 2 + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Textured flag drawn as soft vertical strips with a gentle flutter,
  // matching the vertical gameplay's cloth-mesh look (1px overlap hides seams).
  _drawWavingFlag(ctx, img, w, h, f) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const S = w >= 24 ? 6 : 3;
    const t = this._frame;
    const seed = (((f.code || 'z').charCodeAt(0) * 0.37) % (Math.PI * 2));
    const amp = Math.min(1.6, w * 0.06);
    for (let i = 0; i < S; i++) {
      const u0 = i / S;
      const u1 = (i + 1) / S;
      const wave = Math.sin(t * 0.11 + seed + u0 * 5.0);
      const dy = wave * amp * u0;
      const dx = Math.sin(t * 0.09 + seed) * 0.5 * u0;
      ctx.drawImage(
        img,
        u0 * iw, 0, (u1 - u0) * iw, ih,
        -w / 2 + u0 * w + dx,
        -h / 2 + dy,
        (u1 - u0) * w + 1, h,
      );
    }
  }

  // SHIELD bubble + FREEZE frost + SLOW aura, all in screen space so they stay
  // upright and read clearly at a glance.
  _drawFlagStatus(ctx, x, y, f, w, h) {
    const now = Date.now();
    const shielded = f.immunityUntil && f.immunityUntil > now;
    const frozen = f.frozenUntil && f.frozenUntil > now;
    const slowed = f.slowUntil && f.slowUntil > now;
    const scale = Math.max(w, h) / 28;
    const base = Math.max(w, h);

    // Colour tint over the flag while CC'd, so it never blends into the arena.
    if (frozen || slowed || shielded) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = shielded ? 'rgba(80, 220, 255, 0.14)'
        : frozen ? 'rgba(140, 215, 255, 0.30)'
          : 'rgba(170, 120, 255, 0.26)';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }

    if (shielded) {
      ctx.save();
      const pulse = 1 + Math.sin(now / 180) * 0.06;
      ctx.translate(x, y);
      ctx.rotate(now / 500);
      ctx.strokeStyle = 'rgba(80, 220, 255, 0.95)';
      ctx.lineWidth = 1.6 * scale;
      ctx.shadowBlur = 12 * scale;
      ctx.shadowColor = 'rgba(80, 220, 255, 0.95)';
      const r = base * 0.9 * pulse;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      // Rotating defence spokes
      ctx.rotate(now / 260);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, r, i * (Math.PI / 2) - 0.28, i * (Math.PI / 2) + 0.28);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (frozen) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(now / 800);
      ctx.strokeStyle = 'rgba(150, 220, 255, 0.95)';
      ctx.lineWidth = 2 * scale;
      ctx.shadowBlur = 10 * scale;
      ctx.shadowColor = 'rgba(120, 200, 255, 0.9)';
      const r = base * 0.78;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      // Crystal spikes
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i * (Math.PI / 4);
        ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.lineTo(Math.cos(a) * (r - 6 * scale), Math.sin(a) * (r - 6 * scale));
      }
      ctx.stroke();
      ctx.restore();
    }

    if (slowed) {
      ctx.save();
      const pulse = 1 + Math.sin(now / 200) * 0.08;
      ctx.translate(x, y);
      ctx.strokeStyle = 'rgba(180, 120, 255, 0.95)';
      ctx.lineWidth = 2 * scale;
      ctx.shadowBlur = 10 * scale;
      ctx.shadowColor = 'rgba(180, 120, 255, 0.9)';
      const r = base * 0.75 * pulse;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawFlagNameplate(ctx, x, y, name, highlight, w) {
    const scale = Math.max(0.65, w / 28);
    ctx.save();
    ctx.translate(x, y - 24 * scale);

    const text = String(name || '').toUpperCase();
    ctx.font = `700 ${12 * scale}px "Barlow Condensed", sans-serif`;
    const textWidth = ctx.measureText(text).width;
    const badgeW = textWidth + 14 * scale;
    const badgeH = 16 * scale;

    // Drop shadow
    ctx.shadowBlur = 6 * scale;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2 * scale;

    // Glassmorphic pill badge
    ctx.fillStyle = highlight ? 'rgba(21, 27, 30, 0.94)' : 'rgba(15, 20, 23, 0.9)';
    ctx.strokeStyle = highlight ? '#e9bc73' : 'rgba(233, 188, 115, 0.8)';
    ctx.lineWidth = highlight ? 1.4 * scale : 1.0 * scale;

    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 4 * scale);
    else ctx.rect(-badgeW / 2, -badgeH / 2, badgeW, badgeH);
    ctx.fill();
    ctx.stroke();

    // Little pointer arrow connecting badge to flag
    ctx.beginPath();
    ctx.moveTo(-3 * scale, badgeH / 2);
    ctx.lineTo(0, badgeH / 2 + 4 * scale);
    ctx.lineTo(3 * scale, badgeH / 2);
    ctx.fillStyle = highlight ? '#e9bc73' : 'rgba(233, 188, 115, 0.8)';
    ctx.fill();

    // Name text
    ctx.shadowBlur = 0;
    ctx.fillStyle = highlight ? '#ffffff' : '#f0f0f5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);

    ctx.restore();
  }

  // Draws a code's flag into an arbitrary target canvas/context box —
  // used by the winner showcase and the qualified-panel mini flags.
  drawFlagInto(ctx, code, x0, y0, w, h) {
    const sprite = this._getSprite(code);
    if (sprite.ready && sprite.canvas) {
      ctx.drawImage(sprite.canvas, x0, y0, w, h);
    } else {
      ctx.fillStyle = 'rgba(240,235,216,0.25)';
      ctx.fillRect(x0, y0, w, h);
    }
  }

  // ================= Falling elimination flags =================

  _eliminate(f) {
    if (!f.alive) return;
    f.alive = false;
    const upperCode = (f.code || '').toUpperCase();
    delete this.commentVotes[upperCode];
    this.emit('commentVotes', { ...this.commentVotes });
    this._playWhoosh();
    this._spawnVerticalBurst(f.x, f.y);
    const sprite = this._getSprite(f.code);
    const { w, h } = this._flagSize(f);
    this.fallingFlags.push({
      code: f.code,
      name: this.countryNames[f.code] || f.code,
      x: f.x,
      y: f.y,
      vx: f.vx * 0.7 + (Math.random() - 0.5) * 1.5,
      vy: Math.max(f.vy, 1.6),
      angle: f.angle || 0,
      vAngle: (Math.random() - 0.5) * 0.15,
      alpha: 1.0,
      w,
      h,
      img: sprite.img,
    });
    this.eliminatedList.push({ code: f.code, name: this.countryNames[f.code] || f.code });
    this.emit('eliminated', this.eliminatedList.slice());
    this._updateTeamsIfChanged();
    this._emitHud();
    this._updateSuspenseMilestones();
  }

  _renderFallingFlags() {
    const ctx = this.ctx;
    for (let i = this.fallingFlags.length - 1; i >= 0; i--) {
      const f = this.fallingFlags[i];
      f.x += f.vx;
      f.y += f.vy;
      f.vy += 0.28; // Smooth gravity
      f.vx *= 0.98; // Air drag
      f.angle += f.vAngle;
      f.alpha -= 0.020;

      if (f.alpha <= 0 || f.y > this.STAGE_H + 40) {
        this.fallingFlags.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, f.alpha);
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);

      // Glowing aura for falling eliminated flags (scorched by the wire)
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(255, 168, 88, 0.65)';

      if (f.img && f.img.complete && f.img.naturalWidth > 0) {
        ctx.drawImage(f.img, -f.w / 2, -f.h / 2, f.w, f.h);
      } else {
        ctx.fillStyle = '#cc2222';
        ctx.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
      }

      ctx.strokeStyle = 'rgba(255, 190, 110, 0.75)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(-f.w / 2, -f.h / 2, f.w, f.h);
      ctx.restore();
    }
  }

  // ================= Fireworks =================

  _spawnBurst(x, y) {
    const FIREWORK_COLORS = ['#e8b23d', '#c13f3f', '#4aa3ff', '#5b8c5a', '#f0ebd8'];
    const count = 26;
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(2.5, 8);
      this.fireworks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color: FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)],
      });
    }
  }
  _spawnFireworksCelebration() {
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        this._spawnBurst(rand(this.STAGE_W * 0.18, this.STAGE_W * 0.82), rand(this.STAGE_H * 0.15, this.STAGE_H * 0.55));
      }, i * 320);
    }
  }
  _updateFireworks() {
    for (let i = this.fireworks.length - 1; i >= 0; i--) {
      const p = this.fireworks[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.life -= 0.018;
      if (p.life <= 0) this.fireworks.splice(i, 1);
    }
  }
  _renderFireworks() {
    const ctx = this.ctx;
    this.fireworks.forEach((p) => {
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // ================= Impact particles (vertical-gameplay debris) =================

  // Deterministic per-country placeholder hue, matching the vertical engine.
  _codeColor(code) {
    let h = 0;
    for (const c of String(code || '')) h = (h << 5) - h + c.charCodeAt(0);
    return `hsl(${Math.abs(h) % 360}, 65%, 37%)`;
  }

  // Vertical-style elimination/boost burst: warm debris plus electric spark
  // streaks. Fixed counts keep the landscape stream visually identical.
  _spawnVerticalBurst(x, y, color = null) {
    if (this.settings && this.settings.particles === false) return;
    const COUNT = 16;
    for (let i = 0; i < COUNT; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(1.5, 6.0);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 1,
        decay: rand(0.024, 0.049),
        r: rand(2, 6),
        color: color || `hsl(${Math.random() < 0.6 ? 25 : 45}, 100%, 55%)`,
      });
    }

    const sparkCol = color || 'rgba(255, 232, 180, 1)';
    const SPARKS = 9;
    for (let i = 0; i < SPARKS; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(3, 9);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 1,
        decay: rand(0.05, 0.10),
        r: 1,
        len: rand(6, 16),
        spark: true,
        color: sparkCol,
      });
    }
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);
  }

  _updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.vx *= 0.96;
      p.life -= p.decay;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  _renderParticles() {
    const ctx = this.ctx;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      if (p.spark) {
        const d = Math.hypot(p.vx, p.vy) || 1;
        const ux = p.vx / d;
        const uy = p.vy / d;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.8 * p.life;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - ux * p.len * p.life, p.y - uy * p.len * p.life);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ================= Physics step =================

  _activeBoostFor(code) {
    const b = this._voteBoosts.get(code);
    if (!b) return 1;
    if (Date.now() > b.until) {
      this._voteBoosts.delete(code);
      return 1;
    }
    return b.factor;
  }

  // Vertical parity: a flag is out if its centre sits inside a pocket *or*
  // within one segment of one. Vertical's isHoleAtAngle() widens the pocket by
  // its neighbouring segments, so testing only the exact pocket window made
  // landscape holes feel narrower and clipped flags that vertical lets through.
  _isInGate(posAngle) {
    return this.GATES.some((g) => angleDiff(posAngle, g.angle) < g.half + GATE_EDGE_TOLERANCE);
  }

  // Clutch survival budget for popular countries, scaled by how many flags are
  // left. Early rounds keep the generous vertical-style safety net (4 saves at
  // 90%) so big-audience countries survive long enough to matter on stream; the
  // net closes as the field thins and is fully off for the Top 5, where every
  // bounce would otherwise decide the champion.
  _clutchRules(aliveCount) {
    if (aliveCount > 64) return { budget: 4, chance: 0.9 };
    if (aliveCount > 32) return { budget: 3, chance: 0.75 };
    if (aliveCount > 16) return { budget: 2, chance: 0.55 };
    if (aliveCount > 8) return { budget: 1, chance: 0.25 };
    // Top 8 and below: no clutch at all, so the last rounds are pure physics.
    return { budget: 0, chance: 0 };
  }

  _physicsStep() {
    if (this.settings?.rotSpeed !== undefined) {
      this.GATE_SPIN = Number(this.settings.rotSpeed);
    }
    for (const gate of this.GATES) gate.angle = norm(gate.angle + this.GATE_SPIN);

    // Call Voice CTA periodically (e.g. roughly every 30 seconds)
    if (!this.lastCTATime) this.lastCTATime = Date.now();
    if (Date.now() - this.lastCTATime > 30000) {
      this.lastCTATime = Date.now();
      if (Math.random() > 0.4) {
        this._triggerVoiceCTA();
      }
    }

    const alive = this.flags.filter((f) => f.alive);
    const grav = (this.settings?.gravity !== undefined) ? Number(this.settings.gravity) : 0;
    const frozenFlags = new Set();

    alive.forEach((f) => {
      // ❄️ FREEZE: hold still while frozen.
      if (f.frozenUntil && f.frozenUntil > Date.now()) {
        f.vx = 0;
        f.vy = 0;
        frozenFlags.add(f);
        return;
      }
      // 🐌 SLOW (targeted): damp the flag so it crawls, matching vertical.
      const slowFactor = (f.slowUntil && f.slowUntil > Date.now()) ? 0.55 : 1;
      if (slowFactor < 1) {
        f.vx *= slowFactor;
        f.vy *= slowFactor;
      }
      if (grav > 0) {
        f.vy += grav * 0.08;
      }
      f.x += f.vx * slowFactor;
      f.y += f.vy * slowFactor;
      f.angle = norm((f.angle || 0) + (f.spin || 0) * slowFactor);
    });

    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i];
        const b = alive[j];
        if (frozenFlags.has(a) || frozenFlags.has(b)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.r + b.r;
        if (dist < minDist && dist > 0) {
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;

          const rvx = b.vx - a.vx;
          const rvy = b.vy - a.vy;
          const velAlongNormal = rvx * nx + rvy * ny;
          if (velAlongNormal < 0) {
            // Equal mass, perfectly elastic bounce, matching vertical.
            const approachSpeed = -velAlongNormal;
            a.vx -= approachSpeed * nx;
            a.vy -= approachSpeed * ny;
            b.vx += approachSpeed * nx;
            b.vy += approachSpeed * ny;
          }
        }
      }
    }

    const biasEnabled = this._readSetting('bias', true) !== false;
    const clutch = this._clutchRules(alive.length);
    alive.forEach((f) => {
      if (frozenFlags.has(f)) return;
      const dx = f.x - this.CENTER.x;
      const dy = f.y - this.CENTER.y;
      const dist = Math.hypot(dx, dy);
      const limit = this.ARENA_RADIUS - f.r;
      if (dist <= limit) return;

      const posAngle = Math.atan2(dy, dx);
      const inGate = this._isInGate(posAngle);

      if (inGate) {
        if (f.immunityUntil && f.immunityUntil > Date.now()) {
          // Protected by revival shield — safely bounce inward
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);
          f.x = this.CENTER.x + nx * limit;
          f.y = this.CENTER.y + ny * limit;
          f.vx = -nx * 6.0;
          f.vy = -ny * 6.0;
          return;
        }
        // Audience-retention clutch survival for popular countries. The safety
        // net shrinks as the field thins so the finale is decided by the
        // physics, not by who got the most lucky bounces.
        const code = String(f.code || '').toUpperCase();
        if (
          biasEnabled &&
          (f.nearMissCount || 0) < clutch.budget &&
          POPULAR_COUNTRY_CODES.includes(code) &&
          Math.random() < clutch.chance
        ) {
          f.nearMissCount = (f.nearMissCount || 0) + 1;
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);
          f.x = this.CENTER.x + nx * limit;
          f.y = this.CENTER.y + ny * limit;
          const vDotN = f.vx * nx + f.vy * ny;
          if (vDotN > 0) {
            f.vx = (f.vx - 2.0 * vDotN * nx) * 1.5;
            f.vy = (f.vy - 2.0 * vDotN * ny) * 1.5;
          }
          this._playNearMiss();
          return;
        }
        // Eliminate once the flag's rotated outer edge actually touches the
        // drawn wire. A corner grazing the wire counts, exactly as in
        // vertical gameplay.
        const { w, h } = this._flagSize(f);
        const halfW = w * 0.5;
        const halfH = h * 0.5;
        const angle = f.angle || 0;
        const cosAngle = Math.cos(angle);
        const sinAngle = Math.sin(angle);
        const ux = Math.cos(posAngle);
        const uy = Math.sin(posAngle);
        const edgeReach = Math.abs(halfW * (cosAngle * ux + sinAngle * uy))
          + Math.abs(halfH * (-sinAngle * ux + cosAngle * uy));
        if (dist + edgeReach >= this.ARENA_RADIUS - 0.5) this._eliminate(f);
        return;
      }

      // Closed wall: strictly enforce containment with elastic reflection.
      const nx = dx / dist;
      const ny = dy / dist;
      const overshoot = dist - limit;
      f.x -= nx * overshoot;
      f.y -= ny * overshoot;
      const vDotN = f.vx * nx + f.vy * ny;
      f.vx -= 2 * vDotN * nx;
      f.vy -= 2 * vDotN * ny;
    });

    // Vertical-style kinetic floor: keep the arena energetic rather than
    // letting micro-collisions drain all motion.
    const MIN_SPEED = 2.5;
    alive.forEach((f) => {
      if (frozenFlags.has(f)) return;
      const speed = Math.hypot(f.vx, f.vy);
      if (speed < MIN_SPEED) {
        const dir = speed > 0.0001 ? Math.atan2(f.vy, f.vx) : rand(0, Math.PI * 2);
        const target = rand(MIN_SPEED, MIN_SPEED * 1.5);
        f.vx = Math.cos(dir) * target;
        f.vy = Math.sin(dir) * target;
      }
    });

    // Vertical-style maximum speed: fast ping-pong action, not a calm drift.
    const MAX_SPEED = 9.0;
    alive.forEach((f) => {
      if (frozenFlags.has(f)) return;
      const speed = Math.hypot(f.vx, f.vy);
      if (speed > MAX_SPEED) {
        f.vx = (f.vx / speed) * MAX_SPEED;
        f.vy = (f.vy / speed) * MAX_SPEED;
      }
    });

    this._checkRoundEnd();
  }

  // ================= Rendering =================

  _drawSuspenseGlow(aliveCount) {
    const ctx = this.ctx;
    const targetIntensity = aliveCount <= 2 ? 1.0 : (aliveCount === 3 ? 0.8 : (aliveCount <= 5 ? 0.35 : 0.0));
    this._suspenseIntensity += (targetIntensity - this._suspenseIntensity) * 0.05;
    const suspense = this._suspenseIntensity;
    const cx = this.CENTER.x;
    const cy = this.CENTER.y;
    const radius = this.ARENA_RADIUS * (380 / 205);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    if (suspense > 0.5) {
      // Dramatic high-contrast suspense spotlight (warm amber)
      const p = 0.5 + 0.5 * Math.sin(this._frame * 0.1);
      g.addColorStop(0, `rgba(76, 55, 32, ${0.5 + 0.15 * p})`);
      g.addColorStop(0.40, `rgba(48, 40, 32, ${0.4 + 0.1 * p})`);
      g.addColorStop(0.75, 'rgba(20, 22, 21, 0.7)');
      g.addColorStop(1, 'rgba(9, 11, 12, 0.95)');
    } else {
      g.addColorStop(0, 'rgba(38, 49, 43, 0.5)');
      g.addColorStop(0.55, 'rgba(24, 31, 30, 0.28)');
      g.addColorStop(1, 'rgba(13, 17, 20, 0)');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.STAGE_W, this.STAGE_H);
  }

  _renderSuspenseNotice() {
    const notice = this._suspenseNotice;
    if (!notice || Date.now() >= notice.until) return;
    const ctx = this.ctx;
    const titleSize = Math.max(16, this.ARENA_RADIUS * 0.075);
    const detailSize = Math.max(11, this.ARENA_RADIUS * 0.045);
    const x = this.CENTER.x;
    const y = this.CENTER.y - this.ARENA_RADIUS * 0.58;
    const isSuspense = notice.kind === 'suspense';
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${titleSize}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    ctx.shadowBlur = 24;
    ctx.shadowColor = isSuspense ? 'rgba(239, 140, 103, 0.8)' : 'rgba(233, 188, 115, 0.7)';
    ctx.fillStyle = isSuspense ? '#ef8c67' : '#e9bc73';
    ctx.fillText(notice.title, x, y);
    if (notice.detail) {
      ctx.font = `600 ${detailSize}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      ctx.shadowBlur = 12;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fillText(notice.detail, x, y + titleSize * 0.95);
    }
    ctx.restore();
  }

  _drawArena() {
    const ctx = this.ctx;
    const R = this.ARENA_RADIUS;
    const TWO_PI = Math.PI * 2;
    // Keep the vertical ring's proportions when the landscape arena is larger
    // or smaller than the vertical reference radius.
    const u = R / 205;

    ctx.save();
    ctx.lineCap = 'butt';

    // Sort the gates and derive the closed spans that sit between them.
    // The wall is drawn with the *same* tolerance the physics uses, so the
    // visible gap is exactly the lethal window. Drawing the pocket alone left a
    // band of solid-looking wall that flags were eliminated through.
    const tol = GATE_EDGE_TOLERANCE;
    const gates = this.GATES
      .map((g) => ({
        a0: norm(g.angle - g.half - tol),
        a1: norm(g.angle + g.half + tol),
        node0: norm(g.angle - g.half - tol),
        node1: norm(g.angle + g.half + tol),
      }))
      .sort((a, b) => a.a0 - b.a0);

    const closed = [];
    for (let i = 0; i < gates.length; i++) {
      const cur = gates[i];
      const next = gates[(i + 1) % gates.length];
      let start = cur.a1;
      let end = next.a0;
      if (end <= start) end += Math.PI * 2;
      closed.push([start, end]);
    }

    // Wall — single clean stroke with soft glow (vertical electric-wire look)
    ctx.strokeStyle = '#90a58a';
    ctx.lineWidth = Math.max(2, 5 * u);
    ctx.shadowColor = '#95b97844';
    ctx.shadowBlur = 12 * u;
    for (const [a0, a1] of closed) {
      ctx.beginPath();
      ctx.arc(this.CENTER.x, this.CENTER.y, this.ARENA_RADIUS, a0, a1);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Gate breaches — dashed marker just outside the wall + endpoint nodes.
    // a0/a1 already include the tolerance, matching both the wall gap and the
    // physics test exactly.
    for (const g of gates) {
      let a0 = g.a0;
      let a1 = g.a1;
      if (a1 <= a0) a1 += TWO_PI;
      ctx.strokeStyle = '#f5b766';
      ctx.lineWidth = Math.max(1, 2 * u);
      ctx.setLineDash([3, 7]);
      ctx.beginPath();
      ctx.arc(this.CENTER.x, this.CENTER.y, this.ARENA_RADIUS + 9 * u, a0, a1);
      ctx.stroke();
      ctx.setLineDash([]);

      const nodeRadius = Math.max(2, 4 * u);
      ctx.fillStyle = '#ffc377';
      for (const a of [a0, a1]) {
        ctx.beginPath();
        ctx.arc(this.CENTER.x + Math.cos(a) * this.ARENA_RADIUS, this.CENTER.y + Math.sin(a) * this.ARENA_RADIUS, nodeRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  _render() {
    const ctx = this.ctx;
    this._frame++;
    ctx.clearRect(0, 0, this.STAGE_W, this.STAGE_H);
    const aliveCount = this.flags.reduce((count, f) => count + (f.alive ? 1 : 0), 0);
    this._drawSuspenseGlow(aliveCount);
    this._drawArena();
    const showNameplates = aliveCount <= 5;
    const highlightTop3 = aliveCount <= 3;
    this.flags.forEach((f) => {
      if (f.alive) this._drawFlagShape(f, showNameplates, highlightTop3);
    });
    this._renderParticles();
    this._renderFallingFlags();
    this._renderFireworks();
    this._renderSuspenseNotice();
  }

  _computeArenaRadius(w, h) {
    // The landscape HUD overlays the canvas: a top status bar, side rails and a
    // bottom roster/progress strip. Keep the arena inside the empty centre band
    // so flags never hide behind those panels.
    const usableW = w * 0.40; // leave room for the left/right rails
    const usableH = h * 0.66; // leave room for the top bar + bottom roster
    const r = Math.min(usableW, usableH * 0.5);
    return Math.max(80, Math.min(460, r));
  }

  // Centre the arena in the band left between the top bar and bottom roster.
  _computeCenter(w, h) {
    return { x: w / 2, y: h * 0.07 + (h * 0.66) / 2 };
  }

  _computeFlagR() {
    return Math.max(9, Math.min(22, this.ARENA_RADIUS / 16));
  }

  _loop(ts = typeof performance !== 'undefined' ? performance.now() : Date.now()) {
    if (this.running) {
      if (!this._lastStepTs) this._lastStepTs = ts;
      let dt = ts - this._lastStepTs;
      this._lastStepTs = ts;
      if (!(dt >= 0)) dt = 0;
      if (dt > 100) dt = 100;

      // Vertical-style speed control: run more fixed physics steps per frame.
      let speedMult = (this.settings?.speedMult !== undefined) ? Number(this.settings.speedMult) : 1;
      if (!(speedMult > 0)) speedMult = 1;
      // Vertical-style slow motion: either a timed global power or Top 3
      // bullet-time uses the same dramatic 0.45x timescale.
      if (this._slowUntil && Date.now() > this._slowUntil) {
        this._slowUntil = 0;
        this._slowFactor = 1;
      }
      let timeScale = 1;
      if (this._slowUntil || this._suspenseSlow) timeScale = 0.45;
      speedMult *= timeScale;

      const STEP_MS = 1000 / 60;
      this._physAccum += dt * speedMult;
      const maxSteps = Math.min(8, Math.max(4, Math.ceil(speedMult)));
      let steps = 0;
      while (this._physAccum >= STEP_MS && steps < maxSteps) {
        this._physicsStep();
        this._physAccum -= STEP_MS;
        steps += 1;
      }
      if (steps >= maxSteps) this._physAccum = 0;
    } else {
      this._lastStepTs = 0;
      this._physAccum = 0;
    }
    this._updateFireworks();
    this._updateParticles();
    this._render();
    this._rafId = requestAnimationFrame((nextTs) => this._loop(nextTs));
  }

  _bindResize() {
    // Display-density changes do not always change the CSS layout size.
    // Re-run resize so the backing store stays sharp.
    this.resize(this.STAGE_W, this.STAGE_H);
  }
}
