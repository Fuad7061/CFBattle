// Ultra-lightweight Web Audio API & Speech Synthesis Engine for Multiverse Hero Tournament
// Uses 0 MB external audio downloads; 100% procedurally synthesized in the browser.

class HeroAudioEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.volume = 0.55;
    this.speechEnabled = true;
    this.lastSpeechTime = 0;
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    } catch (e) {
      console.warn('[HeroAudio] Web Audio not supported:', e);
    }
  }

  ensureContext() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, Number(vol) || 0.5));
  }

  setMuted(muted) {
    this.isMuted = !!muted;
  }

  setSpeechEnabled(enabled) {
    this.speechEnabled = !!enabled;
  }

  // 1. Hero Power Boost Laser/Punch Sound (Short, punchy, high-frequency comic zap)
  playBoost(heroColor = '#ef4444') {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = 'triangle';
      // Pitch drop from 520Hz to 160Hz gives comic laser punch feel
      osc.frequency.setValueAtTime(540, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.08);

      gain.gain.setValueAtTime(this.volume * 0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) {}
  }

  // 2. SuperChat / Major Boost Chime (Harmonic triple arpeggio)
  playSuperBoost() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    try {
      const notes = [440, 554.37, 659.25, 880]; // A Major chord
      const now = this.ctx.currentTime;

      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + idx * 0.05;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(this.volume * 0.5, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.25);
      });
    } catch (e) {}
  }

  // 3. Qualifier Gate Bell (Metallic high-tension notification chime)
  playQualifiedBell() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    try {
      const freqs = [880, 1108.73, 1318.51];
      const now = this.ctx.currentTime;

      freqs.forEach(freq => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(this.volume * 0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.6);
      });
    } catch (e) {}
  }

  // 4. Teamup Synergy Gong (Resonant energy burst)
  playTeamupGong() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(360, now + 0.3);

      gain.gain.setValueAtTime(this.volume * 0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.7);
    } catch (e) {}
  }

  // 5. Championship Victory Fanfare (Heroic multi-bar victory triumph)
  playVictoryFanfare() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    try {
      // Fanfare notes: C4, E4, G4, C5, G4, C5
      const notes = [
        { f: 261.63, t: 0.0, d: 0.15 },
        { f: 329.63, t: 0.15, d: 0.15 },
        { f: 392.00, t: 0.30, d: 0.20 },
        { f: 523.25, t: 0.50, d: 0.55 },
        { f: 392.00, t: 1.05, d: 0.20 },
        { f: 523.25, t: 1.25, d: 0.90 }
      ];

      const now = this.ctx.currentTime;
      notes.forEach(({ f, t, d }) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + t;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, startTime);

        gain.gain.setValueAtTime(this.volume * 0.65, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + d);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + d);
      });
    } catch (e) {}
  }

  // 6. Built-in Voice Announcer (SpeechSynthesis)
  speak(text) {
    if (!this.speechEnabled || this.isMuted) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    // Throttle voice announcer so utterances do not pile up
    const now = Date.now();
    if (now - this.lastSpeechTime < 2800) return;
    this.lastSpeechTime = now;

    try {
      window.speechSynthesis.cancel(); // Clear backlog
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.volume = Math.min(1, this.volume * 1.2);
      utterance.lang = 'en-US';

      // Pick an energetic voice if available
      const voices = window.speechSynthesis.getVoices();
      const engVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha')));
      if (engVoice) utterance.voice = engVoice;

      window.speechSynthesis.speak(utterance);
    } catch (e) {}
  }
}

export const heroAudio = new HeroAudioEngine();
