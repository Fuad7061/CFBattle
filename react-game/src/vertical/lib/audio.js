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

  /** Pleasant harmonic high chime when a chat vote / boost lands */
  playVoteChime() {
    if (!this.sfxEnabled || this._muted) return;
    try {
      const ctx = this._ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, ctx.currentTime); // B5
      osc.frequency.exponentialRampToValueAtTime(1318.51, ctx.currentTime + 0.08); // E6
      gain.gain.setValueAtTime(0.14 * (this.sfxVolume / 0.5), ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.13);
    } catch (_) {}
  }

  /** Dedicated futuristic SFX for powers (shield, freeze, boost, quake, nuke) */
  playPowerSFX(powerName) {
    if (!this.sfxEnabled || this._muted) return;
    try {
      const ctx = this._ctx();
      const p = String(powerName || '').toLowerCase();
      const t = ctx.currentTime;

      if (p === 'freeze') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1800, t);
        osc.frequency.exponentialRampToValueAtTime(400, t + 0.35);
        gain.gain.setValueAtTime(0.25 * (this.sfxVolume / 0.5), t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t); osc.stop(t + 0.36);
      } else if (p === 'shield') {
        [523.25, 1046.5].forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.18 * (this.sfxVolume / 0.5), t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
          osc.start(t); osc.stop(t + 0.46);
        });
      } else if (p === 'boost') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.exponentialRampToValueAtTime(880, t + 0.28);
        gain.gain.setValueAtTime(0.18 * (this.sfxVolume / 0.5), t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.start(t); osc.stop(t + 0.29);
      } else if (p === 'quake') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(65, t);
        osc.frequency.linearRampToValueAtTime(30, t + 0.6);
        gain.gain.setValueAtTime(0.4 * (this.sfxVolume / 0.5), t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        osc.start(t); osc.stop(t + 0.61);
      } else if (p === 'nuke') {
        this.playDramaticHit();
      }
    } catch (_) {}
  }

  /** Urgent dual-horn siren when 1v1 Sudden Death begins */
  playShowdownAlarm() {
    if (!this.sfxEnabled || this._muted) return;
    try {
      const ctx = this._ctx();
      const t = ctx.currentTime;
      [0, 0.22, 0.44].forEach((delay, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(idx % 2 === 0 ? 587.33 : 880, t + delay);
        gain.gain.setValueAtTime(0.2 * (this.sfxVolume / 0.5), t + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.18);
        osc.start(t + delay);
        osc.stop(t + delay + 0.19);
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

  _startProceduralBg() {
    if (this._proceduralActive) return;
    try {
      const ctx = this._ctx();
      this._proceduralActive = true;
      this._musicStage = this._musicStage || 'normal';

      // Reusable noise buffer for crisp studio-quality percussion (hats, snares)
      if (!this._noiseBuffer) {
        const sampleRate = ctx.sampleRate || 44100;
        const b = ctx.createBuffer(1, sampleRate, sampleRate);
        const data = b.getChannelData(0);
        for (let i = 0; i < sampleRate; i++) data[i] = Math.random() * 2 - 1;
        this._noiseBuffer = b;
      }

      // Euphoric Dopamine Chord Progression (Am - F - C - G) in 4 bars (64 16th steps)
      // Bass midi notes: A1 (33), F1 (29), C2 (36), G1 (31)
      const bassRoots = [
        33, 33, 45, 33,  33, 33, 45, 33,  33, 33, 45, 33,  33, 33, 45, 43, // Am
        29, 29, 41, 29,  29, 29, 41, 29,  29, 29, 41, 29,  29, 29, 41, 40, // F
        36, 36, 48, 36,  36, 36, 48, 36,  36, 36, 48, 36,  36, 36, 48, 47, // C
        31, 31, 43, 31,  31, 31, 43, 31,  31, 31, 43, 31,  31, 31, 43, 41  // G
      ];

      // Uplifting Arpeggio Lead (Pentatonic/Dorian euphoria)
      const arpLead = [
        69, 72, 76, 81,  76, 72, 81, 76,  69, 72, 76, 81,  84, 81, 76, 72, // Bar 1 (Am)
        65, 69, 72, 77,  72, 69, 77, 72,  65, 69, 72, 77,  81, 77, 72, 69, // Bar 2 (F)
        60, 64, 67, 72,  67, 64, 72, 67,  60, 64, 67, 72,  76, 72, 67, 64, // Bar 3 (C)
        67, 71, 74, 79,  74, 71, 79, 74,  67, 71, 74, 79,  83, 79, 74, 71  // Bar 4 (G)
      ];

      const m2f = (m) => 440 * Math.pow(2, (m - 69) / 12);

      let step = 0;
      let nextNoteTime = ctx.currentTime + 0.08;

      this._scheduler = () => {
        if (!this._proceduralActive || this._muted || !this.musicEnabled) return;

        // Dynamic BPM & energy based on battle stage
        let bpm = 126;
        let filterCutoff = 1500;
        let isShowdown = this._musicStage === 'showdown';
        let isTop5 = this._musicStage === 'top5' || isShowdown;

        if (isShowdown) {
          bpm = 138;
          filterCutoff = 4200;
        } else if (isTop5) {
          bpm = 132;
          filterCutoff = 2600;
        }

        const stepTime = (60 / bpm) / 4; // 16th note duration

        while (nextNoteTime < ctx.currentTime + 0.16) {
          const t = nextNoteTime;
          const barStep = step % 64;
          const beat16 = step % 16;
          const isQuarter = beat16 % 4 === 0;

          // 1. PUNCHY 4-ON-THE-FLOOR KICK (Every beat: 0, 4, 8, 12)
          if (isQuarter) {
            const kOsc = ctx.createOscillator();
            const kGain = ctx.createGain();
            kOsc.connect(kGain);
            kGain.connect(ctx.destination);
            kOsc.frequency.setValueAtTime(isShowdown ? 150 : 135, t);
            kOsc.frequency.exponentialRampToValueAtTime(36, t + 0.085);
            kGain.gain.setValueAtTime(this.bgVolume * (isShowdown ? 0.48 : 0.40), t);
            kGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
            kOsc.start(t);
            kOsc.stop(t + 0.095);
          }

          // 2. SNAPPY SNARE / CLAP (Beats 2 & 4: 4, 12)
          if (beat16 === 4 || beat16 === 12) {
            // Noise snap
            if (this._noiseBuffer) {
              const snNode = ctx.createBufferSource();
              snNode.buffer = this._noiseBuffer;
              const snFilter = ctx.createBiquadFilter();
              snFilter.type = 'bandpass';
              snFilter.frequency.value = 1900;
              snFilter.Q.value = 1.2;
              const snGain = ctx.createGain();
              snNode.connect(snFilter);
              snFilter.connect(snGain);
              snGain.connect(ctx.destination);
              snGain.gain.setValueAtTime(this.bgVolume * 0.22, t);
              snGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
              snNode.start(t);
              snNode.stop(t + 0.125);
            }
            // Tonal snap
            const snOsc = ctx.createOscillator();
            const snToneGain = ctx.createGain();
            snOsc.connect(snToneGain);
            snToneGain.connect(ctx.destination);
            snOsc.frequency.setValueAtTime(220, t);
            snOsc.frequency.exponentialRampToValueAtTime(90, t + 0.08);
            snToneGain.gain.setValueAtTime(this.bgVolume * 0.14, t);
            snToneGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
            snOsc.start(t);
            snOsc.stop(t + 0.085);
          }

          // 3. CRISP 909 HI-HATS
          if (this._noiseBuffer) {
            const isOffbeat = beat16 % 4 === 2; // Steps 2, 6, 10, 14 (Open Hat Sizzle)
            const isClosed = (beat16 % 2 === 1) || (isTop5 && beat16 % 2 === 0);

            if (isOffbeat) {
              const ohNode = ctx.createBufferSource();
              ohNode.buffer = this._noiseBuffer;
              const ohFilter = ctx.createBiquadFilter();
              ohFilter.type = 'highpass';
              ohFilter.frequency.value = 7500;
              const ohGain = ctx.createGain();
              ohNode.connect(ohFilter);
              ohFilter.connect(ohGain);
              ohGain.connect(ctx.destination);
              ohGain.gain.setValueAtTime(this.bgVolume * 0.09, t);
              ohGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
              ohNode.start(t);
              ohNode.stop(t + 0.115);
            } else if (isClosed && !isQuarter) {
              const chNode = ctx.createBufferSource();
              chNode.buffer = this._noiseBuffer;
              const chFilter = ctx.createBiquadFilter();
              chFilter.type = 'highpass';
              chFilter.frequency.value = 9000;
              const chGain = ctx.createGain();
              chNode.connect(chFilter);
              chFilter.connect(chGain);
              chGain.connect(ctx.destination);
              chGain.gain.setValueAtTime(this.bgVolume * 0.05, t);
              chGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
              chNode.start(t);
              chNode.stop(t + 0.045);
            }
          }

          // 4. ROLLING 16TH SYNTHWAVE BASSLINE
          const bassMidi = bassRoots[barStep];
          if (bassMidi) {
            const bOsc = ctx.createOscillator();
            const bFilter = ctx.createBiquadFilter();
            const bGain = ctx.createGain();

            bOsc.type = 'sawtooth';
            bOsc.frequency.setValueAtTime(m2f(bassMidi), t);

            bFilter.type = 'lowpass';
            bFilter.frequency.setValueAtTime(isQuarter ? 450 : 850, t);
            bFilter.Q.value = 3.0;

            bOsc.connect(bFilter);
            bFilter.connect(bGain);
            bGain.connect(ctx.destination);

            // Sidechain dip on the kick
            const bassVol = isQuarter ? this.bgVolume * 0.10 : this.bgVolume * 0.20;
            bGain.gain.setValueAtTime(bassVol, t);
            bGain.gain.exponentialRampToValueAtTime(0.005, t + stepTime * 0.88);

            bOsc.start(t);
            bOsc.stop(t + stepTime * 0.9);
          }

          // 5. EUPHORIC ARPEGGIATOR CHORD LEAD (Dopamine trigger)
          const arpMidi = arpLead[barStep];
          if (arpMidi) {
            const lOsc = ctx.createOscillator();
            const lFilter = ctx.createBiquadFilter();
            const lGain = ctx.createGain();

            lOsc.type = 'square';
            lOsc.frequency.setValueAtTime(m2f(arpMidi), t);

            lFilter.type = 'lowpass';
            lFilter.frequency.setValueAtTime(filterCutoff, t);
            lFilter.Q.value = 2.5;

            lOsc.connect(lFilter);
            lFilter.connect(lGain);
            lGain.connect(ctx.destination);

            const arpVol = isShowdown ? this.bgVolume * 0.11 : this.bgVolume * 0.075;
            lGain.gain.setValueAtTime(arpVol, t);
            lGain.gain.linearRampToValueAtTime(0.001, t + stepTime * 0.85);

            lOsc.start(t);
            lOsc.stop(t + stepTime * 0.9);
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
