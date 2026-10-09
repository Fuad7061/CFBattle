import { COUNTRIES, getFlagUrl } from "./countries.js";
import { PhysicsEngine } from "./physics.js";
import { Renderer } from "./renderer.js";
import { UIManager } from "./ui.js";
import { AudioManager } from "./audio.js";
import { Recorder } from "./recorder.js";
import Matter from "matter-js";
/**
 * FlagBattle — Main game controller
 *
 * KEY FEATURES & FIXES:
 *  1. Exact 195 sovereign countries according to Worldometer Geography Guide.
 *  2. High-retention YouTube Audience Bias: near-miss deflections for popular viewership countries.
 *  3. Bouncy, lively ping-pong floating physics with kinetic tumbler agitation.
 *  4. Top 5 Finalist HUD tracker + in-arena floating country nameplates.
 *  5. Top 3 Suspense: bullet-time slow motion (0.45x), realistic double-pulse heartbeat audio,
 *     spotlight darkness vignette, and 1v1 Sudden Death tension.
 *  6. 25x8 CSS grid fitting all 195 flags simultaneously with zero scrollbars.
 */
export class FlagBattle {
  constructor() {
    /* ---- Canvas ----------------------------------------- */
    this.canvas = document.getElementById('game-canvas');
    this.canvas.width  = 540;
    this.canvas.height = 960;

    /* ---- Arena parameters (perfect vertical balance) ---- */
    this.CX = 270;   // center X
    this.CY = 445;   // center Y
    this.AR = 205;   // arena radius

    /* ---- Subsystems ------------------------------------- */
    this.physics  = new PhysicsEngine(this.CX, this.CY, this.AR);
    this.renderer = new Renderer(this.canvas);
    this.ui       = new UIManager();
    this.audio    = new AudioManager();
    this.recorder = new Recorder(this.canvas);

    /* ---- Game state ------------------------------------- */
    this.running    = false;   // physics loop active
    this.paused     = false;   // game paused
    this.images     = {};      // code → HTMLImageElement
    this.flags      = [];      // { body, country, eliminated }
    this.aliveCount = 0;
    this.totalCount = 0;
    this.roundNum   = 1;
    this.qualifiedList = [];

    /* ---- Suspense Phase Milestones ---------------------- */
    this._top5Triggered = false;
    this._top3Triggered = false;
    this._top2Triggered = false;
    this._ctaAudioTriggered = false;

    /* ---- Hole timer ------------------------------------- */
    this._holeMs    = 0;
    this._nextHole  = 2800;

    /* ---- Voice CTA Engine ------------------------------- */
    this._voiceCTATimer    = 0;
    this._nextVoiceCTA     = 45000; // first voice CTA after 45s
    this._voiceCTAIndex    = 0;
    this._halfwayTriggered = false;
    this._100elimTriggered = false;
    this._quarterTriggered = false;
    this._10leftTriggered  = false;

    /* ---- Configuration --------------------------------- */
    this.cfg = {
      channelName:   '@FlagsBattleSimulator',
      rotSpeed:      0.0028,
      gravity:       0.0,
      holeFreqMin:   2000,
      holeFreqMax:   4500,
      holeDuration:  3500,
      countdownSecs: 3,
      audienceBias:  true,
    };

    /* ---- Timing state ----------------------------------- */
    this._lastTs = 0;

    this._init();
  }

  /* ================================================================== */
  /*  INITIALIZATION                                                    */
  /* ================================================================== */

  _init() {
    // 1. Hook up near-miss sound effect for clutch deflections
    this.physics.onNearMiss = () => {
      this.audio.playNearMiss();
    };

    // 2. Bind controls & settings UI
    this._bindControls();
    this._buildSettingsUI();

    // 3. Apply branding
    this.ui.setBranding(this.cfg.channelName);

    // 4. Build 195-country roster grid (all fit with 0 scrollbars)
    this.ui.buildRoster(COUNTRIES);
    this.ui.updateCounter(0, 0);
    this.ui.setRound(this.roundNum);
    this.ui.setPhase('READY');

    // 5. Start RAF loop
    this._startLoop();

    // 6. Responsive scaling
    this._rescale();
    let resizePending = false;
    window.addEventListener('resize', () => {
      if (!resizePending) {
        resizePending = true;
        requestAnimationFrame(() => {
          this._rescale();
          resizePending = false;
        });
      }
    });

    // 7. Keyboard shortcuts
    window.addEventListener('keydown', e => this._onKey(e));

    // Apply settings on load
    this._applySettings();

    // 8. Load images in background
    this.ui.showLoading(`Loading ${COUNTRIES.length} official countries…`);
    this._loadImages();

    // 9. Initialize YouTube Chat SSE
    this._initYoutubeChat();
  }

  /* ================================================================== */
  /*  YOUTUBE CHAT INTEGRATION                                          */
  /* ================================================================== */

