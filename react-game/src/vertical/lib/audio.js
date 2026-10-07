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

  /** Short descending buzz on flag elimination */
  playElimination() {
    if (!this.sfxEnabled || this._muted) return;
    try {
      const ctx   = this._ctx();
      const osc   = ctx.createOscillator();
      const gain  = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(380, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(75, ctx.currentTime + 0.20);
      gain.gain.setValueAtTime(0.14 * (this.sfxVolume / 0.5), ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.20);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.21);
    } catch (_) {}
  }

  /** Dramatic cinematic boom hit for Top 5 / Top 3 suspense */
  playDramaticHit() {
    if (!this.sfxEnabled || this._muted) return;
    try {
      const ctx  = this._ctx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.65);
      gain.gain.setValueAtTime(0.35 * (this.sfxVolume / 0.5), ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.66);
    } catch (_) {}
  }

  /** Near-miss escape whoosh for high-audience flags */
  playNearMiss() {
    if (!this.sfxEnabled || this._muted) return;
    try {
      const ctx  = this._ctx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(450, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.16);
      gain.gain.setValueAtTime(0.10 * (this.sfxVolume / 0.5), ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.17);
    } catch (_) {}
  }

  /** Realistic double-pulse heartbeat (lub-dub) for Top 3 suspense */
  startHeartbeat(fast = false) {
    this.stopHeartbeat();
    if (!this.sfxEnabled || this._muted) return;

    const playLubDub = () => {
      try {
        const ctx = this._ctx();
        const t0  = ctx.currentTime;

        // Lub (First beat)
        const osc1  = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.connect(gain1); gain1.connect(ctx.destination);
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(70, t0);
        osc1.frequency.exponentialRampToValueAtTime(42, t0 + 0.11);
        gain1.gain.setValueAtTime(0.28 * (this.sfxVolume / 0.5), t0);
        gain1.gain.exponentialRampToValueAtTime(0.001, t0 + 0.11);
        osc1.start(t0);
        osc1.stop(t0 + 0.12);

        // Dub (Second beat, slightly louder and higher)
        const t1    = t0 + 0.14;
        const osc2  = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2); gain2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(80, t1);
        osc2.frequency.exponentialRampToValueAtTime(46, t1 + 0.13);
        gain2.gain.setValueAtTime(0.32 * (this.sfxVolume / 0.5), t1);
        gain2.gain.exponentialRampToValueAtTime(0.001, t1 + 0.13);
        osc2.start(t1);
        osc2.stop(t1 + 0.14);
      } catch (_) {}
    };

    playLubDub();
    const intervalMs = fast ? 620 : 840;
    this._heartbeatInterval = setInterval(playLubDub, intervalMs);
  }

  stopHeartbeat() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
  }

  /** Ascending fanfare notes when winner is declared */
  playWinnerFanfare() {
    this.stopHeartbeat();
    if (!this.sfxEnabled || this._muted) return;
    try {
      const ctx   = this._ctx();
      const notes = [523, 659, 784, 1047, 1568]; // C5 E5 G5 C6 G6
      notes.forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.17;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.2 * (this.sfxVolume / 0.5), t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        osc.start(t);
        osc.stop(t + 0.6);
      });
    } catch (_) {}
  }

  /** Single tick for countdown */
  playTick(high = false) {
    if (!this.sfxEnabled || this._muted) return;
    try {
      const ctx  = this._ctx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = high ? 1200 : 880;
      gain.gain.setValueAtTime(0.12 * (this.sfxVolume / 0.5), ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.09);
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

  _startProceduralBg() {
    if (this._proceduralActive) return;
    try {
      const ctx = this._ctx();
      this._proceduralActive = true;
      
      const bpm = 125;
      const stepTime = (60 / bpm) / 4; // 16th notes
      
      // Catchy Arcade / Synthwave Bassline (C Minor)
      const bassNotes = [36, 36, 36, 36, 39, 39, 41, 43]; 
      // Catchy Lead Melody
      const leadNotes = [60, null, 63, 65, 67, null, 65, 63, 60, null, 60, 63, 67, 72, null, 70];
      
      const m2f = m => m ? 440 * Math.pow(2, (m - 69) / 12) : 0;
      
      let step = 0;
      let nextNoteTime = ctx.currentTime + 0.1;

      this._scheduler = () => {
        if (!this._proceduralActive || this._muted || !this.musicEnabled) return;
        
        // Schedule ahead
        while (nextNoteTime < ctx.currentTime + 0.15) {
          
          // Kick Drum (every quarter note / beat 0, 4, 8, 12)
          if (step % 4 === 0) {
            const kOsc = ctx.createOscillator();
            const kGain = ctx.createGain();
            kOsc.connect(kGain); kGain.connect(ctx.destination);
            kOsc.frequency.setValueAtTime(120, nextNoteTime);
            kOsc.frequency.exponentialRampToValueAtTime(0.01, nextNoteTime + 0.1);
            kGain.gain.setValueAtTime(this.bgVolume * 0.4, nextNoteTime);
            kGain.gain.exponentialRampToValueAtTime(0.01, nextNoteTime + 0.1);
            kOsc.start(nextNoteTime); kOsc.stop(nextNoteTime + 0.1);
          }
          
          // Pseudo Hi-hat (8th notes / beat 0, 2, 4, 6...)
          if (step % 2 === 0) {
            const hOsc = ctx.createOscillator();
            const hGain = ctx.createGain();
            hOsc.type = 'square';
            hOsc.connect(hGain); hGain.connect(ctx.destination);
            hOsc.frequency.value = 6000; // high pitch noise fake
            hGain.gain.setValueAtTime(this.bgVolume * 0.03, nextNoteTime);
            hGain.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + 0.05);
            hOsc.start(nextNoteTime); hOsc.stop(nextNoteTime + 0.05);
          }
          
          // Bassline (8th notes)
          if (step % 2 === 0) {
            const bOsc = ctx.createOscillator();
            const bGain = ctx.createGain();
            bOsc.type = 'sawtooth';
            bOsc.connect(bGain); bGain.connect(ctx.destination);
            const mNote = bassNotes[(step / 2) % bassNotes.length];
            bOsc.frequency.value = m2f(mNote - 12);
            bGain.gain.setValueAtTime(this.bgVolume * 0.15, nextNoteTime);
            bGain.gain.exponentialRampToValueAtTime(0.01, nextNoteTime + 0.2);
            bOsc.start(nextNoteTime); bOsc.stop(nextNoteTime + 0.2);
          }
          
          // Lead Melody
          const lNote = leadNotes[step % leadNotes.length];
          if (lNote) {
            const lOsc = ctx.createOscillator();
            const lGain = ctx.createGain();
            lOsc.type = 'square';
            lOsc.connect(lGain); lGain.connect(ctx.destination);
            lOsc.frequency.value = m2f(lNote);
            lGain.gain.setValueAtTime(this.bgVolume * 0.06, nextNoteTime);
            lGain.gain.linearRampToValueAtTime(0, nextNoteTime + stepTime * 1.2);
            lOsc.start(nextNoteTime); lOsc.stop(nextNoteTime + stepTime * 1.2);
          }

          step++;
          nextNoteTime += stepTime;
        }
        
        this._seqTimer = setTimeout(this._scheduler, 30);
      };
      
      this._scheduler();
    } catch (e) {}
  }

  _stopProceduralBg() {
    this._proceduralActive = false;
    if (this._seqTimer) { clearTimeout(this._seqTimer); this._seqTimer = null; }
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
