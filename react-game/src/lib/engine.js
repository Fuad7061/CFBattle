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
    this.countries = countries; // [{code, name}]
    this.countryNames = countries.reduce((acc, c) => {
      acc[c.code] = c.name;
      return acc;
    }, {});
    this.countryCodes = countries.map((c) => c.code);

    // ---- Arena / stage geometry ----
    this.STAGE_W = canvas.width || 800;
    this.STAGE_H = canvas.height || 600;
    this.CENTER = { x: this.STAGE_W / 2, y: this.STAGE_H / 2 };
    this.ARENA_RADIUS = 460;
    this.FLAG_R = 19;

    this.GATES = [{ angle: Math.PI / 2, half: 0.22 }];
    this.GATE_SPIN = 0.002;
    this.BLOCKER = { angle: rand(0, Math.PI * 2), half: 0.36, speed: 0.0032 };

    this.flags = [];
    this.running = true;
    this._rafId = null;

    this.roundNumber = 0;
    this.roundStartTime = Date.now();

    this.stageIndex = 0;
    this.stagePool = [];
    this.qualifiedThisStage = [];
    this.qualifiedDisplayList = []; // {code, idx}
    this.qpRotationIndex = 0;

    this.flyingEliminations = [];
    this.eliminatedList = []; // {code, name} — oldest first, mirrors the DOM chip strip
    this.fireworks = [];

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
      rotSpeed: 0.002,
      speedMult: 1.0,
      bias: true,
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

    this._sprites = new Map(); // code -> { img, canvas, ready }
    this._timerInterval = null;
    this._qpRotationInterval = null;

    this._bindResize = this._bindResize.bind(this);
  }

  // ================= Public API =================

  start() {
    this.commentVotes = {};
    this.emit('commentVotes', { ...this.commentVotes });
    this.stagePool = this.countryCodes.slice();
    this._spawnFlags();
    this._timerInterval = setInterval(() => this._tickTimer(), 1000);
    this._qpRotationInterval = setInterval(() => this._rotateQualifiedList(), 3200);
    this._loop();
  }

  stop() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    if (this._timerInterval) clearInterval(this._timerInterval);
    if (this._qpRotationInterval) clearInterval(this._qpRotationInterval);
  }

  resize(width, height) {
    const newW = Math.max(1, Math.round(width));
    const newH = Math.max(100, Math.round(height));
    if (newW === this.STAGE_W && newH === this.STAGE_H) return;
    this.STAGE_W = newW;
    this.STAGE_H = newH;
    this.canvas.width = newW;
    this.canvas.height = newH;
    this.ARENA_RADIUS = this._computeArenaRadius(newW, newH);
    this.FLAG_R = Math.max(7, Math.min(19, this.ARENA_RADIUS / 24));
    this.CENTER = { x: newW / 2, y: newH / 2 };
  }

  setSoundEnabled(enabled) {
    this.soundEnabled = enabled;
    this._ensureAudio();
    this._startCrowdAmbience();
    if (this.ambienceGain) this.ambienceGain.gain.value = enabled ? 0.05 : 0;
    if (!enabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    this.emit('soundChanged', { enabled });
  }

  shrinkArena() {
    this.ARENA_RADIUS = Math.max(180, this.ARENA_RADIUS - 50);
  }

  newRound() {
    this.commentVotes = {};
    this.emit('commentVotes', { ...this.commentVotes });
    this.stageIndex = 0;
    this.stagePool = this.countryCodes.slice();
    this.qualifiedThisStage = [];
    this.qualifiedDisplayList = [];
    this.qpRotationIndex = 0;
    this.ARENA_RADIUS = this._computeArenaRadius(this.STAGE_W, this.STAGE_H);
    this.running = true;
    this._spawnFlags();
  }

  // Temporarily multiplies a flag's speed (and, via the multiplier applied
  // in the wall-bounce reflection, its effective "resilience") for
  // durationMs. Intended hook for YouTube-chat vote influence: call this
  // periodically with whichever alive country currently has the most votes.
  // Kept intentionally simple — exact balance is left for later tuning.
  applyVoteBoost(countryCode, boostFactor = 1.4, durationMs = 5000) {
    if (!countryCode) return;
    const upper = countryCode.trim().toUpperCase();
    const until = Date.now() + durationMs;
    this._voteBoosts.set(upper, { factor: boostFactor, until });
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

    switch (p) {
      case 'revive': {
        if (!targetCode) return;
        const isElim = this.eliminatedList.some(e => (e.code || '').toUpperCase() === targetCode);
        if (!isElim) {
          if (flag && !flag.alive) {
            flag.alive = true;
            flag.x = this.CENTER.x + (Math.random() * 30 - 15);
            flag.y = this.CENTER.y + (Math.random() * 30 - 15);
            const rndA = Math.random() * Math.PI * 2;
            flag.vx = Math.cos(rndA) * 1.2;
            flag.vy = Math.sin(rndA) * 1.2;
            flag.flashUntil = Date.now() + 4500;
            flag.immunityUntil = Date.now() + 4500;
            this._emitHud();
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
        const rndA = Math.random() * Math.PI * 2;
        rf.vx = Math.cos(rndA) * 1.2;
        rf.vy = Math.sin(rndA) * 1.2;
        rf.flashUntil = Date.now() + 4500;
        rf.immunityUntil = Date.now() + 4500;
        this.eliminatedList = this.eliminatedList.filter(e => (e.code || '').toUpperCase() !== targetCode);
        this.emit('eliminated', this.eliminatedList.slice());
        this._emitHud();
        return;
      }
      case 'shield': {
        if (flag && flag.alive) {
          flag.immunityUntil = Date.now() + dur(6000);
          flag.flashUntil = Date.now() + dur(6000);
        }
        this.emit('power', { power: 'shield', code: targetCode });
        return;
      }
      case 'freeze': {
        if (flag && flag.alive) {
          flag.frozenUntil = Date.now() + dur(4500);
          flag.vx = 0; flag.vy = 0;
        }
        this.emit('power', { power: 'freeze', code: targetCode });
        return;
      }
      case 'slow': {
        if (targetCode && flag && flag.alive) {
          // Targeted: "slow US" slows down just that country's flag.
          flag.slowUntil = Date.now() + dur(5000);
          this.emit('power', { power: 'slow', code: targetCode });
        } else {
          this._slowUntil = Date.now() + dur(5000);
          this._slowFactor = 0.4;
          this.emit('power', { power: 'slow' });
        }
        return;
      }
      case 'quake': {
        const mag = paid ? 9 : 6;
        this.flags.filter(f => f.alive).forEach(f => {
          const a = Math.random() * Math.PI * 2;
          f.vx = Math.cos(a) * mag;
          f.vy = Math.sin(a) * mag;
        });
        this._playWhoosh();
        this.emit('power', { power: 'quake' });
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
          flag.flashUntil = Date.now() + dur(2500);
        }
        this.emit('power', { power: 'boost', code: targetCode });
        return;
      }
      case 'nuke': {
        if (flag && flag.alive) this._eliminate(flag);
        this.emit('power', { power: 'nuke', code: targetCode });
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

  instantPush(countryCode, weight = 1, author = '') {
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
      
      if (currentVotes >= targetVotes) {
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
        const rndA = Math.random() * Math.PI * 2;
        flag.vx = Math.cos(rndA) * 1.2;
        flag.vy = Math.sin(rndA) * 1.2;
        flag.flashUntil = Date.now() + 4500;
        flag.immunityUntil = Date.now() + 4500;
        
        // Remove from eliminated list
        this.eliminatedList = this.eliminatedList.filter(e => (e.code || '').toUpperCase() !== targetCode);
        this.emit('eliminated', this.eliminatedList.slice());
        this._emitHud();
        
        if (this.soundEnabled) {
          this._playTone(1046, 0.6, 'sawtooth', 0, 0.2);
          const countryName = this.countryNames[targetCode] || targetCode;
          this._speakNatural(`Incredible! ${author || 'The chat'} has revived ${countryName}!`);
        }
      }
      return;
    }

    // Flag is alive: gently steer toward center to protect it from the gate
    const dx = this.CENTER.x - flag.x;
    const dy = this.CENTER.y - flag.y;
    const dist = Math.hypot(dx, dy) || 1;
    flag.vx = (dx / dist) * 0.85;
    flag.vy = (dy / dist) * 0.85;
    
    // Highlight the flag visually for a brief moment
    flag.flashUntil = Date.now() + Math.max(1500, 500 * Math.min(weight, 5));
    
    if (weight > 1 && this.soundEnabled) {
      this._playTone(880, 0.3, 'square', 0, 0.2 * Math.min(weight, 2));
      if (author) {
        const countryName = this.countryNames[flag.code] || flag.code;
        this._speakNatural(`${author} steered ${countryName} to safety!`);
      }
    }
  }

  // ================= Sound & TTS =================

  _speakNatural(text) {
    if (!this.soundEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); // prevent overlap
    const u = new SpeechSynthesisUtterance(text);
    u.lang  = 'en-US';
    u.rate  = 1.0;
    u.pitch = 1.0;
    window.speechSynthesis.speak(u);
  }

  _triggerVoiceCTA() {
    if (!this.running || !this.soundEnabled) return;
    
    const aliveFlags = this.flags.filter(f => f.alive);
    const randomCountry = aliveFlags.length > 0
      ? (this.countryNames[aliveFlags[Math.floor(Math.random() * aliveFlags.length)].code] || 'your country')
      : 'your country';

    const prompts = [
      'Drop a comment with your country name!',
      `${randomCountry} is still alive! Comment to boost it!`,
      `${aliveFlags.length} flags still fighting! Who will survive?`,
      `Can ${randomCountry} make it to the finals?`,
      'Did your country get eliminated? Comment its name 4 times to revive it!',
      'Superchats instantly revive eliminated countries or give them a super boost!'
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
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.resume();
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance('The winner is ' + name + '! Congratulations!');
      utter.rate = 0.95;
      utter.pitch = 1.05;
      utter.volume = 1;
      window.speechSynthesis.speak(utter);
    } catch (e) {
      // speech synthesis unsupported or blocked — ignore
    }
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

  // ================= Tournament state machine =================

  currentStage() {
    return STAGES[this.stageIndex];
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

  _spawnFlags() {
    this.flags = [];
    this.eliminatedList = [];
    this.commentVotes = {};
    this.emit('commentVotes', { ...this.commentVotes });
    this.emit('eliminated', this.eliminatedList.slice());

    const codes = this.stagePool.slice();
    const positions = this._ringPositions(codes.length, this.ARENA_RADIUS, this.FLAG_R);

    codes.forEach((code, i) => {
      const pos = positions[i] || { x: this.CENTER.x, y: this.CENTER.y };
      const speed = rand(1.0, 2.2);
      const dir = rand(0, Math.PI * 2);
      this.flags.push({
        code,
        x: pos.x,
        y: pos.y,
        r: this.FLAG_R,
        vx: Math.cos(dir) * speed,
        vy: Math.sin(dir) * speed,
        alive: true,
      });
    });

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
    const stage = this.currentStage();
    this.emit('hud', {
      alive,
      total,
      progressPct: total ? (alive / total) * 100 : 100,
      roundNumber: this.roundNumber,
      stageLabel: stage.label,
      qualifiedCount: this.qualifiedThisStage.length,
      stageTarget: stage.target,
    });
  }

  _qualifiedPanelTitle() {
    const next = STAGES[this.stageIndex + 1];
    return next ? 'Qualified for ' + next.label : 'Crowning the champion';
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
    const alive = this.flags.filter((f) => f.alive).length;
    if (alive > 1 || this.flags.length <= 1) return;

    const survivor = this.flags.find((f) => f.alive);
    if (!survivor) return;

    this._showWinner(survivor);
    this.running = false;
    this._spawnFireworksCelebration();
    this._playQualifyChime();

    const stage = this.currentStage();
    this.qualifiedThisStage.push(survivor.code);
    this.qualifiedDisplayList.push({ code: survivor.code, idx: this.qualifiedThisStage.length });
    this._emitQualifiedList();
    this.stagePool = this.stagePool.filter((c) => c !== survivor.code);
    this._emitHud();

    if (this.qualifiedThisStage.length < stage.target) {
      setTimeout(() => {
        this.ARENA_RADIUS = this._computeArenaRadius(this.STAGE_W, this.STAGE_H);
        this.running = true;
        this._spawnFlags();
      }, 3200);
    } else if (stage.target === 1) {
      const championName = this.countryNames[survivor.code] || survivor.code;
      setTimeout(() => {
        this.emit('winner', { show: false });
        this._showStageAnnouncement('CHAMPION!', championName);
        this._playChampionFanfare();
      }, 800);
      setTimeout(() => this._speakChampion(championName), 1600);
      setTimeout(() => {
        this.stageIndex = 0;
        this.stagePool = this.countryCodes.slice();
        this.qualifiedThisStage = [];
        this.qualifiedDisplayList = [];
        this.qpRotationIndex = 0;
        this.ARENA_RADIUS = this._computeArenaRadius(this.STAGE_W, this.STAGE_H);
        this.running = true;
        this._spawnFlags();
      }, 6500);
    } else {
      const justFinished = stage;
      const nextStage = STAGES[this.stageIndex + 1];
      setTimeout(() => {
        this.emit('winner', { show: false });
        this._showStageAnnouncement(justFinished.target + ' QUALIFIED', 'Advancing to ' + nextStage.label);
        this._playStageFanfare();
      }, 800);
      setTimeout(() => {
        this.stageIndex++;
        this.stagePool = this.qualifiedThisStage.slice();
        this.qualifiedThisStage = [];
        this.qualifiedDisplayList = [];
        this.qpRotationIndex = 0;
        this.ARENA_RADIUS = this._computeArenaRadius(this.STAGE_W, this.STAGE_H);
        this.running = true;
        this._spawnFlags();
      }, 4800);
    }
  }

  _showWinner(f) {
    const stage = this.currentStage();
    const label = stage.target === 1 ? 'Tournament champion' : 'Qualified — ' + stage.label;
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

  // ================= Flag sprites (real flag-icons SVGs) =================

  _getSprite(code) {
    let entry = this._sprites.get(code);
    if (entry) return entry;
    entry = { img: null, canvas: null, ready: false };
    this._sprites.set(code, entry);
    const img = new Image();
    img.onload = () => {
      const sw = 64;
      const sh = 40;
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

  _drawFlagShape(f) {
    const ctx = this.ctx;
    const w = f.r * 2.15;
    const h = f.r * 1.4;
    const x0 = f.x - w / 2;
    const y0 = f.y - h / 2;
    
    ctx.save();
    if (f.flashUntil && f.flashUntil > Date.now()) {
      ctx.shadowColor = 'rgba(255, 255, 0, 0.8)';
      ctx.shadowBlur = 20;
    }
    
    const sprite = this._getSprite(f.code);
    if (sprite.ready && sprite.canvas) {
      ctx.drawImage(sprite.canvas, x0, y0, w, h);
    } else {
      // Neutral placeholder while the SVG is still loading.
      ctx.fillStyle = 'rgba(240,235,216,0.25)';
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.strokeStyle = (f.flashUntil && f.flashUntil > Date.now()) ? 'rgba(255,255,0,0.9)' : 'rgba(240,235,216,0.5)';
    ctx.lineWidth = (f.flashUntil && f.flashUntil > Date.now()) ? 3 : 1;
    ctx.strokeRect(x0, y0, w, h);
    
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

  // ================= Flying elimination + eliminated chips =================

  _eliminate(f) {
    if (!f.alive) return;
    f.alive = false;
    const upperCode = (f.code || '').toUpperCase();
    delete this.commentVotes[upperCode];
    this.emit('commentVotes', { ...this.commentVotes });
    this._playWhoosh();
    const dx = f.x - this.CENTER.x;
    const dy = f.y - this.CENTER.y;
    const startAngle = Math.atan2(dy, dx);
    const startRadius = Math.max(this.ARENA_RADIUS + 4, Math.hypot(dx, dy));
    const targetAngle = Math.PI / 2; // straight down toward the bar below
    const targetRadius = Math.max(this.ARENA_RADIUS + 40, this.STAGE_H + 30 - this.CENTER.y);
    this.flyingEliminations.push({
      code: f.code,
      startAngle,
      startRadius,
      targetAngle,
      targetRadius,
      t0: performance.now(),
      duration: 750,
    });
    this._emitHud();
  }

  _updateFlyingEliminations() {
    const now = performance.now();
    for (let i = this.flyingEliminations.length - 1; i >= 0; i--) {
      const fe = this.flyingEliminations[i];
      if (now - fe.t0 >= fe.duration) {
        this.eliminatedList.push({ code: fe.code, name: this.countryNames[fe.code] || fe.code });
        this.emit('eliminated', this.eliminatedList.slice());
        this.flyingEliminations.splice(i, 1);
      }
    }
  }

  _renderFlyingEliminations() {
    const ctx = this.ctx;
    const now = performance.now();
    this.flyingEliminations.forEach((fe) => {
      const raw = Math.min(1, (now - fe.t0) / fe.duration);
      const t = 1 - Math.pow(1 - raw, 3); // ease-out
      let da = fe.targetAngle - fe.startAngle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const angle = fe.startAngle + da * t;
      const radius = fe.startRadius + (fe.targetRadius - fe.startRadius) * t;
      const x = this.CENTER.x + Math.cos(angle) * radius;
      const y = this.CENTER.y + Math.sin(angle) * radius;
      const w = this.FLAG_R * 2.15 * (1 - 0.35 * t);
      const h = this.FLAG_R * 1.4 * (1 - 0.35 * t);
      ctx.save();
      ctx.globalAlpha = 1 - 0.2 * t;
      const sprite = this._getSprite(fe.code);
      if (sprite.ready && sprite.canvas) {
        ctx.drawImage(sprite.canvas, x - w / 2, y - h / 2, w, h);
      }
      ctx.restore();
    });
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

  _step() {
    if (this.settings?.rotSpeed !== undefined) {
      this.GATE_SPIN = Number(this.settings.rotSpeed);
    }
    this.GATES[0].angle = norm(this.GATES[0].angle + this.GATE_SPIN);
    this.BLOCKER.angle = norm(this.BLOCKER.angle + this.BLOCKER.speed);

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
    let speedMult = (this.settings?.speedMult !== undefined) ? Number(this.settings.speedMult) : 1;

    // 🐌 SLOW: global slow-motion while active.
    if (this._slowUntil && Date.now() > this._slowUntil) { this._slowUntil = 0; this._slowFactor = 1; }
    if (this._slowUntil) speedMult *= this._slowFactor;

    alive.forEach((f) => {
      // ❄️ FREEZE: hold still while frozen.
      if (f.frozenUntil && f.frozenUntil > Date.now()) {
        f.vx = 0; f.vy = 0;
        return;
      }
      // 🐌 SLOW (targeted): damp and crawl while active.
      const slowFactor = (f.slowUntil && f.slowUntil > Date.now()) ? 0.55 : 1;
      if (slowFactor < 1) { f.vx *= 0.97; f.vy *= 0.97; }
      if (grav > 0) {
        f.vy += grav * 0.08;
      }
      f.x += f.vx * speedMult * slowFactor;
      f.y += f.vy * speedMult * slowFactor;
    });

    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i];
        const b = alive[j];
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
            // Equal mass, restitution 1: exchange the full normal-velocity
            // component. No 0.5 damping factor — that drains energy on
            // every hit and grinds everything to a crawl.
            const impulse = -velAlongNormal;
            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            b.vx += impulse * nx;
            b.vy += impulse * ny;
          }
        }
      }
    }

    alive.forEach((f) => {
      const dx = f.x - this.CENTER.x;
      const dy = f.y - this.CENTER.y;
      const dist = Math.hypot(dx, dy);
      const limit = this.ARENA_RADIUS - f.r;
      if (dist <= limit) return;

      const posAngle = Math.atan2(dy, dx);
      const blocked = angleDiff(posAngle, this.BLOCKER.angle) < this.BLOCKER.half;
      const inGate = !blocked && this.GATES.some((g) => angleDiff(posAngle, g.angle) < g.half);

      if (inGate) {
        if (f.immunityUntil && f.immunityUntil > Date.now()) {
          // Protected by revival shield — safely bounce inward
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);
          f.x = this.CENTER.x + nx * limit;
          f.y = this.CENTER.y + ny * limit;
          f.vx = -nx * 1.2;
          f.vy = -ny * 1.2;
          return;
        }
        if (dist > this.ARENA_RADIUS + f.r * 1.4) this._eliminate(f);
        return;
      }

      const nx = dx / dist;
      const ny = dy / dist;
      const overshoot = dist - limit;
      f.x -= nx * overshoot;
      f.y -= ny * overshoot;
      const vDotN = f.vx * nx + f.vy * ny;
      const boost = this._activeBoostFor(f.code);
      // Vote boost slightly increases how much speed a flag keeps on a
      // wall bounce (its "resilience"), on top of the elastic reflection.
      f.vx -= 2 * vDotN * nx * boost;
      f.vy -= 2 * vDotN * ny * boost;
      if (Math.abs(vDotN) > 1) this._playThump();
    });

    // Safety net — nudge up to a randomized target so slow flags don't all
    // clump at exactly the same speed. Vote-boosted flags get a higher
    // floor too, giving them a visible edge while the boost lasts.
    const MIN_SPEED = 0.40;
    alive.forEach((f) => {
      const boost = this._activeBoostFor(f.code);
      const speed = Math.hypot(f.vx, f.vy);
      const minSpeed = MIN_SPEED * boost;
      if (speed < minSpeed) {
        const dir = speed > 0.0001 ? Math.atan2(f.vy, f.vx) : rand(0, Math.PI * 2);
        const target = rand(minSpeed, minSpeed * 1.5);
        f.vx = Math.cos(dir) * target;
        f.vy = Math.sin(dir) * target;
      }
    });

    // Clamp maximum speed and apply very gentle damping so gameplay remains calm and readable
    const MAX_SPEED = 1.6 * speedMult;
    alive.forEach((f) => {
      const speed = Math.hypot(f.vx, f.vy);
      if (speed > MAX_SPEED) {
        f.vx = (f.vx / speed) * MAX_SPEED;
        f.vy = (f.vy / speed) * MAX_SPEED;
      }
      f.vx *= 0.999;
      f.vy *= 0.999;
    });

    this._checkRoundEnd();
  }

  // ================= Rendering =================

  _drawArena() {
    const ctx = this.ctx;
    const gates = this.GATES.map((g) => ({ start: norm(g.angle - g.half), end: norm(g.angle + g.half) })).sort(
      (a, b) => a.start - b.start
    );
    ctx.beginPath();
    for (let i = 0; i < gates.length; i++) {
      const cur = gates[i];
      const next = gates[(i + 1) % gates.length];
      let segStart = cur.end;
      let segEnd = next.start;
      if (segEnd <= segStart) segEnd += Math.PI * 2;
      const x0 = this.CENTER.x + Math.cos(segStart) * this.ARENA_RADIUS;
      const y0 = this.CENTER.y + Math.sin(segStart) * this.ARENA_RADIUS;
      ctx.moveTo(x0, y0);
      ctx.arc(this.CENTER.x, this.CENTER.y, this.ARENA_RADIUS, segStart, segEnd);
    }
    ctx.strokeStyle = 'rgba(240,235,216,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.shadowColor = 'rgba(74,163,255,0.55)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(this.CENTER.x, this.CENTER.y, this.ARENA_RADIUS, this.BLOCKER.angle - this.BLOCKER.half, this.BLOCKER.angle + this.BLOCKER.half);
    ctx.strokeStyle = '#4aa3ff';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }

  _render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.STAGE_W, this.STAGE_H);
    this._drawArena();
    this.flags.forEach((f) => {
      if (f.alive) this._drawFlagShape(f);
    });
    this._renderFlyingEliminations();
    this._renderFireworks();
  }

  _computeArenaRadius(w, h) {
    const r = Math.min(w, h) * 0.42 - 10;
    return Math.max(60, Math.min(420, r));
  }

  _loop() {
    if (this.running) this._step();
    this._updateFlyingEliminations();
    this._updateFireworks();
    this._render();
    this._rafId = requestAnimationFrame(() => this._loop());
  }

  _bindResize() {}
}