  _initYoutubeChat() {
    const source = new EventSource('/api/chat-stream');
    source.onmessage = (e) => {
      if (e.data === ': ping') return;
      try {
        const msg = JSON.parse(e.data);
        if (this.running && !this.paused) {
          // Only act on the dedicated typed POWER broadcast; plain chat
          // messages also embed a nested `power` object which must not be
          // applied a second time.
          if (msg.type === 'POWER') {
            this._handlePower({ ...msg, author: msg.author });
          }
          if (msg.vote) {
            this._handleChatVote(msg.vote, msg.author);
          }
        }
        if (msg.type === 'VIEWER_COUNT' && msg.count != null && this.ui?.setViewerCount) {
          this.ui.setViewerCount(msg.count);
        }
      } catch (err) {
        console.error('Error parsing chat message', err);
      }
    };
    source.onerror = (err) => {
      console.warn('SSE stream error, retrying...', err);
    };
  }

  _powerDuration(base) {
    return base;
  }

  _handlePower(power) {
    const p = (typeof power.power === 'string' ? power.power : '').toLowerCase();
    const code = power.code;
    const author = power.author || 'CHAT';
    const paid = Boolean(power.superChat);
    const weight = Math.max(1, Number(power.weight) || 1);
    // Paid Super Chat powers last longer / hit harder; free comment powers
    // still work (user-friendly) but are shorter and gentler.
    const dur = (base) => Math.round(paid ? base * 1.75 : base);
    const flag = code ? this.flags.find(f => f.country.code === code) : null;
    const alive = flag && !flag.eliminated;

    switch (p) {
      case 'revive': {
        if (flag && flag.eliminated) {
          flag.eliminated = false;
          const ang = Math.random() * Math.PI * 2;
          const rad = 25 + Math.random() * 35;
          this.physics.reviveFlag(flag.body, this.CX + Math.cos(ang) * rad, this.CY + Math.sin(ang) * rad);
          flag.reviveEffectEnd = Date.now() + 3500;
          this.aliveCount = this.flags.filter(f => !f.eliminated).length;
          this.standings = this.standings.filter(c => c.code !== code);
          if (this.ui.reviveFlag) this.ui.reviveFlag(code);
          if (this.ui.reviveTop5Card) this.ui.reviveTop5Card(code);
          if (this.ui.updateCounter) this.ui.updateCounter(this.aliveCount, this.totalCount);
          if (this.ui.hideReviveProgress) this.ui.hideReviveProgress(code);
          if (this.audio.playDramaticHit) this.audio.playDramaticHit();
          if (this.ui.showReviveToast && flag.country) {
            this.ui.showReviveToast(flag.country, getFlagUrl(code, 80), author);
          }
          if (this.ui.showPowerToast) this.ui.showPowerToast('⚡ REVIVE', flag.country, getFlagUrl(code, 40), author);
        }
        break;
      }
      case 'shield': {
        if (alive) {
          flag.body.immunityUntil = Date.now() + dur(6000);
          flag.reviveEffectEnd = Date.now() + dur(6000);
          if (this.ui.showPowerToast) this.ui.showPowerToast('🛡️ SHIELD', flag.country, getFlagUrl(code, 40), author);
        }
        break;
      }
      case 'freeze': {
        if (alive) {
          flag.body.frozenUntil = Date.now() + dur(4500);
          Matter.Body.setVelocity(flag.body, { x: 0, y: 0 });
          Matter.Body.setAngularVelocity(flag.body, 0);
          if (this.ui.showPowerToast) this.ui.showPowerToast('❄️ FREEZE', flag.country, getFlagUrl(code, 40), author);
        }
        break;
      }
      case 'slow': {
        if (code && flag && !flag.eliminated) {
          // Targeted: "slow US" slows down just that country's flag.
          flag.body.slowUntil = Date.now() + dur(5000);
          if (this.ui.showPowerToast) this.ui.showPowerToast('🐌 SLOWED', flag.country, getFlagUrl(code, 40), author);
        } else {
          // Global full-arena slow-motion.
          this.physics.setTimeScale(0.45);
          clearTimeout(this._slowTimer);
          this._slowTimer = setTimeout(() => this.physics.resetTimeScale(), dur(5000));
          if (this.ui.showGlobalPowerToast) this.ui.showGlobalPowerToast('🐌 SLOW MOTION', author);
        }
        break;
      }
      case 'quake': {
        const mag = paid ? 9 : 6;
        for (const f of this.flags) {
          if (f.eliminated) continue;
          const a = Math.random() * Math.PI * 2;
          Matter.Body.setVelocity(f.body, { x: Math.cos(a) * mag, y: Math.sin(a) * mag });
          Matter.Body.setAngularVelocity(f.body, (Math.random() - 0.5) * 1.5);
        }
        if (this.audio.playDramaticHit) this.audio.playDramaticHit();
        if (this.ui.showGlobalPowerToast) this.ui.showGlobalPowerToast('💥 EARTHQUAKE!', author);
        break;
      }
      case 'boost': {
        if (alive) {
          const b = flag.body;
          const dx = this.CX - b.position.x;
          const dy = this.CY - b.position.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const mag = (paid ? 11 : 8) + Math.min(weight, 30) * 0.1;
          Matter.Body.setVelocity(b, { x: (dx / d) * mag, y: (dy / d) * mag });
          flag.reviveEffectEnd = Date.now() + dur(2500);
          if (this.ui.showPowerToast) this.ui.showPowerToast('🚀 BOOST', flag.country, getFlagUrl(code, 40), author);
        }
        break;
      }
      case 'nuke': {
        if (alive) {
          this._forceEliminate(flag, author);
          if (this.ui.showGlobalPowerToast) this.ui.showGlobalPowerToast('☢️ NUKE!', author);
        }
        break;
      }
      default:
        break;
    }
  }

