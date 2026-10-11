// ============================================================================
// Multiverse Hero Tournament Audio Engine (Synthesized Web Audio + Voice)
// 100% Procedural Synth Engine + HTML5 Audio MP3 Fallback + SpeechSynthesis
// Engineered for 24/7 Zero-Buffer Livestream Performance
// ============================================================================

class HeroAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicEnabled = false;
    this.bgVolume = 0.38;
    this.bgAudio = null;
    this._musicStage = 'qualifiers'; // 'qualifiers' | 'teamup' | 'finals' | 'celebration'
    this._proceduralActive = false;
    this._noiseBuffer = null;
    this._seqTimer = null;
    this.speechEnabled = true;
    this.lastSpeechTime = 0;
  }

  _initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  ensureContext() {
    this._initContext();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.bgAudio) this.bgAudio.volume = this.muted ? 0 : this.bgVolume;
    if (this.muted) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }
    return this.muted;
  }

  setMuted(val) {
    this.muted = !!val;
    if (this.bgAudio) this.bgAudio.volume = this.muted ? 0 : this.bgVolume;
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  setVolume(vol) {
    this.bgVolume = Math.max(0, Math.min(1, Number(vol) || 0.38));
    if (this.bgAudio) this.bgAudio.volume = this.muted ? 0 : this.bgVolume;
  }

  setBgVolume(vol) {
    this.setVolume(vol);
  }

  setSpeechEnabled(val) {
    this.speechEnabled = !!val;
  }

  // --------------------------------------------------------------------------
  // SOUND EFFECTS (Web Audio Oscillators)
  // --------------------------------------------------------------------------

  // 1. Soothing ASMR Crystal Water-Drop & Bubble Pop on Vote Boost
  playBoost(heroColor = '#ef4444') {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      // ASMR Pentatonic frequencies (D5, E5, G5, A5, B5, D6)
      const pentatonicTones = [587.33, 659.25, 783.99, 880.00, 987.77, 1174.66];
      let hash = 0;
      for (let i = 0; i < heroColor.length; i++) hash = heroColor.charCodeAt(i) + ((hash << 5) - hash);
      const baseFreq = pentatonicTones[Math.abs(hash) % pentatonicTones.length];

      // Primary warm sine body (satisfying water drop / crystal chime)
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * 0.88, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.015);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.98, now + 0.16);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(this.bgVolume * 0.32, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      // Subtle harmonic overtone for pristine ASMR sparkle
      const sparkleOsc = this.ctx.createOscillator();
      const sparkleGain = this.ctx.createGain();
      sparkleOsc.type = 'sine';
      sparkleOsc.frequency.setValueAtTime(baseFreq * 2.01, now);
      sparkleGain.gain.setValueAtTime(this.bgVolume * 0.08, now);
      sparkleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

      osc.connect(gain);
      sparkleOsc.connect(sparkleGain);
      gain.connect(this.ctx.destination);
      sparkleGain.connect(this.ctx.destination);

      osc.start(now);
      sparkleOsc.start(now);
      osc.stop(now + 0.19);
      sparkleOsc.stop(now + 0.10);
    } catch (e) {}
  }

  // 2. Soothing ASMR Celestial Wind Chime & Harp Cascade (Super Chat / Power Strike)
  playSuperBoost() {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    try {
      // Lush Cmaj9 pentatonic cascade (C5, E5, G5, B5, C6, E6)
      const notes = [523.25, 659.25, 783.99, 987.77, 1046.50, 1318.51];
      const now = this.ctx.currentTime;

      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + idx * 0.045;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(this.bgVolume * 0.38, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.38);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.40);
      });
    } catch (e) {}
  }

  // 3. Meditative Tibetan Singing Bowl & Crystal Bell (Hero Qualified)
  playQualifiedBell() {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    try {
      const freqs = [587.33, 880.00, 1174.66, 1760.00]; // D pentatonic bell harmonics
      const now = this.ctx.currentTime;

      freqs.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const st = now + idx * 0.05;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, st);

        gain.gain.setValueAtTime(0, st);
        gain.gain.linearRampToValueAtTime(this.bgVolume * 0.34, st + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, st + 0.65);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(st);
        osc.stop(st + 0.68);
      });
    } catch (e) {}
  }

  // 4. Deep Resonant Acoustic Singing Bowl & Temple Bell (Tag-Team Clash)
  playTeamupGong() {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      // Warm acoustic bowl fundamental + calm harmonics (zero harsh buzz)
      const bowlHarmonics = [130.81, 261.63, 392.00, 523.25]; // C3, C4, G4, C5

      bowlHarmonics.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        const vol = (this.bgVolume * 0.32) / (i + 1);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 1.25);
      });
    } catch (e) {}
  }

  // 5. Soothing Celesta & Marimba Victory Cascade (Doom Defeated)
  playVictoryFanfare() {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    try {
      const notes = [
        { f: 587.33, t: 0.00, d: 0.30 }, // D5
        { f: 739.99, t: 0.12, d: 0.30 }, // F#5
        { f: 880.00, t: 0.24, d: 0.35 }, // A5
        { f: 1174.66, t: 0.40, d: 0.70 }, // D6
        { f: 880.00, t: 0.85, d: 0.35 }, // A5
        { f: 1174.66, t: 1.05, d: 1.20 }  // D6 (warm sustained chime)
      ];

      const now = this.ctx.currentTime;
      notes.forEach(({ f, t, d }) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + t;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(this.bgVolume * 0.42, startTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + d);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + d);
      });
    } catch (e) {}
  }

  // --------------------------------------------------------------------------
  // BACKGROUND MUSIC ENGINE (Procedural Superhero Synthwave + MP3 Fallback)
  // --------------------------------------------------------------------------

  loadBgMusic(src) {
    if (this.bgAudio) {
      this.bgAudio.pause();
      this.bgAudio = null;
    }
    if (!src) return;
    try {
      this.bgAudio = new Audio(src);
      this.bgAudio.loop = true;
      this.bgAudio.volume = this.muted ? 0 : this.bgVolume;
    } catch (e) {}
  }

  playBgMusic() {
    this._initContext();
    this.musicEnabled = true;
    if (this.bgAudio && !this.muted) {
      this.bgAudio.play().catch(() => {});
    } else if (!this.muted) {
      this._startProceduralBg();
    }
  }

  pauseBgMusic() {
    this.musicEnabled = false;
    if (this.bgAudio) this.bgAudio.pause();
    this._stopProceduralBg();
  }

  toggleBgMusic() {
    if (this.musicEnabled && !this.muted) {
      this.pauseBgMusic();
      return false;
    } else {
      this.playBgMusic();
      return true;
    }
  }

  setMusicIntensity(stage) {
    this._musicStage = stage; // 'qualifiers' | 'teamup' | 'finals' | 'celebration'
  }

  _startProceduralBg() {
    if (this._proceduralActive) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const ctx = this.ctx;
      this._proceduralActive = true;

      // 1-second white noise buffer for drums
      if (!this._noiseBuffer) {
        const sampleRate = ctx.sampleRate || 44100;
        const b = ctx.createBuffer(1, sampleRate, sampleRate);
        const data = b.getChannelData(0);
        for (let i = 0; i < sampleRate; i++) data[i] = Math.random() * 2 - 1;
        this._noiseBuffer = b;
      }

      // Soothing ASMR Dreamy Chord Progression (Dm9 -> Bbmaj7 -> Fmaj7 -> C6/9)
      const bassRoots = [
        38, 0, 0, 38,   0, 0, 38, 0,   38, 0, 0, 38,   0, 0, 0, 48, // Dm9
        34, 0, 0, 34,   0, 0, 34, 0,   34, 0, 0, 34,   0, 0, 0, 45, // Bbmaj7
        41, 0, 0, 41,   0, 0, 41, 0,   41, 0, 0, 41,   0, 0, 0, 52, // Fmaj7
        36, 0, 0, 36,   0, 0, 36, 0,   36, 0, 0, 36,   0, 0, 0, 47  // C6
      ];

      // Soothing Kalimba / Celesta Dream Melody (ASMR Pentatonic Chill)
      const arpNotes = [
        74, 0, 77, 81,  0, 77, 0, 81,   74, 81, 0, 86,  0, 81, 77, 0, // Dm
        70, 0, 74, 77,  0, 74, 0, 77,   70, 77, 0, 82,  0, 77, 74, 0, // Bb
        72, 0, 77, 81,  0, 77, 0, 81,   72, 81, 0, 84,  0, 81, 77, 0, // F
        67, 0, 72, 76,  0, 72, 0, 76,   67, 76, 0, 79,  0, 76, 72, 0  // C
      ];

      const m2f = (m) => 440 * Math.pow(2, (m - 69) / 12);
      let step = 0;
      let nextNoteTime = ctx.currentTime + 0.05;

      this._scheduler = () => {
        if (!this._proceduralActive || this.muted || !this.musicEnabled) return;

        // Relaxed, soothing ASMR lofi tempo
        let bpm = 84;
        let filterCutoff = 1300;
        const isFinals = this._musicStage === 'finals';
        const isTeamup = this._musicStage === 'teamup';

        if (isFinals) {
          bpm = 94;
          filterCutoff = 1800;
        } else if (isTeamup) {
          bpm = 88;
          filterCutoff = 1500;
        }

        const stepTime = (60 / bpm) / 4;

        while (nextNoteTime < ctx.currentTime + 0.16) {
          const t = nextNoteTime;
          const barStep = step % 64;
          const beat16 = step % 16;

          // 1. Warm Soft ASMR Felt Kick (Beats 1 & 10)
          if (beat16 === 0 || beat16 === 10) {
            const kOsc = ctx.createOscillator();
            const kGain = ctx.createGain();
            kOsc.connect(kGain);
            kGain.connect(ctx.destination);
            kOsc.type = 'sine';
            kOsc.frequency.setValueAtTime(84, t);
            kOsc.frequency.exponentialRampToValueAtTime(42, t + 0.09);
            kGain.gain.setValueAtTime(this.bgVolume * 0.32, t);
            kGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
            kOsc.start(t);
            kOsc.stop(t + 0.15);
          }

          // 2. Soft ASMR Velvet Rimshot / Snare on beats 4 & 12
          if (beat16 === 4 || beat16 === 12) {
            if (this._noiseBuffer) {
              const snNode = ctx.createBufferSource();
              snNode.buffer = this._noiseBuffer;
              const snFilter = ctx.createBiquadFilter();
              snFilter.type = 'bandpass';
              snFilter.frequency.value = 1450;
              snFilter.Q.value = 1.8;
              const snGain = ctx.createGain();
              snNode.connect(snFilter);
              snFilter.connect(snGain);
              snGain.connect(ctx.destination);
              snGain.gain.setValueAtTime(this.bgVolume * 0.13, t);
              snGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
              snNode.start(t);
              snNode.stop(t + 0.13);
            }
          }

          // 3. Gentle Soft-Shaker / Brush Ticks on eighth notes
          if (this._noiseBuffer && beat16 % 2 === 0) {
            const shNode = ctx.createBufferSource();
            shNode.buffer = this._noiseBuffer;
            const shFilter = ctx.createBiquadFilter();
            shFilter.type = 'highpass';
            shFilter.frequency.value = 8500;
            const shGain = ctx.createGain();
            shNode.connect(shFilter);
            shFilter.connect(shGain);
            shGain.connect(ctx.destination);
            shGain.gain.setValueAtTime(this.bgVolume * 0.035, t);
            shGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
            shNode.start(t);
            shNode.stop(t + 0.055);
          }

          // 4. Warm Soothing Sub-Bass (Pure Sine, zero harsh buzzing)
          const bassMidi = bassRoots[barStep];
          if (bassMidi) {
            const bOsc = ctx.createOscillator();
            const bGain = ctx.createGain();
            bOsc.type = 'sine';
            bOsc.frequency.setValueAtTime(m2f(bassMidi), t);
            bOsc.connect(bGain);
            bGain.connect(ctx.destination);
            bGain.gain.setValueAtTime(this.bgVolume * 0.18, t);
            bGain.gain.exponentialRampToValueAtTime(0.0001, t + stepTime * 2.2);
            bOsc.start(t);
            bOsc.stop(t + stepTime * 2.3);
          }

          // 5. Dreamy Kalimba / Celesta Lofi Arpeggios (Relaxing Pentatonic)
          const arpMidi = arpNotes[barStep];
          if (arpMidi) {
            const lOsc = ctx.createOscillator();
            const lFilter = ctx.createBiquadFilter();
            const lGain = ctx.createGain();
            lOsc.type = 'sine';
            lOsc.frequency.setValueAtTime(m2f(arpMidi), t);
            lFilter.type = 'lowpass';
            lFilter.frequency.setValueAtTime(filterCutoff, t);
            lFilter.Q.value = 1.2;
            lOsc.connect(lFilter);
            lFilter.connect(lGain);
            lGain.connect(ctx.destination);
            lGain.gain.setValueAtTime(0, t);
            lGain.gain.linearRampToValueAtTime(this.bgVolume * 0.09, t + 0.015);
            lGain.gain.exponentialRampToValueAtTime(0.0001, t + stepTime * 1.8);
            lOsc.start(t);
            lOsc.stop(t + stepTime * 1.9);
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

  // --------------------------------------------------------------------------
  // VOICE ANNOUNCER (Web SpeechSynthesis API)
  // --------------------------------------------------------------------------

  speak(text) {
    if (!this.speechEnabled || this.muted) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const now = Date.now();
    // Throttle voice announcements to avoid speech congestion
    if (now - this.lastSpeechTime < 2400) return;
    this.lastSpeechTime = now;

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.08;
      utterance.pitch = 1.0;
      utterance.volume = Math.min(1, this.bgVolume * 2.2);
      utterance.lang = 'en-US';

      const voices = window.speechSynthesis.getVoices();
      const engVoice = voices.find(v =>
        v.lang.startsWith('en') &&
        (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Daniel') || v.name.includes('Samantha'))
      );
      if (engVoice) utterance.voice = engVoice;

      window.speechSynthesis.speak(utterance);
    } catch (e) {}
  }
}

export const heroAudio = new HeroAudioEngine();

if (typeof window !== 'undefined') {
  window.heroAudio = heroAudio;
}
