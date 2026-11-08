// Short synthesized sound effects with the Web Audio API. Vector Pinball's own sounds aren't used
// until their license is confirmed (spec, open question 1).
// Part of a JS port of Vector Pinball (https://github.com/dozingcat/Vector-Pinball), GPL-3.0-only.

const MUTE_KEY = 'pinball-muted';
const BUMPER_NOTES = [523.25, 587.33, 659.25, 783.99, 880];

function loadMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export class Audio {
  constructor() {
    this.muted = loadMuted();
    this.ctx = null;
  }

  // Browsers only allow sound after the player has tapped or pressed a key.
  unlock() {
    if (this.ctx) return;
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (AudioContext) this.ctx = new AudioContext();
  }

  setMuted(muted) {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Storage blocked: the setting just isn't remembered.
    }
  }

  tone(freq, ms, { type = 'sine', volume = 0.15, slideTo = null, delay = 0 } = {}) {
    const { ctx } = this;
    const start = ctx.currentTime + delay / 1000;
    const end = start + ms / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, end);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end);
  }

  play(name) {
    if (this.muted || !this.ctx) return;
    switch (name) {
      case 'score':
        this.tone(BUMPER_NOTES[Math.floor(Math.random() * BUMPER_NOTES.length)], 140, { type: 'triangle' });
        break;
      case 'flipper':
        this.tone(140, 50, { type: 'square', volume: 0.06, slideTo: 70 });
        break;
      case 'rollover':
        this.tone(1320, 70, { volume: 0.08 });
        break;
      case 'launch':
        this.tone(180, 300, { type: 'sawtooth', volume: 0.06, slideTo: 720 });
        break;
      case 'nudge':
        this.tone(90, 80, { type: 'square', volume: 0.08 });
        break;
      case 'message':
        this.tone(660, 90, { volume: 0.08 });
        this.tone(990, 120, { volume: 0.08, delay: 90 });
        break;
      case 'ballLost':
        this.tone(330, 400, { type: 'triangle', volume: 0.1, slideTo: 110 });
        break;
      case 'gameOver':
        [523.25, 392, 329.63, 261.63].forEach((f, i) => this.tone(f, 220, { type: 'triangle', volume: 0.1, delay: i * 200 }));
        break;
    }
  }
}
