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

  // 1. Gentle pop/chime on +1 comment vote
  playVoteChime() {
    if (this.muted) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, this.ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.08); // A5

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.1);
    } catch (e) {}
  }

  // 2. High energy chime on combo streak
  playStreakChime() {
    if (this.muted) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      [880, 1174.66].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);

        gain.gain.setValueAtTime(0.12, now + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.15);
      });
    } catch (e) {}
  }

  // 3. Energetic whoosh when #1 position changes (Overtake)
  playOvertakeChime() {
    if (this.muted) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);

        gain.gain.setValueAtTime(0.15, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.22);
      });
    } catch (e) {}
  }

  // 3b. Triumphant fanfare when a Team/Country QUALIFIES
  playQualifierChime() {
    if (this.muted) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);

        gain.gain.setValueAtTime(0.18, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.38);
      });
    } catch (e) {}
  }

  // 4. Golden register chord for Super Chat
  playSuperChatFanfare() {
    if (this.muted) return;
    try {
      this._initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const chord = [523.25, 659.25, 783.99, 1046.5, 1318.51]; // C Major
      chord.forEach(freq => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.65);
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

      // Energetic Dopamine Chord Progression (Am - F - C - G)
      const bassRoots = [
        33, 33, 45, 33,  33, 33, 45, 33,  33, 33, 45, 33,  33, 33, 45, 43, // Am
        29, 29, 41, 29,  29, 29, 41, 29,  29, 29, 41, 29,  29, 29, 41, 40, // F
        36, 36, 48, 36,  36, 36, 48, 36,  36, 36, 48, 36,  36, 36, 48, 47, // C
        31, 31, 43, 31,  31, 31, 43, 31,  31, 31, 43, 31,  31, 31, 43, 41  // G
      ];

      const arpLead = [
        69, 72, 76, 81,  76, 72, 81, 76,  69, 72, 76, 81,  84, 81, 76, 72,
        65, 69, 72, 77,  72, 69, 77, 72,  65, 69, 72, 77,  81, 77, 72, 69,
        60, 64, 67, 72,  67, 64, 72, 67,  60, 64, 67, 72,  76, 72, 67, 64,
        67, 71, 74, 79,  74, 71, 79, 74,  67, 71, 74, 79,  83, 79, 74, 71
      ];

      const m2f = (m) => 440 * Math.pow(2, (m - 69) / 12);
      let step = 0;
      let nextNoteTime = ctx.currentTime + 0.08;

      this._scheduler = () => {
        if (!this._proceduralActive || this.muted || !this.musicEnabled) return;

        let bpm = 126;
        let filterCutoff = 1600;
        const isShowdown = this._musicStage === 'showdown';
        const isTop5 = this._musicStage === 'top5' || isShowdown;

        if (isShowdown) {
          bpm = 138;
          filterCutoff = 4200;
        } else if (isTop5) {
          bpm = 132;
          filterCutoff = 2600;
        }

        const stepTime = (60 / bpm) / 4;

        while (nextNoteTime < ctx.currentTime + 0.16) {
          const t = nextNoteTime;
          const barStep = step % 64;
          const beat16 = step % 16;
          const isQuarter = beat16 % 4 === 0;

          // 1. Kick (4-on-the-floor)
          if (isQuarter) {
            const kOsc = ctx.createOscillator();
            const kGain = ctx.createGain();
            kOsc.connect(kGain);
            kGain.connect(ctx.destination);
            kOsc.frequency.setValueAtTime(isShowdown ? 150 : 135, t);
            kOsc.frequency.exponentialRampToValueAtTime(36, t + 0.085);
            kGain.gain.setValueAtTime(this.bgVolume * (isShowdown ? 0.42 : 0.35), t);
            kGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
            kOsc.start(t);
            kOsc.stop(t + 0.095);
          }

          // 2. Snare / Clap
          if (beat16 === 4 || beat16 === 12) {
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
              snGain.gain.setValueAtTime(this.bgVolume * 0.18, t);
              snGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
              snNode.start(t);
              snNode.stop(t + 0.125);
            }
          }

          // 3. Hi-Hats
          if (this._noiseBuffer) {
            const isOffbeat = beat16 % 4 === 2;
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
              ohGain.gain.setValueAtTime(this.bgVolume * 0.08, t);
              ohGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
              ohNode.start(t);
              ohNode.stop(t + 0.115);
            }
          }

          // 4. Synthwave Bass
          const bassMidi = bassRoots[barStep];
          if (bassMidi) {
            const bOsc = ctx.createOscillator();
            const bFilter = ctx.createBiquadFilter();
            const bGain = ctx.createGain();
            bOsc.type = 'sawtooth';
            bOsc.frequency.setValueAtTime(m2f(bassMidi), t);
            bFilter.type = 'lowpass';
            bFilter.frequency.setValueAtTime(isQuarter ? 480 : 880, t);
            bFilter.Q.value = 2.8;
            bOsc.connect(bFilter);
            bFilter.connect(bGain);
            bGain.connect(ctx.destination);
            const bassVol = isQuarter ? this.bgVolume * 0.09 : this.bgVolume * 0.18;
            bGain.gain.setValueAtTime(bassVol, t);
            bGain.gain.exponentialRampToValueAtTime(0.005, t + stepTime * 0.88);
            bOsc.start(t);
            bOsc.stop(t + stepTime * 0.9);
          }

          // 5. Arpeggio Lead
          const arpMidi = arpLead[barStep];
          if (arpMidi) {
            const lOsc = ctx.createOscillator();
            const lFilter = ctx.createBiquadFilter();
            const lGain = ctx.createGain();
            lOsc.type = 'square';
            lOsc.frequency.setValueAtTime(m2f(arpMidi), t);
            lFilter.type = 'lowpass';
            lFilter.frequency.setValueAtTime(filterCutoff, t);
            lFilter.Q.value = 2.0;
            lOsc.connect(lFilter);
            lFilter.connect(lGain);
            lGain.connect(ctx.destination);
            const arpVol = isShowdown ? this.bgVolume * 0.10 : this.bgVolume * 0.07;
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
}

export const pointsAudio = new PointsAudioManager();
if (typeof window !== 'undefined') {
  window.pointsAudio = pointsAudio;
}
