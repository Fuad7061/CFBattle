/**
 * AudioManager — TTS (Browser + Google Cloud TTS), SFX, Background Music & Suspense Heartbeat
 */
export class AudioManager {
  constructor() {
    this.provider     = 'browser';   // 'browser' | 'google'
    this.googleApiKey = '';

    // Browser TTS settings
    this.voiceIndex   = 0;
    this.speechRate   = 0.88;
    this.speechPitch  = 1.05;

    // Flags
    this.sfxEnabled   = true;
    this.sfxVolume    = 0.5;
    this.musicEnabled = true;
    this._muted       = false;

    // Background music
    this.bgAudio  = null;
    this.bgVolume = 0.35;

    // Web Audio context for SFX
    this._actx = null;

    // Suspense heartbeat interval
    this._heartbeatInterval = null;

    // Populate voices
    this._voices = [];
    if (window.speechSynthesis) {
      const load = () => { this._voices = speechSynthesis.getVoices(); };
      speechSynthesis.addEventListener('voiceschanged', load);
      load();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  TTS — winner announcement                                          */
  /* ------------------------------------------------------------------ */

  async announceWinner(countryName) {
    if (this._muted) return;
    const text = `${countryName} wins!`;
    if (this.provider === 'google' && this.googleApiKey) {
      await this._googleTTS(text).catch(() => this._browserTTS(text));
    } else {
      this._browserTTS(text);
    }
  }

  _browserTTS(text) {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u    = new SpeechSynthesisUtterance(text);
    u.rate   = this.speechRate;
    u.pitch  = this.speechPitch;
    u.volume = this._muted ? 0 : 1;
    if (this._voices.length) u.voice = this._voices[this.voiceIndex] || this._voices[0];
    speechSynthesis.speak(u);
  }

  async _googleTTS(text) {
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${this.googleApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'en-US', ssmlGender: 'NEUTRAL' },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9 },
        }),
      }
    );
    if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
    const { audioContent } = await res.json();
    const audio = new Audio(`data:audio/mp3;base64,${audioContent}`);
    audio.volume = this._muted ? 0 : 1;
    return audio.play();
  }

  /* ------------------------------------------------------------------ */
  /*  SOUND EFFECTS — Web Audio API synthesized (no files needed)      */
  /* ------------------------------------------------------------------ */

  _ctx() {
    if (!this._actx) this._actx = new (window.AudioContext || window.webkitAudioContext)();
    if (this._actx.state === 'suspended') this._actx.resume();
    return this._actx;
  }

  /** Soothing ASMR water bubble pop & wooden bamboo click on flag elimination */
  playElimination() {
    if (!this.sfxEnabled || this._muted) return;
    try {
      const ctx = this._ctx();
      const t = ctx.currentTime;
      // ASMR water bubble pop: warm sine gliding down with gentle acoustic body
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(540, t);
      osc.frequency.exponentialRampToValueAtTime(210, t + 0.08);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.24 * (this.sfxVolume / 0.5), t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

      osc.start(t);
      osc.stop(t + 0.10);

      // Resonant crystal droplet overtone (ASMR tactile "bloop")
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2); gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1080, t);
      osc2.frequency.exponentialRampToValueAtTime(420, t + 0.06);

      gain2.gain.setValueAtTime(0, t);
      gain2.gain.linearRampToValueAtTime(0.12 * (this.sfxVolume / 0.5), t + 0.004);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

      osc2.start(t);
      osc2.stop(t + 0.075);
    } catch (_) {}
  }

  /** Deep soothing Tibetan singing bowl & sub-bass resonance for Top 5 / Top 3 suspense */
  playDramaticHit() {
    if (!this.sfxEnabled || this._muted) return;
    try {
      const ctx = this._ctx();
      const t = ctx.currentTime;

      // 1. Warm sub-bass foundation
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(92, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.7);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.32 * (this.sfxVolume / 0.5), t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      osc.start(t);
      osc.stop(t + 0.72);

      // 2. Meditative singing bowl overtone (warm 3rd harmonic)
      const bowl = ctx.createOscillator();
      const bowlGain = ctx.createGain();
      bowl.connect(bowlGain); bowlGain.connect(ctx.destination);
      bowl.type = 'sine';
      bowl.frequency.setValueAtTime(276, t);
      bowlGain.gain.setValueAtTime(0, t);
      bowlGain.gain.linearRampToValueAtTime(0.16 * (this.sfxVolume / 0.5), t + 0.03);
      bowlGain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      bowl.start(t);
      bowl.stop(t + 0.68);
    } catch (_) {}
  }

  /** Gentle ASMR silk whoosh / aerodynamic breeze for high-audience flags */
  playNearMiss() {
    if (!this.sfxEnabled || this._muted) return;
    try {
      const ctx = this._ctx();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, t);
      osc.frequency.exponentialRampToValueAtTime(260, t + 0.18);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12 * (this.sfxVolume / 0.5), t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.19);
    } catch (_) {}
  }

  /** Hypnotic, calming double-pulse heartbeat (lub-dub) for Top 3 suspense */
  startHeartbeat(fast = false) {
    this.stopHeartbeat();
    if (!this.sfxEnabled || this._muted) return;

    const playLubDub = () => {
      try {
        const ctx = this._ctx();
        const t0  = ctx.currentTime;

        // Lub (First beat) - pure warm sine sub
        const osc1  = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.connect(gain1); gain1.connect(ctx.destination);
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(54, t0);
        osc1.frequency.exponentialRampToValueAtTime(36, t0 + 0.12);
        gain1.gain.setValueAtTime(0, t0);
        gain1.gain.linearRampToValueAtTime(0.24 * (this.sfxVolume / 0.5), t0 + 0.015);
        gain1.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
        osc1.start(t0);
        osc1.stop(t0 + 0.13);

        // Dub (Second beat, slightly higher and warmer)
        const t1    = t0 + 0.15;
        const osc2  = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2); gain2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(64, t1);
        osc2.frequency.exponentialRampToValueAtTime(40, t1 + 0.14);
        gain2.gain.setValueAtTime(0, t1);
        gain2.gain.linearRampToValueAtTime(0.26 * (this.sfxVolume / 0.5), t1 + 0.015);
        gain2.gain.exponentialRampToValueAtTime(0.001, t1 + 0.14);
        osc2.start(t1);
        osc2.stop(t1 + 0.15);
      } catch (_) {}
    };

    playLubDub();
    const intervalMs = fast ? 660 : 880;
    this._heartbeatInterval = setInterval(playLubDub, intervalMs);
  }

  stopHeartbeat() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
  }

  /** Dreamy ASMR celesta / wind-chime arpeggio in Cmaj9 when winner is declared */
  playWinnerFanfare() {
    this.stopHeartbeat();
    if (!this.sfxEnabled || this._muted) return;
    try {
      const ctx = this._ctx();
      // Cmaj9 pentatonic notes: C5, E5, G5, B5, D6, G6
      const notes = [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        const t = ctx.currentTime + i * 0.14;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.22 * (this.sfxVolume / 0.5), t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
        osc.start(t);
        osc.stop(t + 0.70);

        // Soft octave harmonic shimmer
        const shimmer = ctx.createOscillator();
        const sGain = ctx.createGain();
        shimmer.connect(sGain); sGain.connect(ctx.destination);
        shimmer.type = 'sine';
        shimmer.frequency.setValueAtTime(freq * 2, t);
        sGain.gain.setValueAtTime(0, t);
        sGain.gain.linearRampToValueAtTime(0.08 * (this.sfxVolume / 0.5), t + 0.015);
        sGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        shimmer.start(t);
        shimmer.stop(t + 0.50);
      });
    } catch (_) {}
  }

  /** Satisfying ASMR wooden block tick for countdown */
  playTick(high = false) {
    if (!this.sfxEnabled || this._muted) return;
    try {
      const ctx = this._ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(high ? 1174.66 : 783.99, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15 * (this.sfxVolume / 0.5), ctx.currentTime + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.06);
    } catch (_) {}
  }

  /** Soothing ASMR crystal water drop chime when a chat vote / boost lands */
  playVoteChime() {
    if (!this.sfxEnabled || this._muted) return;
    try {
      const ctx = this._ctx();
      const t = ctx.currentTime;
      // Dual crystal tones (E6 + B6 harmonic)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1318.51, t); // E6
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18 * (this.sfxVolume / 0.5), t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.start(t);
      osc.stop(t + 0.17);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2); gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1975.53, t); // B6
      gain2.gain.setValueAtTime(0, t);
      gain2.gain.linearRampToValueAtTime(0.09 * (this.sfxVolume / 0.5), t + 0.006);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc2.start(t);
      osc2.stop(t + 0.13);
    } catch (_) {}
  }

  /** Soothing ASMR sound effects for powers (shield, freeze, boost, quake, nuke) */
  playPowerSFX(powerName) {
    if (!this.sfxEnabled || this._muted) return;
    try {
      const ctx = this._ctx();
      const p = String(powerName || '').toLowerCase();
      const t = ctx.currentTime;

      if (p === 'freeze') {
        // Crystalline ice sparkle cascade
        [1480, 1760, 2093, 2637].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t + idx * 0.035);
          gain.gain.setValueAtTime(0, t + idx * 0.035);
          gain.gain.linearRampToValueAtTime(0.14 * (this.sfxVolume / 0.5), t + idx * 0.035 + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.035 + 0.22);
          osc.start(t + idx * 0.035);
          osc.stop(t + idx * 0.035 + 0.24);
        });
      } else if (p === 'shield') {
        // Resonant Tibetan bowl chime (528Hz Solfeggio frequency + 1056Hz harmonic)
        [528, 1056].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime((0.18 / (idx + 1)) * (this.sfxVolume / 0.5), t + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
          osc.start(t); osc.stop(t + 0.58);
        });
      } else if (p === 'boost') {
        // Celestial harp glissando in pentatonic harmony
        const harpTones = [392.00, 523.25, 659.25, 783.99, 1046.50];
        harpTones.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t + idx * 0.04);
          gain.gain.setValueAtTime(0, t + idx * 0.04);
          gain.gain.linearRampToValueAtTime(0.16 * (this.sfxVolume / 0.5), t + idx * 0.04 + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.04 + 0.35);
          osc.start(t + idx * 0.04);
          osc.stop(t + idx * 0.04 + 0.38);
        });
      } else if (p === 'quake') {
        // Deep soothing singing bowl hum
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, t);
        osc.frequency.linearRampToValueAtTime(32, t + 0.6);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.32 * (this.sfxVolume / 0.5), t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
        osc.start(t); osc.stop(t + 0.68);
      } else if (p === 'nuke') {
        this.playDramaticHit();
      }
    } catch (_) {}
  }

  /** Meditative Tibetan gong pulse for 1v1 Sudden Death showdown */
  playShowdownAlarm() {
    if (!this.sfxEnabled || this._muted) return;
    try {
      const ctx = this._ctx();
      const t = ctx.currentTime;
      // Resonant singing bowl pulse in harmony (130Hz, 195Hz, 260Hz)
      [130.81, 196.00, 261.63].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.12);
        gain.gain.setValueAtTime(0, t + idx * 0.12);
        gain.gain.linearRampToValueAtTime((0.22 / (idx + 1)) * (this.sfxVolume / 0.5), t + idx * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.12 + 0.85);
        osc.start(t + idx * 0.12);
        osc.stop(t + idx * 0.12 + 0.90);
      });
    } catch (_) {}
  }

  /* ------------------------------------------------------------------ */
  /*  BACKGROUND MUSIC                                                   */
  /* ------------------------------------------------------------------ */

  loadBgMusic(src) {
    if (this.bgAudio) { this.bgAudio.pause(); this.bgAudio = null; }
    if (!src) return;
    this.bgAudio        = new Audio(src);
    this.bgAudio.loop   = true;
    this.bgAudio.volume = this._muted ? 0 : this.bgVolume;
  }

  playBgMusic() {
    if (this.bgAudio && this.musicEnabled && !this._muted) {
      this.bgAudio.play().catch(() => {});
    } else if (!this.bgAudio && this.musicEnabled && !this._muted) {
      this._startProceduralBg();
    }
  }

  pauseBgMusic() {
    if (this.bgAudio) this.bgAudio.pause();
    this._stopProceduralBg();
  }

  setMusicIntensity(stageOrCount) {
    if (typeof stageOrCount === 'number') {
      if (stageOrCount <= 2) this._musicStage = 'showdown';
      else if (stageOrCount <= 5) this._musicStage = 'top5';
      else this._musicStage = 'normal';
    } else if (typeof stageOrCount === 'string') {
      this._musicStage = stageOrCount;
    }
  }

  /**
   * 84-BPM Chill ASMR Lofi & Ambient Beat
   * Pure soothing sine sub-bass, velvet acoustic rimshots, soft felt kicks,
   * gentle organic shakers, and dreamy pentatonic kalimba/celesta melodies.
   */
  _startProceduralBg() {
    if (this._proceduralActive) return;
    try {
      const ctx = this._ctx();
      this._proceduralActive = true;
      this._musicStage = this._musicStage || 'normal';

      // Reusable noise buffer for soft organic shakers & rimshots
      if (!this._noiseBuffer) {
        const sampleRate = ctx.sampleRate || 44100;
        const b = ctx.createBuffer(1, sampleRate, sampleRate);
        const data = b.getChannelData(0);
        for (let i = 0; i < sampleRate; i++) data[i] = Math.random() * 2 - 1;
        this._noiseBuffer = b;
      }

      // Soothing Lofi Progression: Fmaj7 - Em7 - Dm7 - Cmaj7 (64 16th steps)
      const bassRoots = [
        29, 29, 29, 29,  29, 29, 41, 29,  29, 29, 29, 29,  29, 29, 41, 40, // Fmaj7
        28, 28, 28, 28,  28, 28, 40, 28,  28, 28, 28, 28,  28, 28, 40, 38, // Em7
        26, 26, 26, 26,  26, 26, 38, 26,  26, 26, 26, 26,  26, 26, 38, 36, // Dm7
        24, 24, 24, 24,  24, 24, 36, 24,  24, 24, 24, 24,  24, 24, 36, 29  // Cmaj7
      ];

      // Dreamy ASMR Kalimba / Celesta pentatonic melody (hypnotic, calm, satisfying)
      const kalimbaMelody = [
        65, 0,  69, 72,  0,  76, 72, 69,  0,  77, 72, 0,   76, 72, 69, 0,  // Bar 1 (F)
        64, 0,  67, 71,  0,  74, 71, 67,  0,  76, 71, 0,   74, 71, 67, 0,  // Bar 2 (Em)
        62, 0,  65, 69,  0,  72, 69, 65,  0,  74, 69, 0,   72, 69, 65, 0,  // Bar 3 (Dm)
        60, 0,  64, 67,  0,  72, 67, 64,  0,  76, 72, 0,   79, 76, 72, 67   // Bar 4 (C)
      ];

      const m2f = (m) => 440 * Math.pow(2, (m - 69) / 12);

      let step = 0;
      let nextNoteTime = ctx.currentTime + 0.08;

      this._scheduler = () => {
        if (!this._proceduralActive || this._muted || !this.musicEnabled) return;

        // Soothing Lofi Tempo: 84 BPM
        const isShowdown = this._musicStage === 'showdown';
        const isTop5 = this._musicStage === 'top5' || isShowdown;
        const bpm = isShowdown ? 88 : 84;
        const stepTime = (60 / bpm) / 4; // 16th note duration

        while (nextNoteTime < ctx.currentTime + 0.16) {
          const t = nextNoteTime;
          const barStep = step % 64;
          const beat16 = step % 16;
          const isBeatOne = beat16 === 0;
          const isBeatThree = beat16 === 8;

          // 1. SOFT FELT KICK (Warm low sine, zero harsh click) on beats 1 and 3
          if (isBeatOne || isBeatThree) {
            const kOsc = ctx.createOscillator();
            const kGain = ctx.createGain();
            kOsc.connect(kGain); kGain.connect(ctx.destination);
            kOsc.type = 'sine';
            kOsc.frequency.setValueAtTime(68, t);
            kOsc.frequency.exponentialRampToValueAtTime(36, t + 0.12);
            kGain.gain.setValueAtTime(0, t);
            kGain.gain.linearRampToValueAtTime(this.bgVolume * 0.28, t + 0.015);
            kGain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
            kOsc.start(t);
            kOsc.stop(t + 0.14);
          }

          // 2. VELVET ACOUSTIC RIMSHOT / SNAP on beats 2 and 4 (steps 4 & 12)
          if (beat16 === 4 || beat16 === 12) {
            if (this._noiseBuffer) {
              const snNode = ctx.createBufferSource();
              snNode.buffer = this._noiseBuffer;
              const snFilter = ctx.createBiquadFilter();
              snFilter.type = 'bandpass';
              snFilter.frequency.value = 1750;
              snFilter.Q.value = 2.0;
              const snGain = ctx.createGain();
              snNode.connect(snFilter); snFilter.connect(snGain);
              snGain.connect(ctx.destination);
              snGain.gain.setValueAtTime(this.bgVolume * 0.12, t);
              snGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
              snNode.start(t);
              snNode.stop(t + 0.085);
            }
            // Soft wooden click body
            const snTone = ctx.createOscillator();
            const snToneGain = ctx.createGain();
            snTone.connect(snToneGain); snToneGain.connect(ctx.destination);
            snTone.type = 'sine';
            snTone.frequency.setValueAtTime(210, t);
            snTone.frequency.exponentialRampToValueAtTime(95, t + 0.06);
            snToneGain.gain.setValueAtTime(this.bgVolume * 0.08, t);
            snToneGain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
            snTone.start(t);
            snTone.stop(t + 0.07);
          }

          // 3. GENTLE ORGANIC ASMR SHAKER (delicate brush flutter)
          if (this._noiseBuffer && (beat16 % 2 === 1 || isTop5)) {
            const shNode = ctx.createBufferSource();
            shNode.buffer = this._noiseBuffer;
            const shFilter = ctx.createBiquadFilter();
            shFilter.type = 'highpass';
            shFilter.frequency.value = 8500;
            const shGain = ctx.createGain();
            shNode.connect(shFilter); shFilter.connect(shGain);
            shGain.connect(ctx.destination);
            const shVol = (beat16 % 4 === 2 ? 0.05 : 0.025) * this.bgVolume;
            shGain.gain.setValueAtTime(shVol, t);
            shGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
            shNode.start(t);
            shNode.stop(t + 0.045);
          }

          // 4. WARM SINE SUB-BASS (Zero harsh sawtooth buzz, pure soothing vibration)
          const bassMidi = bassRoots[barStep];
          if (bassMidi && (beat16 === 0 || beat16 === 6 || beat16 === 10)) {
            const bOsc = ctx.createOscillator();
            const bGain = ctx.createGain();
            bOsc.type = 'sine';
            bOsc.frequency.setValueAtTime(m2f(bassMidi), t);
            bOsc.connect(bGain);
            bGain.connect(ctx.destination);
            bGain.gain.setValueAtTime(0, t);
            bGain.gain.linearRampToValueAtTime(this.bgVolume * 0.22, t + 0.02);
            bGain.gain.exponentialRampToValueAtTime(0.002, t + stepTime * 3.8);
            bOsc.start(t);
            bOsc.stop(t + stepTime * 3.9);
          }

          // 5. DREAMY ASMR KALIMBA / CELESTA NOTES (Warm, bell-like, deeply satisfying)
          const noteMidi = kalimbaMelody[barStep];
          if (noteMidi > 0) {
            const kOsc = ctx.createOscillator();
            const kGain = ctx.createGain();
            kOsc.type = 'sine';
            kOsc.frequency.setValueAtTime(m2f(noteMidi), t);
            kOsc.connect(kGain);
            kGain.connect(ctx.destination);

            kGain.gain.setValueAtTime(0, t);
            kGain.gain.linearRampToValueAtTime(this.bgVolume * 0.16, t + 0.01);
            kGain.gain.exponentialRampToValueAtTime(0.001, t + stepTime * 2.8);

            kOsc.start(t);
            kOsc.stop(t + stepTime * 3.0);

            // Crystalline overtone harmonic (celesta shimmer)
            const hOsc = ctx.createOscillator();
            const hGain = ctx.createGain();
            hOsc.type = 'sine';
            hOsc.frequency.setValueAtTime(m2f(noteMidi) * 2, t);
            hOsc.connect(hGain);
            hGain.connect(ctx.destination);

            hGain.gain.setValueAtTime(0, t);
            hGain.gain.linearRampToValueAtTime(this.bgVolume * 0.05, t + 0.008);
            hGain.gain.exponentialRampToValueAtTime(0.0005, t + stepTime * 1.6);

            hOsc.start(t);
            hOsc.stop(t + stepTime * 1.8);
          }

          step++;
          nextNoteTime += stepTime;
        }

        this._seqTimer = setTimeout(this._scheduler, 35);
      };

      this._scheduler();
    } catch (e) {}
  }

  _stopProceduralBg() {
    this._proceduralActive = false;
    if (this._seqTimer) {
      clearTimeout(this._seqTimer);
      this._seqTimer = null;
    }
  }

  setBgVolume(v) {
    this.bgVolume = v;
    if (this.bgAudio) this.bgAudio.volume = this._muted ? 0 : v;
  }

  setSfxVolume(v) {
    this.sfxVolume = v;
  }

  /* ------------------------------------------------------------------ */
  /*  MUTE TOGGLE                                                        */
  /* ------------------------------------------------------------------ */

  toggleMute() {
    this._muted = !this._muted;
    if (this.bgAudio) this.bgAudio.volume = this._muted ? 0 : this.bgVolume;
    if (this._muted) {
      this._stopProceduralBg();
    } else if (!this.bgAudio && this.musicEnabled) {
      this._startProceduralBg();
    }
    
    if (window.speechSynthesis && this._muted) speechSynthesis.cancel();
    if (this._muted) this.stopHeartbeat();
    return this._muted;
  }

  isMuted() { return this._muted; }

  /* ------------------------------------------------------------------ */
  /*  SETTINGS                                                           */
  /* ------------------------------------------------------------------ */

  setProvider(p, key = '') {
    this.provider     = p;
    this.googleApiKey = key;
  }

  getVoices() { return this._voices; }
}