  _forceEliminate(flag, author) {
    if (!flag || flag.eliminated) return;
    const body = flag.body;
    flag.eliminated = true;
    body.eliminated = true;
    this.aliveCount = Math.max(0, this.aliveCount - 1);
    this.standings.push(flag.country);
    const img = this.images[flag.country.code];
    this.renderer.addFallingFlag(flag.country, body.position.x, body.position.y, body.velocity.x, body.velocity.y, body.angle, img);
    this.renderer.addBurst(body.position.x, body.position.y);
    this.audio.playElimination();
    this.ui.eliminateFlag(flag.country.code);
    this.ui.updateCounter(this.aliveCount, this.totalCount);
    this.ui.showEliminationToast(flag.country, getFlagUrl(flag.country.code, 40));
    if (this._top5Triggered && this.aliveCount < 5) {
      this.ui.eliminateTop5Card(flag.country.code, this.aliveCount + 1);
    }
  }

  _handleChatVote(vote, author) {
    if (vote.weight) {
      try { this.ui.recordSupporterVote(author, vote.weight); } catch (e) {}
    }
    const code = vote.code;
    const flag = this.flags.find(f => f.country.code === code);
    if (!flag) return;

    if (flag.eliminated) {
      if (!this.reviveVotes) this.reviveVotes = {};
      this.reviveVotes[code] = (this.reviveVotes[code] || 0) + (vote.weight || 1);
      
      const targetVotes = this.cfg?.reviveVotes || (typeof window !== 'undefined' && window.__liveSettings?.reviveVotes ? window.__liveSettings.reviveVotes : 4);
      
      if (this.reviveVotes[code] >= targetVotes) {
        this.reviveVotes[code] = 0;
        
        flag.eliminated = false;
        
        // Spawn safely near center with slight random offset to prevent boundary clipping
        const ang = Math.random() * Math.PI * 2;
        const rad = 25 + Math.random() * 35;
        const spawnX = this.CX + Math.cos(ang) * rad;
        const spawnY = this.CY + Math.sin(ang) * rad;
        
        this.physics.reviveFlag(flag.body, spawnX, spawnY);
        
        flag.reviveEffectEnd = Date.now() + 3500;
        
        this.aliveCount = this.flags.filter(f => !f.eliminated).length;
        this.standings = this.standings.filter(c => c.code !== code);

        if (this.ui.showReviveToast) {
           this.ui.showReviveToast(flag.country, getFlagUrl(code, 80), vote.author || 'CHAT');
        }
        
        if (this.audio.playDramaticHit) this.audio.playDramaticHit();
        if (this.ui.reviveFlag) this.ui.reviveFlag(code);
        if (this.ui.reviveTop5Card) this.ui.reviveTop5Card(code);
        if (this.ui.updateCounter) this.ui.updateCounter(this.aliveCount, this.totalCount);
        if (this.ui.hideReviveProgress) this.ui.hideReviveProgress(code);
      } else {
        if (this.ui.showReviveProgress) {
           this.ui.showReviveProgress(flag.country, getFlagUrl(code, 80), this.reviveVotes[code], targetVotes);
        }
      }
      return;
    }

    // Show toast UI
    if (this.ui.showChatBoostToast) {
       this.ui.showChatBoostToast(flag.country, getFlagUrl(code, 80));
    }

    // Apply physics boost (push away from the hole/edge towards center)
    const body = flag.body;
    const dx = this.CX - body.position.x;
    const dy = this.CY - body.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const forceMag = 0.015 * (vote.weight || 1); 
    Matter.Body.applyForce(body, body.position, {
      x: (dx / dist) * forceMag,
      y: (dy / dist) * forceMag
    });

    flag.reviveEffectEnd = Date.now() + 3000;
    body.immunityUntil = Date.now() + 3000;
  }

  /* ================================================================== */
  /*  IMAGE LOADING                                                     */
  /* ================================================================== */

  async _loadImages() {
    let loaded = 0;
    const codes = COUNTRIES.map(c => c.code);
    const BATCH = 35;

    const loadOne = code => new Promise(resolve => {
      const img       = new Image();
      img.crossOrigin = 'anonymous';
      img.src         = getFlagUrl(code, 80);
      img.onload = img.onerror = () => {
        this.images[code] = img;
        loaded++;
        if (loaded % BATCH === 0 || loaded === codes.length) {
          this.ui.updateLoading(`Loading flags… ${loaded}/${codes.length}`);
        }
        resolve();
      };
    });

    for (let i = 0; i < codes.length; i += BATCH) {
      await Promise.all(codes.slice(i, i + BATCH).map(loadOne));
    }
    this.ui.hideLoading();
  }

  // --- Exposed API Methods for Dashboard ---
  start() {
    const btn = document.getElementById('btn-start');
    if (btn && btn.disabled) return;
    this._cleanRound();
    this._beginRound();
  }

