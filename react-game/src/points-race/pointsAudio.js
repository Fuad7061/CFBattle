/**
 * pointsAudio.js — Synthesized Web Audio API Sound Effects.
 * 
 * Generates zero-latency game chimes, overtakes, Super Chat fanfares,
 * and victory celebrations directly via audio oscillators.
 * Zero external audio files or downloads required.
 */

class PointsAudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicEnabled = false;
    this.bgVolume = 0.50;
    this.bgAudio = null;
    this._musicStage = 'normal';
    this._proceduralActive = false;
    this._noiseBuffer = null;
    this._seqTimer = null;
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

  // 1. Soothing ASMR Crystal Water-Drop & Bubble Pop on +1 Vote
  playVoteChime() {
    if (this.muted) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      // ASMR Pentatonic drop frequencies (D5, E5, G5, A5, C6)
      const tones = [587.33, 659.25, 783.99, 880.00, 1046.50];
      const baseFreq = tones[Math.floor(Math.random() * tones.length)];

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * 0.88, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.015);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.98, now + 0.16);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(this.bgVolume * 0.28, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      // Subtle harmonic overtone for pristine ASMR sparkle
      const sparkleOsc = this.ctx.createOscillator();
      const sparkleGain = this.ctx.createGain();
      sparkleOsc.type = 'sine';
      sparkleOsc.frequency.setValueAtTime(baseFreq * 2.01, now);
      sparkleGain.gain.setValueAtTime(this.bgVolume * 0.07, now);
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

  // 2. Soothing Marimba Duo Chime on Combo Streak
  playStreakChime() {
    if (this.muted) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      [880.00, 1174.66].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const st = now + idx * 0.045;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, st);

        gain.gain.setValueAtTime(0, st);
        gain.gain.linearRampToValueAtTime(this.bgVolume * 0.32, st + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, st + 0.24);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(st);
        osc.stop(st + 0.25);
      });
    } catch (e) {}
  }

  // 3. Velvet Whoosh & Harmonic Chime on #1 Overtake
  playOvertakeChime() {
    if (this.muted) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const st = now + idx * 0.04;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, st);

        gain.gain.setValueAtTime(0, st);
        gain.gain.linearRampToValueAtTime(this.bgVolume * 0.30, st + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, st + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(st);
        osc.stop(st + 0.36);
      });
    } catch (e) {}
  }

  // 3b. Meditative Singing Bowl & Crystal Bell on Qualification
  playQualifierChime() {
    if (this.muted) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const st = now + idx * 0.06;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, st);

        gain.gain.setValueAtTime(0, st);
        gain.gain.linearRampToValueAtTime(this.bgVolume * 0.35, st + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, st + 0.55);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(st);
        osc.stop(st + 0.58);
      });
    } catch (e) {}
  }

  // 4. Celestial Wind Chime & Harp Cascade on Super Chat (Zero Harsh Sawtooth)
  playSuperChatFanfare() {
    if (this.muted) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const chord = [523.25, 659.25, 783.99, 987.77, 1046.50, 1318.51]; // Cmaj9
      chord.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const st = now + idx * 0.04;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, st);

        gain.gain.setValueAtTime(0, st);
        gain.gain.linearRampToValueAtTime(this.bgVolume * 0.34, st + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, st + 0.45);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(st);
        osc.stop(st + 0.48);
      });
    } catch (e) {}
  }

  // 5. Grand victory fanfare for reaching 1,000 points
  playVictoryFanfare() {
    if (this.muted) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      // Arpeggio: C4, E4, G4, C5, G4, C5 (held)
      const notes = [
        { freq: 261.63, delay: 0.00, dur: 0.20 },
        { freq: 329.63, delay: 0.18, dur: 0.20 },
        { freq: 392.00, delay: 0.36, dur: 0.20 },
        { freq: 523.25, delay: 0.54, dur: 0.28 },
        { freq: 659.25, delay: 0.82, dur: 0.28 },
        { freq: 783.99, delay: 1.10, dur: 0.80 },
        { freq: 1046.5, delay: 1.10, dur: 1.20 }
      ];

      notes.forEach(({ freq, delay, dur }) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + delay);

        gain.gain.setValueAtTime(0.2, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + delay);
        osc.stop(now + delay + dur);
      });
    } catch (e) {}
  }

  // 6. Suspenseful showdown duel alarm when entering Roundup Climax
  playShowdownAlarm() {
    if (this.muted) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      // Heartbeat pulse: Low thump then high warning
      [
        { freq: 110, delay: 0.00, dur: 0.15, type: 'sine', vol: 0.25 },
        { freq: 130, delay: 0.18, dur: 0.15, type: 'sine', vol: 0.25 },
        { freq: 880, delay: 0.38, dur: 0.25, type: 'sawtooth', vol: 0.10 },
        { freq: 1046.5, delay: 0.60, dur: 0.30, type: 'sawtooth', vol: 0.12 }
      ].forEach(({ freq, delay, dur, type, vol }) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now + delay);

        gain.gain.setValueAtTime(vol, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + delay);
        osc.stop(now + delay + dur);
      });
    } catch (e) {}
  }

  // 7. Background Procedural Gaming Beats & MP3 Engine
  loadBgMusic(src) {
    if (this.bgAudio) { this.bgAudio.pause(); this.bgAudio = null; }
    if (!src) return;
    this.bgAudio = new Audio(src);
    this.bgAudio.loop = true;
    this.bgAudio.volume = this.muted ? 0 : this.bgVolume;
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
    if (this.musicEnabled) {
      this.pauseBgMusic();
      return false;
    } else {
      this.playBgMusic();
      return true;
    }
  }

  setMusicIntensity(stage) {
    this._musicStage = stage; // 'normal' | 'top5' | 'showdown'
  }

  setBgVolume(vol) {
    this.bgVolume = Math.max(0, Math.min(1, vol));
    if (this.bgAudio) this.bgAudio.volume = this.muted ? 0 : this.bgVolume;
  }

  _startProceduralBg() {
    if (this._proceduralActive) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const ctx = this.ctx;
      this._proceduralActive = true;
      this._musicStage = this._musicStage || 'normal';

      if (!this._noiseBuffer) {
        const sampleRate = ctx.sampleRate || 44100;
        const b = ctx.createBuffer(1, sampleRate, sampleRate);
        const data = b.getChannelData(0);
        for (let i = 0; i < sampleRate; i++) data[i] = Math.random() * 2 - 1;
        this._noiseBuffer = b;
      }

      // Soothing ASMR Dopamine Chord Progression (Am9 -> Fmaj7 -> Cmaj7 -> G6)
      const bassRoots = [
        33, 0, 0, 33,   0, 0, 33, 0,   33, 0, 0, 33,   0, 0, 0, 43, // Am9
        29, 0, 0, 29,   0, 0, 29, 0,   29, 0, 0, 29,   0, 0, 0, 40, // Fmaj7
        36, 0, 0, 36,   0, 0, 36, 0,   36, 0, 0, 36,   0, 0, 0, 47, // Cmaj7
        31, 0, 0, 31,   0, 0, 31, 0,   31, 0, 0, 31,   0, 0, 0, 41  // G6
      ];

      // Relaxing Kalimba & Marimba Pentatonic Chimes
      const arpLead = [
        69, 0, 72, 76,  0, 72, 0, 76,   69, 76, 0, 81,  0, 76, 72, 0,
        65, 0, 69, 72,  0, 69, 0, 72,   65, 72, 0, 77,  0, 72, 69, 0,
        60, 0, 64, 67,  0, 64, 0, 67,   60, 67, 0, 72,  0, 67, 64, 0,
        67, 0, 71, 74,  0, 71, 0, 74,   67, 74, 0, 79,  0, 74, 71, 0
      ];

      const m2f = (m) => 440 * Math.pow(2, (m - 69) / 12);
      let step = 0;
      let nextNoteTime = ctx.currentTime + 0.08;

      this._scheduler = () => {
        if (!this._proceduralActive || this.muted || !this.musicEnabled) return;

        // Relaxed, soothing ASMR lofi tempo
        let bpm = 84;
        let filterCutoff = 1350;
        const isShowdown = this._musicStage === 'showdown';
        const isTop5 = this._musicStage === 'top5' || isShowdown;

        if (isShowdown) {
          bpm = 92;
          filterCutoff = 1800;
        } else if (isTop5) {
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
            kOsc.frequency.setValueAtTime(82, t);
            kOsc.frequency.exponentialRampToValueAtTime(40, t + 0.09);
            kGain.gain.setValueAtTime(this.bgVolume * 0.30, t);
            kGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
            kOsc.start(t);
            kOsc.stop(t + 0.14);
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
              snGain.gain.setValueAtTime(this.bgVolume * 0.12, t);
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
          const arpMidi = arpLead[barStep];
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
}

export const pointsAudio = new PointsAudioManager();
if (typeof window !== 'undefined') {
  window.pointsAudio = pointsAudio;
}
