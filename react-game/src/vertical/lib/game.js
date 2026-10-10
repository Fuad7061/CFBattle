import { COUNTRIES, getFlagUrl } from "./countries.js";
import { getRegion, REGION_ORDER, REGION_META } from "../../data/regions.js";
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

    /* ---- Arena parameters (perfect vertical balance) ---- */
    this.CX = 270;   // center X
    this.CY = 490;   // center Y (lowered so the ring clears the Top 5 tracker)
    this.AR = 205;   // arena radius

    /* ---- Subsystems ------------------------------------- */
    this.physics  = new PhysicsEngine(this.CX, this.CY, this.AR);
    this.renderer = new Renderer(this.canvas);
    this.ui       = new UIManager();
    this.audio    = new AudioManager();
    this.recorder = new Recorder(this.canvas);

    this.updateCanvasSize();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.updateCanvasSize());
    }

    /* ---- Game state ------------------------------------- */
    this.running    = false;   // physics loop active
    this.paused     = false;   // game paused
    this.images     = {};      // code → HTMLImageElement
    this.flags      = [];      // { body, country, eliminated }
    this.aliveCount = 0;
    this.totalCount = 0;
    this.roundNum   = 1;
    this.qualifiedList = [];

    /* ---- Campaign / Team Up state ----------------------- */
    this.campaignNum     = 1;             // which campaign (season) we're on
    this.phase           = 'qualifier';   // 'qualifier' | 'final'
    this.finalists       = [];            // top-4 country objects for the final
    this.teams           = null;          // [{id,name,color,emoji,codes:Set}]
    this.teamStats       = null;          // [{id,name,color,alive,total}]
    this._teamSig        = null;          // signature to throttle team DOM updates
    this._roundEnding    = false;
    this._lastTeamUpdate = 0;             // throttle team leaderboard DOM writes
    this._epoch          = 0;             // bumped on every reset to cancel stale timers

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

    /* ---- Comment shoutout voice queue ------------------- */
    this._shoutoutQueue        = [];
    this._shoutoutBusy         = false;
    this._shoutoutCooldownUntil = 0;
    this._shoutoutTimer        = null;

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
    const imagesReady = this._loadImages();

    // 9. Initialize YouTube Chat SSE
    this._initYoutubeChat();

    // 10. OBS / recorder / dashboard-preview loads hide the control bar, so
    // nobody can ever press START. Kick the first round off automatically once
    // the flag art is in, otherwise those views sit on "READY" forever.
    this._autoStartIfStream(imagesReady);
  }

  /* Start the opening round without user input when the controls are hidden.
     Landscape already auto-starts; this keeps vertical parity for stream URLs
     (?stream / ?headless / ?clean) while leaving the manual START button for
     normal interactive use. */
  _autoStartIfStream(imagesReady) {
    let isStream = false;
    try {
      const params = new URLSearchParams(window.location.search);
      isStream =
        params.get('stream') === 'true' ||
        params.get('headless') === 'true' ||
        params.get('clean') === 'true';
    } catch (e) {
      return;
    }
    if (!isStream) return;
    // Don't stomp a round the dashboard already started via /api/control.
    const kick = () => {
      if (this.running || this.flags.length) return;
      this.start();
    };
    const fallback = setTimeout(kick, 300);
    Promise.resolve(imagesReady)
      .then(kick)
      .catch(() => {})
      .finally(() => clearTimeout(fallback));
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
        // Process chat powers/votes whenever the game is not paused — even
        // during the short between-round transitions — so revives and saves
        // are never silently dropped.
        if (!this.paused && this.flags && this.flags.length) {
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

  // Country codes arrive lowercase from the chat parser ("us") but the roster
  // stores them uppercase ("US"), so look them up case-insensitively.
  _findFlag(code) {
    if (!code) return null;
    const c = String(code).toUpperCase();
    return this.flags.find(f => (f.country.code || '').toUpperCase() === c) || null;
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
    const flag = this._findFlag(code);
    const alive = flag && !flag.eliminated;

    try { this.ui.recordSupporterVote(author, paid ? 5 : 3, code); } catch (e) {}

    if (this.audio && this.audio.playPowerSFX) {
      this.audio.playPowerSFX(p);
    }
    if (flag && flag.body && this.renderer) {
      if (this.renderer.addChatFloater) {
        this.renderer.addChatFloater(flag, author, p.toUpperCase() + '!', '#ffd700');
      }
      if (this.renderer.addShockwave) {
        this.renderer.addShockwave(flag.body.position.x, flag.body.position.y, '#ffd700');
      }
    }

    switch (p) {
      case 'revive': {
        if (flag && flag.eliminated) {
          flag.eliminated = false;
          const ang = Math.random() * Math.PI * 2;
          const rad = 25 + Math.random() * 35;
          this.physics.reviveFlag(flag.body, this.CX + Math.cos(ang) * rad, this.CY + Math.sin(ang) * rad);
          flag.reviveEffectEnd = Date.now() + 3500;
          this.aliveCount = this.flags.filter(f => !f.eliminated).length;
          this.standings = this.standings.filter(c => c.code !== flag.country.code);
          if (this.ui.reviveFlag) this.ui.reviveFlag(code);
          if (this.ui.reviveTop5Card) this.ui.reviveTop5Card(code);
          if (this.ui.updateCounter) this.ui.updateCounter(this.aliveCount, this.totalCount);
          if (this.ui.hideReviveProgress) this.ui.hideReviveProgress(code);
          if (this.audio.playDramaticHit) this.audio.playDramaticHit();
          if (this.ui.showReviveToast && flag.country) {
            this.ui.showReviveToast(flag.country, getFlagUrl(code, 80), author);
          }
          if (this.ui.showPowerToast) this.ui.showPowerToast('⚡ REVIVE', flag.country, getFlagUrl(code, 40), author);
          this._queueShoutout(author, flag.country?.name || code, 'revived');
        }
        break;
      }
      case 'shield': {
        if (alive) {
          flag.body.immunityUntil = Date.now() + dur(6000);
          if (this.ui.showPowerToast) this.ui.showPowerToast('🛡️ SHIELD', flag.country, getFlagUrl(code, 40), author);
          this._queueShoutout(author, flag.country?.name || code, 'shielded');
        }
        break;
      }
      case 'freeze': {
        if (alive) {
          flag.body.frozenUntil = Date.now() + dur(4500);
          Matter.Body.setVelocity(flag.body, { x: 0, y: 0 });
          Matter.Body.setAngularVelocity(flag.body, 0);
          if (this.ui.showPowerToast) this.ui.showPowerToast('❄️ FREEZE', flag.country, getFlagUrl(code, 40), author);
          this._queueShoutout(author, flag.country?.name || code, 'froze');
        }
        break;
      }
      case 'slow': {
        if (code && flag && !flag.eliminated) {
          // Targeted: "slow US" slows down just that country's flag.
          flag.body.slowUntil = Date.now() + dur(5000);
          if (this.ui.showPowerToast) this.ui.showPowerToast('🐌 SLOWED', flag.country, getFlagUrl(code, 40), author);
          this._queueShoutout(author, flag.country?.name || code, 'slowed');
        } else {
          // Global full-arena slow-motion.
          this.physics.setTimeScale(0.45);
          clearTimeout(this._slowTimer);
          this._slowTimer = setTimeout(() => this.physics.resetTimeScale(), dur(5000));
          if (this.ui.showGlobalPowerToast) this.ui.showGlobalPowerToast('🐌 SLOW MOTION', author);
          this._queueShoutout(author, 'the whole arena', 'slowed');
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
        this._queueShoutout(author, 'the whole arena', 'shook');
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
          flag.chatBoostEnd = Date.now() + dur(2500);
          if (this.ui.showPowerToast) this.ui.showPowerToast('🚀 BOOST', flag.country, getFlagUrl(code, 40), author);
          this._queueShoutout(author, flag.country?.name || code, 'boosted');
        }
        break;
      }
      case 'nuke': {
        if (alive) {
          this._forceEliminate(flag, author);
          if (this.ui.showGlobalPowerToast) this.ui.showGlobalPowerToast('☢️ NUKE!', author);
          this._queueShoutout(author, flag.country?.name || code, 'nuked');
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
    try { this.ui.recordSupporterVote(author, vote.weight || 1, vote.code); } catch (e) {}
    const code = vote.code;
    const flag = this._findFlag(code);
    if (!flag) return;

    if (this.audio && this.audio.playVoteChime) {
      this.audio.playVoteChime();
    }
    if (flag.body && this.renderer) {
      if (this.renderer.addChatFloater) {
        this.renderer.addChatFloater(flag, author, '+1 ' + (flag.country?.code || '').toUpperCase(), '#4ade80');
      }
      if (this.renderer.addShockwave) {
        this.renderer.addShockwave(flag.body.position.x, flag.body.position.y, 'rgba(74, 222, 128, 0.7)');
      }
    }

    if (flag.eliminated) {
      if (!this.reviveVotes) this.reviveVotes = {};
      this.reviveVotes[code] = (this.reviveVotes[code] || 0) + (vote.weight || 1);
      
      const targetVotes = this.cfg?.reviveVotes || (typeof window !== 'undefined' && window.__liveSettings?.reviveVotes ? window.__liveSettings.reviveVotes : 4);
      // Any Super Chat that names an eliminated country revives it instantly;
      // regular comments need to reach the vote threshold (default 4).
      const isSuper = Boolean(vote.superChat);

      if (isSuper || this.reviveVotes[code] >= targetVotes) {
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
        this.standings = this.standings.filter(c => c.code !== flag.country.code);

        if (this.ui.showReviveToast) {
           this.ui.showReviveToast(flag.country, getFlagUrl(code, 80), vote.author || 'CHAT');
        }
        
        if (this.audio.playDramaticHit) this.audio.playDramaticHit();
        if (this.ui.reviveFlag) this.ui.reviveFlag(code);
        if (this.ui.reviveTop5Card) this.ui.reviveTop5Card(code);
        if (this.ui.updateCounter) this.ui.updateCounter(this.aliveCount, this.totalCount);
        if (this.ui.hideReviveProgress) this.ui.hideReviveProgress(code);
        this._queueShoutout(vote.author || author || 'CHAT', flag.country?.name || code, 'revived');
      } else {
        if (this.ui.showReviveProgress) {
           this.ui.showReviveProgress(flag.country, getFlagUrl(code, 80), this.reviveVotes[code], targetVotes);
        }
        if (this.renderer && this.renderer.addChatFloater) {
          const rx = this.CX + (Math.random() * 40 - 20);
          const ry = this.CY + (Math.random() * 40 - 20);
          this.renderer.addChatFloater(rx, ry, author, `REVIVE ${this.reviveVotes[code]}/${targetVotes}`, '#38bdf8');
        }
        if (this.renderer && this.renderer.addShockwave) {
          this.renderer.addShockwave(this.CX, this.CY, 'rgba(56, 189, 248, 0.7)');
        }
      }
      return;
    }

    // A plain country-name comment (or "!vote X") is a powerful RESCUE move:
    // steer the flag immediately toward the safe center of the arena, saving it
    // from outer boundary pocket elimination!
    const body = flag.body;
    const weight = vote.weight || 1;
    const dx = this.CX - body.position.x;
    const dy = this.CY - body.position.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const rescueSpeed = 5.5 + Math.min(weight, 30) * 0.15;
    Matter.Body.setVelocity(body, { x: (dx / d) * rescueSpeed, y: (dy / d) * rescueSpeed });

    if (this.renderer && this.renderer.addBurst) {
      this.renderer.addBurst(body.position.x, body.position.y, '#66ff99');
    }

    if (this.ui.showSaveToast) {
      this.ui.showSaveToast(flag.country, getFlagUrl(code, 80), author);
    } else if (this.ui.showChatBoostToast) {
      this.ui.showChatBoostToast(flag.country, getFlagUrl(code, 80));
    }
    this._queueShoutout(author, flag.country?.name || code, 'saved');
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
      img.onload = () => {
        try {
          const sw = 256;
          const sh = 160;
          const off = document.createElement('canvas');
          off.width = sw;
          off.height = sh;
          const octx = off.getContext('2d');
          octx.imageSmoothingEnabled = true;
          try { octx.imageSmoothingQuality = 'high'; } catch (e) {}
          const srcW = img.naturalWidth || img.width || 640;
          const srcH = img.naturalHeight || img.height || 480;
          const scale = Math.min(sw / srcW, sh / srcH);
          const dw = srcW * scale;
          const dh = srcH * scale;
          octx.drawImage(img, (sw - dw) / 2, (sh - dh) / 2, dw, dh);
          this.images[code] = off;
        } catch (e) {
          this.images[code] = img;
        }
        loaded++;
        if (loaded % BATCH === 0 || loaded === codes.length) {
          this.ui.updateLoading(`Loading flags… ${loaded}/${codes.length}`);
        }
        resolve();
      };
      img.onerror = () => {
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

  updateCanvasSize() {
    if (!this.canvas) return;
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const winW = typeof window !== 'undefined' ? window.innerWidth : 540;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 960;
    const scale = Math.min(winW / 540, winH / 960);
    // Guarantee minimum 1080x1920 (2x of 540x960) for crystal clear Super HD visuals
    const effectiveScale = Math.max(2, (scale || 1) * dpr);
    const targetW = Math.round(540 * effectiveScale);
    const targetH = Math.round(960 * effectiveScale);

    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
      if (this.renderer) {
        this.renderer.updateScale(targetW / 540, targetH / 960);
      }
    }
  }

  // --- Exposed API Methods for Dashboard ---
  start() {
    const btn = document.getElementById('btn-start');
    if (btn && btn.disabled) return;
    this.roundNum = 1;
    this._cleanRound();
    this._beginQualifier();
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

  /* Restart the tournament from scratch (fresh campaign 1, qualifying round).
     Used by the dashboard "Reset Tournament" button and /api/control. */
  newRound() {
    this._cleanRound();
    this.roundNum      = 1;
    this.qualifiedList = [];
    this.campaignNum   = 1;
    this.phase         = 'qualifier';
    this.finalists     = [];
    this.teams         = null;
    this.teamStats     = null;
    this._teamSig      = null;
    this.ui.clearQualified();
    if (this.ui.updateTeams) this.ui.updateTeams(null);
    this._beginQualifier();
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
  /*  TEAM UP MODE                                                      */
  /* ================================================================== */

  /* Assign every country to a team based on the dashboard "Team Up Mode". */
  _setupTeams(countries) {
    const mode = this._readSetting('teams', this.cfg.teams || 'none');
    this.cfg.teams = mode;

    if (!mode || mode === 'none') {
      this.teams = null;
      this.teamStats = null;
      this._teamSig = null;
      if (this.ui.updateTeams) this.ui.updateTeams(null);
      return;
    }

    if (mode === '2' || mode === '4') {
      const n = mode === '2' ? 2 : 4;
      const palette = [
        { name: 'Red',   color: '#ff4d4d' },
        { name: 'Blue',  color: '#4d8dff' },
        { name: 'Green', color: '#2ecc71' },
        { name: 'Gold',  color: '#f5c518' },
      ];
      // Use the stable global index so a country keeps its team across rounds.
      if (!this._codeIndex) {
        this._codeIndex = {};
        COUNTRIES.forEach((c, i) => { this._codeIndex[String(c.code).toUpperCase()] = i; });
      }
      this.teams = palette.slice(0, n).map((p, i) => ({
        id: 't' + i, name: p.name, color: p.color, emoji: '', codes: new Set(),
      }));
      countries.forEach((c, i) => {
        const ci = this._codeIndex[String(c.code).toUpperCase()];
        this.teams[(ci === undefined ? i : ci) % n].codes.add(String(c.code).toUpperCase());
      });
    } else {
      // "continents" (or any unknown non-off value): one team per region.
      this.teams = REGION_ORDER
        .filter(r => r !== 'Other')
        .map(r => ({
          id: r.toLowerCase(),
          name: REGION_META[r].label,
          color: REGION_META[r].color,
          emoji: REGION_META[r].emoji,
          codes: new Set(),
        }));
      for (const c of countries) {
        const r = getRegion(c.code);
        const t = this.teams.find(x => x.name === REGION_META[r]?.label);
        if (t) t.codes.add(String(c.code).toUpperCase());
      }
    }
    this.teams = this.teams.filter(t => t.codes.size > 0);
    this._teamSig = null;
    this._updateTeamsIfChanged(true);
  }

  _readSetting(key, fallback) {
    const ls = (typeof window !== 'undefined' && window.__liveSettings) || {};
    const v = ls[key];
    return (v === undefined || v === null || v === '') ? fallback : v;
  }

  _teamOfFlag(flagOrCountry) {
    if (!this.teams || !flagOrCountry) return null;
    const code = String(flagOrCountry.code || flagOrCountry).toUpperCase();
    return this.teams.find(t => t.codes.has(code)) || null;
  }

  _updateTeamsIfChanged(force = false) {
    if (!this.teams) return;
    // Throttle: physics can call this several times per frame; the leaderboard
    // only needs a few updates per second.
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (!force && now - this._lastTeamUpdate < 120) return;
    this._lastTeamUpdate = now;
    const alive = new Set(
      this.flags.filter(f => !f.eliminated).map(f => String(f.country.code).toUpperCase())
    );
    const stats = this.teams.map(t => {
      let a = 0;
      for (const code of t.codes) if (alive.has(code)) a++;
      return { id: t.id, name: t.name, color: t.color, emoji: t.emoji, alive: a, total: t.codes.size };
    });
    const sig = stats.map(s => s.alive).join(',');
    this.teamStats = stats;
    if (force || sig !== this._teamSig) {
      this._teamSig = sig;
      if (this.ui.updateTeams) this.ui.updateTeams(stats);
    }
  }

  /* True when the current Team Up Mode uses teams + a grand final. */
  _isTeamCampaign() {
    const m = this.cfg.teams;
    return m === '2' || m === '4' || m === 'continents';
  }

  /* A fresh qualifying round with the full (or configured) country pool. */
  async _beginQualifier() {
    this.phase = 'qualifier';
    this.finalists = [];
    let pool = this._shuffled(COUNTRIES);
    const numToSpawn = parseInt(this._readSetting('totalCountries', 195)) || 195;
    pool = pool.slice(0, Math.min(numToSpawn, pool.length));
    await this._startRound(pool, { slowMo: false, countdown: true });
  }

  /* The Grand Final: the top 4 flags battle in slow motion. */
  async _beginFinal() {
    this.phase = 'final';
    await this._startRound(this.finalists.slice(0, 4), { slowMo: true, countdown: false });
  }

  /* Called the moment only one flag remains in the current round. */
  _handleRoundEnd() {
    if (this._roundEnding) return;
    this._roundEnding = true;
    this.running = false;
    this.physics.setTimeScale(1.0);
    this.audio.stopHeartbeat();
    this.ui.stopTimer();
    this.audio.pauseBgMusic();
    if (document.getElementById('btn-pause')) document.getElementById('btn-pause').disabled = true;

    const winnerFlag = this.flags.find(f => !f.eliminated);
    if (!winnerFlag) return;
    const winner = winnerFlag.country;
    const team = this._teamOfFlag(winner);

    if (this.phase === 'final') {
      this._crownChampion(winner, team);
      return;
    }

    if (this._isTeamCampaign()) {
      // Team mode: top 4 = winner + last three eliminated (2nd, 3rd, 4th).
      this.finalists = [winner, ...this.standings.slice().reverse()].slice(0, 4);
      this._showFinalists(this.finalists);
      const epoch = this._epoch;
      setTimeout(() => {
        if (this._abortCountdown || epoch !== this._epoch) return;
        this._cleanRound();
        this._beginFinal();
      }, 5000);
    } else {
      // Solo mode: the round winner is the campaign champion.
      this._crownChampion(winner, team);
    }
  }

  /* Brief on-stream reveal of the four grand-finalists. */
  _showFinalists(top4) {
    this._updateTeamsIfChanged(true);
    if (this.ui.setRoundHeader) this.ui.setRoundHeader('GRAND FINAL', 'TOP 4 \u00b7 SLOW MOTION');
    // Show the four finalists one per line (centred) so long country names
    // never get clipped by the single-line milestone banner.
    if (this.ui.showFinalLineup) this.ui.showFinalLineup(top4);
    this._speakNatural(`The Grand Final is set! ${top4.length} flags battle in slow motion for the crown!`);
  }


  /*  ROUND LIFECYCLE                                                   */
  /* ================================================================== */

  async _startRound(countries, { slowMo = false, countdown = true } = {}) {
    const epoch = this._epoch;
    this._abortCountdown = false;
    this._roundEnding = false;
    const startBtn = document.getElementById('btn-start');
    if (startBtn) startBtn.disabled = true;

    // Intro countdown (qualifier only — the final begins instantly in slow-mo)
    if (countdown && this.cfg.countdownSecs > 0) {
      await this._runCountdown(this.cfg.countdownSecs, epoch);
    }

    if (startBtn) startBtn.disabled = false;
    // A reset/clean happened while we were counting down → abandon this round.
    if (this._abortCountdown || epoch !== this._epoch) return;

    countries = countries || [];
    this.totalCount = countries.length;
    this.aliveCount = countries.length;

    // Reset suspense milestones
    this._top5Triggered = false;
    this._top3Triggered = false;
    this._top2Triggered = false;
    this._ctaAudioTriggered = false;
    this._boostTimer    = 0;
    this._nextBoostMs   = 8000 + Math.random() * 5000;
    this.physics.setTimeScale(slowMo ? 0.45 : 1.0);
    this.audio.stopHeartbeat();
    this.ui.hideTop5Finalists();

    // Fermat spiral ping-pong spawn
    this.flags = [];
    this.standings = [];
    this.reviveVotes = {};
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
      const body  = this.physics.spawnFlag(this.CX + (x - this.CX)*0.5, this.CY + (y - this.CY)*0.5, 28, 18, country);
      this.flags.push({ body, country, eliminated: false });
    });

    // UI Updates
    this._setupTeams(countries);
    const roundText = this.phase === 'final'
      ? `CAMPAIGN ${this.campaignNum} \u00b7 GRAND FINAL`
      : `CAMPAIGN ${this.campaignNum} \u00b7 QUALIFIER`;
    const phaseText = this.phase === 'final'
      ? 'SLOW-MOTION FINAL'
      : (this._isTeamCampaign() ? 'QUALIFY TOP 4' : 'LAST FLAG STANDING');
    if (this.ui.setRoundHeader) {
      this.ui.setRoundHeader(roundText, phaseText);
    } else {
      this.ui.setRound(this.roundNum);
      this.ui.setPhase(phaseText);
    }
    this.ui.buildRoster(countries);
    this.ui.updateCounter(this.aliveCount, this.totalCount);
    this.ui.hideWinner();
    this.ui.startTimer();
    this._teamSig = null;
    this._updateTeamsIfChanged(true);

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

    // Comment shoutout voice queue reset
    clearTimeout(this._shoutoutTimer);
    clearTimeout(this._shoutoutFallback);
    this._shoutoutQueue         = [];
    this._shoutoutBusy          = false;
    this._shoutoutCooldownUntil = 0;
    this.ui.startSupporters();
    this.ui.startEngagementCTA();
  }

  _cleanRound() {
    this._epoch++;          // cancel any pending round/final/winner timers
    this._roundEnding = true;
    this.running = false;
    this.paused  = false;
    this.flags   = [];
    this.standings = [];
    this.physics.reset();
    this.renderer.clearFallingFlags();
    if (this.renderer.clearEffects) this.renderer.clearEffects();
    this.audio.stopHeartbeat();
    this.ui.hideCountdown();
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
    this.campaignNum   = 1;
    this.phase         = 'qualifier';
    this.finalists     = [];
    this.teams         = null;
    this.teamStats     = null;
    this._teamSig      = null;
    this.ui.clearQualified();
    this.ui.setRound(1);
    this.ui.setPhase('READY');
    this.ui.updateCounter(0, 0);
    this.ui.buildRoster(COUNTRIES);
    this.ui.resetRoster();
    this.ui.resetSupporters();
    this.ui.stopEngagementCTA();
    if (this.ui.updateTeams) this.ui.updateTeams(null);
    this.audio.pauseBgMusic();
    if (document.getElementById('btn-start')) document.getElementById('btn-start').textContent = '▶ START';
    if (document.getElementById('btn-pause')) document.getElementById('btn-pause').disabled = true;
    if (document.getElementById('btn-pause')) document.getElementById('btn-pause').textContent = '⏸ PAUSE';
  }

  async _runCountdown(secs, epoch = this._epoch) {
    for (let i = secs; i >= 0; i--) {
      if (this._abortCountdown || epoch !== this._epoch) break;
      this.ui.showCountdown(i);
      this.ui.updateCountdown(i);
      this.audio.playTick(i === 0);
      await new Promise(r => setTimeout(r, 1000));
    }
    // Only clear the overlay if no newer round has taken over the countdown.
    if (epoch === this._epoch) this.ui.hideCountdown();
  }

  /* ================================================================== */
  /*  WINNER HANDLING                                                   */
  /* ================================================================== */

  /* Crown the campaign champion, celebrate, then loop a fresh campaign. */
  _crownChampion(c, team) {
    this.qualifiedList.push(c);

    // Defending champion & streak tracking
    if (!this._streakCount) this._streakCount = 0;
    if (this._defendingChampion && this._defendingChampion.code === c.code) {
      this._streakCount++;
    } else {
      this._defendingChampion = c;
      this._streakCount = 1;
    }
    if (this.ui && this.ui.setChampionInfo) {
      this.ui.setChampionInfo(c, this._streakCount);
    }

    // Get 2nd and 3rd place (last ones eliminated)
    const second = this.standings.length > 0 ? this.standings[this.standings.length - 1] : null;
    const third = this.standings.length > 1 ? this.standings[this.standings.length - 2] : null;

    // Record the champion, then update team standings
    this._updateTeamsIfChanged(true);

    this.ui.showWinner(
      c, getFlagUrl(c.code, 160),
      second, second ? getFlagUrl(second.code, 80) : null,
      third, third ? getFlagUrl(third.code, 80) : null
    );
    const wTitle = document.getElementById('winner-title');
    if (wTitle) wTitle.textContent = `CAMPAIGN ${this.campaignNum} CHAMPION`;
    const wTeam = document.getElementById('winner-team');
    if (wTeam) wTeam.textContent = team ? `${team.emoji ? team.emoji + ' ' : ''}${team.name} team wins the campaign` : '';
    this.ui.addWinner(c, getFlagUrl(c.code, 40), this.campaignNum);
    this.ui.setPhase('CHAMPION');

    this.audio.playWinnerFanfare();

    // Voice: Winner + engagement CTA
    this._speakNatural(`The champion is ${c.name}!${team ? ' Team ' + team.name + ' wins the campaign!' : ''} Incredible battle!`);
    setTimeout(() => {
      this._speakNatural('Like and subscribe for more epic battles! A brand new tournament begins now!');
    }, 3500);

    // Burst particles at winner position
    const wf = this.flags.find(f => !f.eliminated);
    if (wf && wf.body) {
      this.renderer.addBurst(wf.body.position.x, wf.body.position.y, '#ffcc00');
    }

    // Full match complete: loop from the beginning with a brand new campaign
    const epoch = this._epoch;
    setTimeout(() => {
      if (this._abortCountdown || epoch !== this._epoch) return;
      this.campaignNum++;
      this.roundNum = 1;
      this._cleanRound();
      this._beginQualifier();
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
        // Natural 60 FPS frame normalization: prevent micro-stutters from fractional OS scheduler drift
        if (dt >= 13 && dt <= 19 && accum < FIXED_STEP_MS) {
          this._physicsStep(FIXED_STEP_MS);
          accum = 0;
        } else {
          accum += dt;
          let steps = 0;
          const maxSteps = 3;
          while (accum >= FIXED_STEP_MS && steps < maxSteps) {
            this._physicsStep(FIXED_STEP_MS);
            accum -= FIXED_STEP_MS;
            steps++;
          }
          if (accum > FIXED_STEP_MS * 2) {
            accum = 0; // prevent spiral of death
          }
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
      if (this.audio && this.audio.setMusicIntensity) {
        this.audio.setMusicIntensity(this.aliveCount);
      }

      if (this.aliveCount <= 8 && !this._ctaAudioTriggered) {
        this._ctaAudioTriggered = true;
        this._speakNatural('Comment your country to save your flag!');
      }

      // Late-round drama: top 5 tracker, top 3 slow-motion, 1v1 sudden death
      if (this.aliveCount === 5 && !this._top5Triggered) {
        this._top5Triggered = true;
        this.audio.playDramaticHit();
        this.ui.showSuspense('🔥 TOP 5 SURVIVORS!');
        const top5 = this.flags.filter(x => !x.eliminated).map(x => x.country);
        this.ui.showTop5Finalists(top5);
      }

      if (this.aliveCount === 3 && !this._top3Triggered) {
        this._top3Triggered = true;
        this.audio.playDramaticHit();
        this.audio.startHeartbeat(false);
        this.physics.setTimeScale(0.45); // Dramatic 0.45x slow-motion
        this.ui.showSuspense('⚡ FINAL 3 — WHO WILL TAKE THE CROWN?!');
      }

      if (this.aliveCount === 2 && !this._top2Triggered) {
        this._top2Triggered = true;
        this.audio.playDramaticHit();
        if (this.audio.playShowdownAlarm) this.audio.playShowdownAlarm();
        this.audio.startHeartbeat(true); // Fast heartbeat
        this.ui.showSuspense('🔥 1V1 SUDDEN DEATH SHOWDOWN!');
      }

      // One flag left → qualifier finished, grand final, or campaign champion.
      if (!this._roundEnding && this.aliveCount <= 1) {
        this._handleRoundEnd();
        break;
      }
    }

    // Team Up Mode leaderboard (only touches the DOM when counts change)
    this._updateTeamsIfChanged();
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

  _speakNatural(text, onEnd) {
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
      u.lang  = 'en-US';
      u.rate  = 0.95;
      u.pitch = 1.05;
      const voices = window.speechSynthesis.getVoices();
      if (this.audio?.voiceIndex != null && voices[this.audio.voiceIndex]) {
        u.voice = voices[this.audio.voiceIndex];
      }
      u.onend = u.onerror = () => { if (onEnd) onEnd(); };
      window.speechSynthesis.speak(u);
    } catch (e) {
      if (onEnd) onEnd();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  COMMENT SHOUTOUTS — voice thanks for anyone who gives power by     */
  /*  commenting or Super Chat, to keep viewers engaged.                 */
  /* ------------------------------------------------------------------ */

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
    // Ignore repeats while queued OR recently spoken (a drained item leaves the
    // queue, so the recent-key guard stops the same commenter re-joining).
    if (this._shoutoutQueue.some(s => s.key === key)) return;
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
    this._lastShoutoutAt  = Date.now();
    const lead = ['Shoutout to', 'Big thanks to', 'Power from', 'Respect to'][Math.floor(Math.random() * 4)];
    const line = `${lead} ${s.name}! You ${s.verb} ${s.target}!`;

    this._shoutoutBusy = true;
    const finish = () => {
      if (!this._shoutoutBusy) return;
      this._shoutoutBusy = false;
      this._shoutoutCooldownUntil = Date.now() + 1500; // small gap between shoutouts
      this._drainShoutouts();
    };
    this._speakNatural(line, finish);
    // Fallback in case `onend` never fires (e.g. cancelled by a priority line).
    clearTimeout(this._shoutoutFallback);
    this._shoutoutFallback = setTimeout(() => {
      if (this._shoutoutBusy) { this._shoutoutBusy = false; this._shoutoutCooldownUntil = Date.now() + 1200; this._drainShoutouts(); }
    }, Math.max(3200, line.length * 90));
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
      `${randomCountry || 'Your country'} is still alive! Comment your country to save it!`,
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