  pause() {
    if (!this.running) return;
    this.paused = true;
    this.audio.pauseBgMusic();
    const btn = document.getElementById('btn-pause');
    if (btn) btn.textContent = '▶ RESUME';
  }

  resume() {
    if (!this.running) return;
    this.paused = false;
    this.audio.playBgMusic();
    const btn = document.getElementById('btn-pause');
    if (btn) btn.textContent = '⏸ PAUSE';
  }

  reset() {
    this._fullReset();
  }

  /* ================================================================== */
  /*  CONTROLS BINDING                                                  */
  /* ================================================================== */

  _bindControls() {
    const $ = id => document.getElementById(id);

    /* -- START / RESTART -- */
    if ($('btn-start')) {
      $('btn-start').onclick = () => this.start();
    }

    /* -- PAUSE / RESUME -- */
    if ($('btn-pause')) {
      $('btn-pause').onclick = () => {
        if (!this.running) return;
        if (this.paused) this.resume();
        else this.pause();
      };
    }

    /* -- FULL RESET -- */
    if ($('btn-reset')) {
      $('btn-reset').onclick = () => this.reset();
    }

    /* -- MUTE -- */
    if ($('btn-mute')) {
      $('btn-mute').onclick = () => {
        const muted = this.audio.toggleMute();
        $('btn-mute').textContent = muted ? '🔇' : '🔊';
        $('btn-mute').title       = muted ? 'Unmute (M)' : 'Mute (M)';
      };
    }

    /* -- FULLSCREEN -- */
    if ($('btn-fs')) {
      $('btn-fs').onclick = () => {
        const el = document.getElementById('game-wrapper');
        if (!document.fullscreenElement) el.requestFullscreen?.();
        else document.exitFullscreen?.();
      };
    }

    /* -- RECORD -- */
    if ($('btn-record')) {
      $('btn-record').onclick = async () => {
        try {
          await this.recorder.start();
          $('btn-record').disabled     = true;
          $('btn-stop').disabled       = false;
          $('rec-badge').style.display = 'flex';
        } catch (err) {}
      };
    }

    if ($('btn-stop')) {
      $('btn-stop').onclick = async () => {
        await this.recorder.stop();
        $('btn-record').disabled     = false;
        $('btn-stop').disabled       = true;
        $('rec-badge').style.display = 'none';
        $('btn-download').disabled   = false;
      };
    }

    if ($('btn-download')) {
      $('btn-download').onclick = () => {
        this.recorder.download(`flag-battle-r${this.roundNum}.mkv`);
      };
    }

    /* -- SPEED SLIDER -- */
    if ($('speed-slider')) {
      const slider = $('speed-slider');
      $('speed-value').textContent = `${slider.value}×`;
      slider.oninput = () => {
        const v = parseInt(slider.value);
        this.physics.setStepsPerFrame(v);
        $('speed-value').textContent = `${v}×`;
      };
    }

    /* -- SETTINGS PANEL -- */
    if ($('btn-settings')) $('btn-settings').onclick   = () => $('settings-panel').classList.toggle('open');
    if ($('settings-close')) $('settings-close').onclick = () => {
      $('settings-panel').classList.remove('open');
      this._applySettings();
    };

    /* -- MUSIC UPLOAD -- */
    if ($('music-upload')) {
      $('music-upload').onchange = e => {
        const f = e.target.files[0];
        if (f) this.audio.loadBgMusic(URL.createObjectURL(f));
      };
    }

    /* -- LIVE VOLUME SLIDERS -- */
    if ($('setting-music-vol')) {
      $('setting-music-vol').oninput = (e) => {
        this.audio.setBgVolume(parseFloat(e.target.value));
      };
    }
    if ($('setting-sfx-vol')) {
      $('setting-sfx-vol').oninput = (e) => {
        this.audio.setSfxVolume(parseFloat(e.target.value));
      };
    }

    /* -- LIVE WATERMARK SETTINGS -- */
    if ($('setting-channel')) $('setting-channel').oninput    = (e) => this.renderer.watermarkText = e.target.value;
    if ($('setting-wm-opacity')) $('setting-wm-opacity').oninput = (e) => this.renderer.watermarkOpacity = parseFloat(e.target.value);
    if ($('setting-wm-size')) $('setting-wm-size').oninput    = (e) => this.renderer.watermarkSize = parseInt(e.target.value);
    if ($('setting-wm-count')) $('setting-wm-count').oninput   = (e) => this.renderer.watermarkCount = parseInt(e.target.value);
    if ($('setting-wm-angle')) $('setting-wm-angle').oninput   = (e) => this.renderer.watermarkAngle = parseInt(e.target.value);
  }


