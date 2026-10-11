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

  // 1. Comic Zap / Punch on Vote Boost
  playBoost(heroColor = '#ef4444') {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = 'triangle';
      // High-energy laser punch pitch dive
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.08);

      gain.gain.setValueAtTime(this.bgVolume * 0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.09);
    } catch (e) {}
  }

  // 2. Super Chat / Major Boost Fanfare
  playSuperBoost() {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C Major arpeggio
      const now = this.ctx.currentTime;

      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + idx * 0.05;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(this.bgVolume * 0.55, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.28);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.29);
      });
    } catch (e) {}
  }

  // 3. Qualified Hero Notification Chime
  playQualifiedBell() {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    try {
      const freqs = [880, 1108.73, 1318.51, 1760];
      const now = this.ctx.currentTime;

      freqs.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const st = now + idx * 0.06;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, st);

        gain.gain.setValueAtTime(this.bgVolume * 0.5, st);
        gain.gain.exponentialRampToValueAtTime(0.001, st + 0.5);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(st);
        osc.stop(st + 0.52);
      });
    } catch (e) {}
  }

  // 4. Tag-Team Synergy Clash Gong
  playTeamupGong() {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(380, now + 0.35);

      gain.gain.setValueAtTime(this.bgVolume * 0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.72);
    } catch (e) {}
  }

  // 5. Championship Victory Fanfare
  playVictoryFanfare() {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    try {
      const notes = [
        { f: 293.66, t: 0.00, d: 0.16 }, // D4
        { f: 369.99, t: 0.15, d: 0.16 }, // F#4
        { f: 440.00, t: 0.30, d: 0.20 }, // A4
        { f: 587.33, t: 0.50, d: 0.60 }, // D5
        { f: 440.00, t: 1.10, d: 0.20 }, // A4
        { f: 587.33, t: 1.30, d: 1.00 }  // D5 (heroic hold)
      ];

      const now = this.ctx.currentTime;
      notes.forEach(({ f, t, d }) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + t;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, startTime);

        gain.gain.setValueAtTime(this.bgVolume * 0.65, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + d);

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

      // Epic Superhero Chord Progression in D Minor: Dm -> Bb -> F -> C
      // Bass MIDI notes (16 sixteenths per chord, 64 steps total)
      const bassRoots = [
        38, 38, 50, 38,  38, 38, 50, 38,  38, 38, 50, 38,  38, 38, 50, 48, // Dm
        34, 34, 46, 34,  34, 34, 46, 34,  34, 34, 46, 34,  34, 34, 46, 45, // Bb
        41, 41, 53, 41,  41, 41, 53, 41,  41, 41, 53, 41,  41, 41, 53, 52, // F
        36, 36, 48, 36,  36, 36, 48, 36,  36, 36, 48, 36,  36, 36, 48, 47  // C
      ];

      // Superhero Heroic Motif Arpeggio (cinematic theme)
      const arpNotes = [
        74, 77, 81, 86,  81, 77, 86, 81,  74, 77, 81, 86,  89, 86, 81, 77, // Dm
        70, 74, 77, 82,  77, 74, 82, 77,  70, 74, 77, 82,  86, 82, 77, 74, // Bb
        72, 77, 81, 84,  81, 77, 84, 81,  72, 77, 81, 84,  89, 84, 81, 77, // F
        67, 72, 76, 79,  76, 72, 79, 76,  67, 72, 76, 79,  84, 79, 76, 72  // C
      ];

      const m2f = (m) => 440 * Math.pow(2, (m - 69) / 12);
      let step = 0;
      let nextNoteTime = ctx.currentTime + 0.05;

      this._scheduler = () => {
        if (!this._proceduralActive || this.muted || !this.musicEnabled) return;

        let bpm = 126;
        let filterCutoff = 2200;
        const isFinals = this._musicStage === 'finals';
        const isTeamup = this._musicStage === 'teamup';

        if (isFinals) {
          bpm = 142;
          filterCutoff = 4800;
        } else if (isTeamup) {
          bpm = 134;
          filterCutoff = 3200;
        }

        const stepTime = (60 / bpm) / 4;

        while (nextNoteTime < ctx.currentTime + 0.16) {
          const t = nextNoteTime;
          const barStep = step % 64;
          const beat16 = step % 16;
          const isQuarter = beat16 % 4 === 0;

          // 1. Driving Kick Drum (4-on-the-floor)
          if (isQuarter) {
            const kOsc = ctx.createOscillator();
            const kGain = ctx.createGain();
            kOsc.connect(kGain);
            kGain.connect(ctx.destination);
            kOsc.frequency.setValueAtTime(isFinals ? 155 : 138, t);
            kOsc.frequency.exponentialRampToValueAtTime(36, t + 0.08);
            kGain.gain.setValueAtTime(this.bgVolume * (isFinals ? 0.45 : 0.38), t);
            kGain.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
            kOsc.start(t);
            kOsc.stop(t + 0.09);
          }

          // 2. Snappy Snare / Clap on beats 2 & 4
          if (beat16 === 4 || beat16 === 12) {
            if (this._noiseBuffer) {
              const snNode = ctx.createBufferSource();
              snNode.buffer = this._noiseBuffer;
              const snFilter = ctx.createBiquadFilter();
              snFilter.type = 'bandpass';
              snFilter.frequency.value = 2100;
              snFilter.Q.value = 1.3;
              const snGain = ctx.createGain();
              snNode.connect(snFilter);
              snFilter.connect(snGain);
              snGain.connect(ctx.destination);
              snGain.gain.setValueAtTime(this.bgVolume * 0.22, t);
              snGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
              snNode.start(t);
              snNode.stop(t + 0.12);
            }
          }

          // 3. Crisp Hi-Hats on offbeats
          if (this._noiseBuffer && beat16 % 2 === 1) {
            const ohNode = ctx.createBufferSource();
            ohNode.buffer = this._noiseBuffer;
            const ohFilter = ctx.createBiquadFilter();
            ohFilter.type = 'highpass';
            ohFilter.frequency.value = 7500;
            const ohGain = ctx.createGain();
            ohNode.connect(ohFilter);
            ohFilter.connect(ohGain);
            ohGain.connect(ctx.destination);
            ohGain.gain.setValueAtTime(this.bgVolume * 0.08, t);
            ohGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
            ohNode.start(t);
            ohNode.stop(t + 0.085);
          }

          // 4. Superhero Synth Bass
          const bassMidi = bassRoots[barStep];
          if (bassMidi) {
            const bOsc = ctx.createOscillator();
            const bFilter = ctx.createBiquadFilter();
            const bGain = ctx.createGain();
            bOsc.type = 'sawtooth';
            bOsc.frequency.setValueAtTime(m2f(bassMidi), t);
            bFilter.type = 'lowpass';
            bFilter.frequency.setValueAtTime(isQuarter ? 550 : 920, t);
            bFilter.Q.value = 2.4;
            bOsc.connect(bFilter);
            bFilter.connect(bGain);
            bGain.connect(ctx.destination);
            const bassVol = isQuarter ? this.bgVolume * 0.11 : this.bgVolume * 0.18;
            bGain.gain.setValueAtTime(bassVol, t);
            bGain.gain.exponentialRampToValueAtTime(0.004, t + stepTime * 0.88);
            bOsc.start(t);
            bOsc.stop(t + stepTime * 0.9);
          }

          // 5. Heroic Lead Arpeggio
          const arpMidi = arpNotes[barStep];
          if (arpMidi) {
            const lOsc = ctx.createOscillator();
            const lFilter = ctx.createBiquadFilter();
            const lGain = ctx.createGain();
            lOsc.type = 'square';
            lOsc.frequency.setValueAtTime(m2f(arpMidi), t);
            lFilter.type = 'lowpass';
            lFilter.frequency.setValueAtTime(filterCutoff, t);
            lFilter.Q.value = 2.1;
            lOsc.connect(lFilter);
            lFilter.connect(lGain);
            lGain.connect(ctx.destination);
            const arpVol = isFinals ? this.bgVolume * 0.11 : this.bgVolume * 0.07;
            lGain.gain.setValueAtTime(arpVol, t);
            lGain.gain.linearRampToValueAtTime(0.001, t + stepTime * 0.82);
            lOsc.start(t);
            lOsc.stop(t + stepTime * 0.88);
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