  /* -- Keyboard shortcuts -- */
  _onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        if (document.getElementById('btn-start').disabled) return;
        if (!this.running) document.getElementById('btn-start').click();
        else { this.paused = !this.paused; document.getElementById('btn-pause').click(); }
        break;
      case 'KeyP':
        document.getElementById('btn-pause').click(); break;
      case 'KeyR':
        this._fullReset(); break;
      case 'KeyM':
        document.getElementById('btn-mute').click(); break;
      case 'KeyF':
        document.getElementById('btn-fs').click(); break;
    }
  }

  /* ================================================================== */
  /*  ROUND LIFECYCLE                                                   */
  /* ================================================================== */

  async _beginRound() {
    this._abortCountdown = false;
    const startBtn = document.getElementById('btn-start');
    if (startBtn) startBtn.disabled = true;

    // Countdown
    if (this.cfg.countdownSecs > 0) {
      await this._runCountdown(this.cfg.countdownSecs);
    }
    
    if (startBtn) startBtn.disabled = false;
    if (this._abortCountdown) return;

    let countries = this._shuffled(COUNTRIES);
    
    // Check if totalCountries is set in liveSettings
    if (window.__liveSettings && window.__liveSettings.totalCountries) {
        const numToSpawn = parseInt(window.__liveSettings.totalCountries) || 195;
        countries = countries.slice(0, Math.min(numToSpawn, countries.length));
    }
    
    this.totalCount = countries.length;
    this.aliveCount = countries.length;

    // Reset suspense milestones
    this._top5Triggered = false;
    this._top3Triggered = false;
    this._top2Triggered = false;
    this._ctaAudioTriggered = false;
    this._boostTimer    = 0;
    this._nextBoostMs   = 8000 + Math.random() * 5000;
    this.physics.setTimeScale(1.0);
    this.audio.stopHeartbeat();
    this.ui.hideTop5Finalists();

    // Fermat spiral ping-pong spawn
    this.flags = [];
    const count = countries.length;
    const maxRadius = 140; // Safe inner core
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const c = maxRadius / Math.sqrt(count);

    countries.forEach((country, i) => {
      const r     = c * Math.sqrt(i + 0.5);
      const theta = i * goldenAngle;
      const x     = this.CX + Math.cos(theta) * r;
      const y     = this.CY + Math.sin(theta) * r;
      // Start slightly closer to center to let them burst outward
      const body  = this.physics.spawnFlag(this.CX + (x - this.CX)*0.5, this.CY + (y - this.CY)*0.5, 20, 13, country);
      this.flags.push({ body, country, eliminated: false });
    });

    // UI Updates
    this.ui.setRound(this.roundNum);
    this.ui.setPhase('QUALIFYING');
    this.ui.buildRoster(countries);
    this.ui.updateCounter(this.aliveCount, this.totalCount);
    this.ui.hideWinner();
    this.ui.startTimer();

    // Hole timer reset
    this._holeMs   = 0;
    this._nextHole = this._randHoleInterval();

    // Activate physics
    this.running = true;
    this.paused  = false;
    if (document.getElementById('btn-pause')) document.getElementById('btn-pause').disabled = false;
    if (document.getElementById('btn-start')) document.getElementById('btn-start').textContent = '↺ RESTART';

    this.audio.playBgMusic();
    this.ui.showChatCta(true);

    // Voice CTA reset
    this._voiceCTATimer    = 0;
    this._nextVoiceCTA     = 45000;
    this._voiceCTAIndex    = 0;
    this._halfwayTriggered = false;
    this._100elimTriggered = false;
    this._quarterTriggered = false;
    this._10leftTriggered  = false;

    // Start engagement systems
    this.ui.startSupporters();
    this.ui.startViewerCount();
    this.ui.startEngagementCTA();
  }

  _cleanRound() {
    this.running = false;
    this.paused  = false;
    this.flags   = [];
    this.standings = [];
    this.physics.reset();
    this.renderer.clearFallingFlags();
    this.audio.stopHeartbeat();
    this.ui.stopTimer();
    this.ui.hideWinner();
    this.ui.hideTop5Finalists();
    this.ui.showChatCta(false);
    this.ui.stopEngagementCTA();
    if (document.getElementById('btn-pause')) document.getElementById('btn-pause').textContent = '⏸ PAUSE';
    this._abortCountdown = true;
    if (document.getElementById('btn-start')) document.getElementById('btn-start').disabled = false;
  }

  _fullReset() {
    this._cleanRound();
    this.roundNum      = 1;
    this.qualifiedList = [];
    this.ui.clearQualified();
    this.ui.setRound(1);
    this.ui.setPhase('READY');
    this.ui.updateCounter(0, 0);
    this.ui.buildRoster(COUNTRIES);
    this.ui.resetRoster();
    this.ui.resetSupporters();
    this.ui.stopViewerCount();
    this.ui.stopEngagementCTA();
    this.audio.pauseBgMusic();
    if (document.getElementById('btn-start')) document.getElementById('btn-start').textContent = '▶ START';
    if (document.getElementById('btn-pause')) document.getElementById('btn-pause').disabled = true;
    if (document.getElementById('btn-pause')) document.getElementById('btn-pause').textContent = '⏸ PAUSE';
  }

  async _runCountdown(secs) {
    for (let i = secs; i >= 0; i--) {
      if (this._abortCountdown) break;
      this.ui.showCountdown(i);
      this.ui.updateCountdown(i);
      this.audio.playTick(i === 0);
      await new Promise(r => setTimeout(r, 1000));
    }
    this.ui.hideCountdown();
  }

  /* ================================================================== */
  /*  WINNER HANDLING                                                   */
  /* ================================================================== */

  _handleWinner() {
    this.running = false;
    this.physics.setTimeScale(1.0);
    this.audio.stopHeartbeat();
    this.ui.stopTimer();
    this.audio.pauseBgMusic();
    if (document.getElementById('btn-pause')) document.getElementById('btn-pause').disabled = true;

    const winner = this.flags.find(f => !f.eliminated);
    if (!winner) return;

    const c = winner.country;
    this.qualifiedList.push(c);
    
    // Check if we hit the total rounds requested from liveSettings
    const targetRounds = (window.__liveSettings && window.__liveSettings.totalRounds) ? parseInt(window.__liveSettings.totalRounds) : 1;
    if (this.roundNum < targetRounds) {
        // Transition to next round automatically
        setTimeout(() => {
            this.roundNum++;
            this._cleanRound();
            this._beginRound();
        }, 8000); // Wait 8 seconds before auto-starting the next round
    }
    
    // Get 2nd and 3rd place (last ones eliminated)
    const second = this.standings.length > 0 ? this.standings[this.standings.length - 1] : null;
    const third = this.standings.length > 1 ? this.standings[this.standings.length - 2] : null;

    this.ui.showWinner(
      c, getFlagUrl(c.code, 160),
      second, second ? getFlagUrl(second.code, 80) : null,
      third, third ? getFlagUrl(third.code, 80) : null
    );
    this.ui.addQualified(c, getFlagUrl(c.code, 40));
    this.ui.setPhase('CHAMPION');

    this.audio.playWinnerFanfare();

    // Voice: Winner + engagement CTA
    this._speakNatural(`The champion is ${c.name}! Incredible battle!`);
    setTimeout(() => {
      this._speakNatural('Like and subscribe for more epic battles! Comment your country to join the next round!');
    }, 3500);

    // Burst particles at winner position
    if (winner.body) {
      this.renderer.addBurst(winner.body.position.x, winner.body.position.y, '#ffcc00');
    }

    // Auto-advance to next round after 8s (matching podium countdown)
    setTimeout(() => {
      this.roundNum++;
      this._cleanRound();
      this._beginRound();
    }, 8000);
  }

  /* ================================================================== */
  /*  GAME LOOP (Fixed-timestep accumulator for pro smoothness)        */
  /* ================================================================== */

  _startLoop() {
    const FIXED_STEP_MS = 1000 / 60; // 16.666ms
    let accum = 0;
    let lastTs = performance.now();

    const tick = ts => {
      let dt = ts - lastTs;
      lastTs = ts;

      if (dt > 100) dt = 100;

      if (this.running && !this.paused) {
        accum += dt;

        // Run fixed physics steps based on real time
        while (accum >= FIXED_STEP_MS) {
          this._physicsStep(FIXED_STEP_MS);
          accum -= FIXED_STEP_MS;
        }
      } else {
        accum = 0;
      }

      // High framerate visual rendering
      this.renderer.frame(this.physics, this.flags, this.images);

      requestAnimationFrame(tick);
    };

    lastTs = performance.now();
    requestAnimationFrame(tick);
  }

  _physicsStep(dt) {
    // Hole timer
    this._holeMs += dt;
    if (this._holeMs >= this._nextHole) {
      this._holeMs   = 0;
      this._nextHole = this._randHoleInterval();
      this.physics.openRandomHole(this.cfg.holeDuration);
    }

    // Chat Boost timer
    if (this.aliveCount > 3) {
      this._boostTimer += dt;
      if (this._boostTimer >= this._nextBoostMs) {
        this._boostTimer = 0;
        this._nextBoostMs = 12000 + Math.random() * 8000;
        
        // Pick a random alive flag
        const aliveFlags = this.flags.filter(f => !f.eliminated);
        if (aliveFlags.length > 0) {
          // Slight bias towards first half (which are usually more popular countries due to weights)
          const idx = Math.floor(Math.pow(Math.random(), 1.5) * aliveFlags.length);
          const flag = aliveFlags[idx];
          
          if (flag && flag.body) {
            // Apply massive inward push and make it temporarily heavier
            const cx = this.physics.cx;
            const cy = this.physics.cy;
            const dx = cx - flag.body.position.x;
            const dy = cy - flag.body.position.y;
            const dist = Math.sqrt(dx*dx + dy*dy) || 1;
            
            Matter.Body.setVelocity(flag.body, { x: (dx/dist)*8, y: (dy/dist)*8 });
            Matter.Body.setAngularVelocity(flag.body, (Math.random() - 0.5) * 1.5);
            
            this.renderer.addBurst(flag.body.position.x, flag.body.position.y, '#88ccff');
            this.ui.showChatBoostToast(flag.country, getFlagUrl(flag.country.code, 40));
          }
        }
      }
    }

    // Voice CTA engine — periodic natural voice prompts
    this._voiceCTATimer += dt;
    if (this._voiceCTATimer >= this._nextVoiceCTA) {
      this._voiceCTATimer = 0;
      this._nextVoiceCTA = 50000 + Math.random() * 30000; // 50-80s apart
      this._triggerVoiceCTA();
    }

    // Physics step
    const eliminated = this.physics.update(dt);

    // Process each elimination
    for (const body of eliminated) {
      const f = this.flags.find(x => x.body === body);
      if (!f || f.eliminated) continue;
      f.eliminated = true;
      this.aliveCount--;
      this.standings.push(f.country);

      // Visual falling flag animation with sparks
      const img = this.images[f.country.code];
      this.renderer.addFallingFlag(f.country, body.position.x, body.position.y, body.velocity.x, body.velocity.y, body.angle, img);
      this.renderer.addBurst(body.position.x, body.position.y);
      this.audio.playElimination();

      // Update HUD & roster
      this.ui.eliminateFlag(f.country.code);
      this.ui.updateCounter(this.aliveCount, this.totalCount);
      this.ui.showEliminationToast(f.country, getFlagUrl(f.country.code, 40));

      // If in Top 5, eliminate the card in Top 5 tracker
      if (this._top5Triggered && this.aliveCount < 5) {
        this.ui.eliminateTop5Card(f.country.code, this.aliveCount + 1);
      }

      // ─────────────────────────────────────────────────────────────
      // SUSPENSE MILESTONES (Optimized for Maximum YouTube AVD)
      // ─────────────────────────────────────────────────────────────

      // Milestone: HALFWAY
      if (!this._halfwayTriggered && this.aliveCount <= Math.floor(this.totalCount / 2)) {
        this._halfwayTriggered = true;
        this.ui.showMilestone('🔥 HALFWAY POINT!');
        this._speakNatural('We are at the halfway point! Which countries will survive?');
      }

      // Milestone: 100 eliminated
      if (!this._100elimTriggered && (this.totalCount - this.aliveCount) >= 100) {
        this._100elimTriggered = true;
        this.ui.showMilestone('💥 100 FLAGS ELIMINATED!');
      }

      // Milestone: 25% remaining
      if (!this._quarterTriggered && this.aliveCount <= Math.floor(this.totalCount / 4)) {
        this._quarterTriggered = true;
        this.ui.showMilestone('⚡ ONLY ' + this.aliveCount + ' FLAGS LEFT!');
        this._speakNatural('Only ' + this.aliveCount + ' countries remain! Is your flag still alive?');
      }

      // Milestone: CTA AUDIO (10 flags)
      if (this.aliveCount <= 10 && !this._10leftTriggered) {
        this._10leftTriggered = true;
        this.ui.showMilestone('🏆 TOP 10 SURVIVORS!');
      }

      // Milestone: 8 flags — voice CTA
      if (this.aliveCount <= 8 && !this._ctaAudioTriggered) {
        this._ctaAudioTriggered = true;
        this._speakNatural('Comment your country to boost your flag!');
      }

      // Milestone: TOP 5 FINALISTS
      if (this.aliveCount === 5 && !this._top5Triggered) {
        this._top5Triggered = true;
        this.audio.playDramaticHit();
        this.ui.showSuspense('🔥 TOP 5 FINAL SHOWDOWN!');
        const top5 = this.flags.filter(x => !x.eliminated).map(x => x.country);
        this.ui.showTop5Finalists(top5);
      }

      // Milestone: TOP 3 SUSPENSE (Matrix Slow-Motion + Heartbeat)
      if (this.aliveCount === 3 && !this._top3Triggered) {
        this._top3Triggered = true;
        this.audio.playDramaticHit();
        this.audio.startHeartbeat(false);
        this.physics.setTimeScale(0.45); // Dramatic 0.45x slow-motion
        this.ui.showSuspense('⚡ TOP 3 SURVIVORS — WHO WILL TAKE THE CROWN?!');
      }

      // Milestone: 1V1 SUDDEN DEATH FINAL
      if (this.aliveCount === 2 && !this._top2Triggered) {
        this._top2Triggered = true;
        this.audio.playDramaticHit();
        this.audio.startHeartbeat(true); // Fast heartbeat
        this.ui.showSuspense('🔥 1V1 SUDDEN DEATH FINAL!');
      }

      // Check for winner
      if (this.aliveCount <= 1) {
        this._handleWinner();
        break;
      }
    }
  }

  /* ================================================================== */
  /*  SETTINGS                                                          */
  /* ================================================================== */

  _buildSettingsUI() {
    const voiceSel = document.getElementById('setting-voice');
    const fillVoices = () => {
      const voices = this.audio.getVoices();
      voiceSel.innerHTML = '';
      if (!voices.length) { voiceSel.innerHTML = '<option>Loading…</option>'; return; }
      voices.forEach((v, i) => voiceSel.appendChild(new Option(`${v.name} (${v.lang})`, i)));
    };
    window.speechSynthesis?.addEventListener('voiceschanged', fillVoices);
    fillVoices();

    document.getElementById('setting-channel').value        = this.cfg.channelName;
    document.getElementById('setting-rot-speed').value      = this.cfg.rotSpeed;
    document.getElementById('setting-gravity').value        = this.cfg.gravity;
    document.getElementById('setting-countdown').value      = this.cfg.countdownSecs;
    document.getElementById('setting-hole-dur').value       = this.cfg.holeDuration;
    document.getElementById('setting-audience-bias').checked = this.cfg.audienceBias;
  }

  _applySettings() {
    const val = id => document.getElementById(id)?.value?.trim();
    const num = id => parseFloat(document.getElementById(id)?.value);
    const chk = id => document.getElementById(id)?.checked;

    const ch = val('setting-channel');
    this.cfg.channelName = ch || '@FlagsBattleSimulator';
    this.ui.setBranding(this.cfg.channelName);
    this.renderer.watermarkText = this.cfg.channelName;
    
    // Watermark Config
    this.renderer.watermarkOpacity = num('setting-wm-opacity');
    this.renderer.watermarkSize    = num('setting-wm-size');
    this.renderer.watermarkCount   = num('setting-wm-count');
    this.renderer.watermarkAngle   = num('setting-wm-angle');

    const rot = num('setting-rot-speed');
    if (!isNaN(rot)) { this.cfg.rotSpeed = rot; this.physics.setRotSpeed(rot); }

    const gv = num('setting-gravity');
    if (!isNaN(gv)) { this.cfg.gravity = gv; this.physics.setGravity(gv); }

    const cd = parseInt(val('setting-countdown'));
    if (!isNaN(cd)) this.cfg.countdownSecs = cd;

    const hd = parseInt(val('setting-hole-dur'));
    if (!isNaN(hd)) this.cfg.holeDuration = hd;

    const bias = chk('setting-audience-bias');
    this.cfg.audienceBias = bias ?? true;
    this.physics.audienceBiasEnabled = this.cfg.audienceBias;

    const hf = parseInt(document.getElementById('setting-hole-freq')?.value);
    const freqMap = { 1:[8000,15000], 2:[4000,8000], 3:[2000,4500], 4:[900,2000], 5:[300,900] };
    const [lo, hi] = freqMap[hf] ?? [2000,4500];
    this.cfg.holeFreqMin = lo;
    this.cfg.holeFreqMax = hi;

    this.audio.setProvider(
      val('setting-tts') || 'browser',
      val('setting-gemini-key') || ''
    );
    const vi = parseInt(document.getElementById('setting-voice')?.value);
    if (!isNaN(vi)) this.audio.voiceIndex = vi;

    this.audio.sfxEnabled   = chk('setting-sfx')   ?? true;
    this.audio.musicEnabled = chk('setting-music')  ?? true;

    const mv = num('setting-music-vol');
    if (!isNaN(mv)) this.audio.setBgVolume(mv);

    const sv = num('setting-sfx-vol');
    if (!isNaN(sv)) this.audio.setSfxVolume(sv);
  }

  /* ================================================================== */
  /*  HELPERS                                                           */
  /* ================================================================== */

  _randHoleInterval() {
    return this.cfg.holeFreqMin + Math.random() * (this.cfg.holeFreqMax - this.cfg.holeFreqMin);
  }

  _shuffled(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = 0 | (Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ================================================================== */
  /*  VOICE CTA ENGINE — Natural engagement prompts                     */
  /* ================================================================== */

  _speakNatural(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); // prevent overlap
    const u = new SpeechSynthesisUtterance(text);
    u.lang  = 'en-US';
    u.rate  = 0.95;
    u.pitch = 1.05;
    
    // Try to use the user-selected voice
    const voices = window.speechSynthesis.getVoices();
    if (this.audio?.voiceIndex != null && voices[this.audio.voiceIndex]) {
      u.voice = voices[this.audio.voiceIndex];
    }
    
    window.speechSynthesis.speak(u);
  }

  _triggerVoiceCTA() {
    if (!this.running || this.paused) return;
    
    const aliveFlags = this.flags.filter(f => !f.eliminated);
    const randomCountry = aliveFlags.length > 0
      ? aliveFlags[Math.floor(Math.random() * aliveFlags.length)].country.name
      : null;

    const prompts = [
      'Like and subscribe if you are watching!',
      'Drop a comment with your country name!',
      `${randomCountry || 'Your country'} is still alive! Comment to boost it!`,
      'Send a gift to appear on the Top Supporters leaderboard!',
      'Share this battle with your friends!',
      `${aliveFlags.length} flags still fighting! Who will survive?`,
      'Subscribe and turn on notifications for more epic battles!',
      `Can ${randomCountry || 'your country'} make it to the finals?`,
    ];

    const text = prompts[this._voiceCTAIndex % prompts.length];
    this._voiceCTAIndex++;
    this._speakNatural(text);
  }

  /* ================================================================== */
  /*  RESPONSIVE VIEWPORT SCALING                                       */
  /* ================================================================== */

  _rescale() {
    const wrapper  = document.getElementById('game-wrapper');
    if (!wrapper) return;
    const controls = document.getElementById('controls-panel');
    const hint     = document.getElementById('key-hint');
    const ctrlH    = (controls?.offsetHeight ?? 0) + (hint?.offsetHeight ?? 0) + 16;

    const availW = window.innerWidth;
    const availH = window.innerHeight - (controls ? ctrlH : 0);
    const scale  = Math.min(availW / 540, availH / 960);

    wrapper.style.transform       = `translate(-50%, -50%) scale(${scale})`;
    wrapper.style.transformOrigin = 'center center';
    
    // Calculate the top offset for absolute positioning to avoid overlap with controls if needed
    // However, since it's centered, we just leave it.

    const realW = Math.min(540 * scale, availW);
    if (controls) controls.style.maxWidth = `${realW}px`;
  }
}
