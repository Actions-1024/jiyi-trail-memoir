// A tiny generative ambient bed, synthesised in the browser. No samples, no
// licensing, no network. It is intentionally quiet and slow so the places and
// memories in the video remain the focus.
const SCORE_STYLES = {
  dawn: {
    chords: [
      [146.83, 220.0, 293.66, 369.99],
      [123.47, 185.0, 246.94, 293.66],
      [98.0, 146.83, 196.0, 246.94],
      [110.0, 164.81, 220.0, 277.18],
    ],
    segment: 8,
    windGain: 0.07,
    windFilter: 420,
    chordGain: 0.035,
    chordFilter: 900,
    pluckScale: [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66],
    pluckPattern: [0, 2, 4, 3, 1, 4, 2, 5, 3, 1, 2, 0],
    pluckStep: 1.65,
    pluckGain: 0.032,
  },
  forest: {
    chords: [
      [164.81, 246.94, 329.63, 415.30],
      [146.83, 220.0, 293.66, 369.99],
      [130.81, 196.0, 261.63, 329.63],
      [174.61, 261.63, 349.23, 440.0],
    ],
    segment: 6,
    windGain: 0.045,
    windFilter: 560,
    chordGain: 0.03,
    chordFilter: 1150,
    pluckScale: [659.25, 739.99, 880.0, 987.77, 1174.66, 1318.51],
    pluckPattern: [0, 2, 4, 5, 3, 1, 2, 4, 3, 5, 1, 0],
    pluckStep: 1.08,
    pluckGain: 0.028,
  },
  night: {
    chords: [
      [110.0, 164.81, 220.0, 277.18],
      [98.0, 146.83, 196.0, 246.94],
      [87.31, 130.81, 174.61, 220.0],
      [103.83, 155.56, 207.65, 261.63],
    ],
    segment: 10,
    windGain: 0.055,
    windFilter: 300,
    chordGain: 0.032,
    chordFilter: 680,
    pluckScale: [440.0, 523.25, 587.33, 659.25, 783.99, 880.0],
    pluckPattern: [0, 3, 5, 2, 4, 1],
    pluckStep: 2.55,
    pluckGain: 0.024,
  },
};

export class AmbientScore {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.stream = null;
    this.nodes = [];
    this.scoreStyle = SCORE_STYLES.dawn;
  }

  static isSupported() {
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  async start(duration = 30, style = 'dawn') {
    this.scoreStyle = SCORE_STYLES[style] || SCORE_STYLES.dawn;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    this.ctx = new AudioContextClass();
    try {
      await this.ctx.resume();
    } catch {
      // It will be resumed by the click that triggered the export in most cases.
    }
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.06;
    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.22, now + 1.2);
    this.master.gain.setValueAtTime(0.22, now + Math.max(1.2, duration - 2.4));
    this.master.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 24;
    compressor.ratio.value = 3;
    const streamDest = ctx.createMediaStreamDestination();
    this.master.connect(compressor);
    compressor.connect(streamDest);
    compressor.connect(ctx.destination);
    this.stream = streamDest.stream;

    this._wind(now, duration);
    this._chords(now, duration);
    this._plucks(now, duration);
    return this.stream;
  }

  _wind(now, duration) {
    const ctx = this.ctx;
    const length = Math.ceil(ctx.sampleRate * 4);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[i] = last * 0.5;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.scoreStyle.windFilter;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(this.scoreStyle.windGain, now + 3);
    gain.gain.setValueAtTime(this.scoreStyle.windGain, now + Math.max(3, duration - 2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + duration + 0.2);
    this.nodes.push(source);
  }

  _chords(now, duration) {
    const ctx = this.ctx;
    const progression = this.scoreStyle.chords;
    const segment = this.scoreStyle.segment;
    for (let time = 0, i = 0; time < duration; time += segment, i++) {
      const chord = progression[i % progression.length];
      const start = now + time;
      const length = Math.min(segment + 2.5, duration - time + 1.2);
      chord.forEach((freq, voice) => {
        const osc = ctx.createOscillator();
        osc.type = voice === 0 ? 'sine' : voice === 1 ? 'triangle' : 'sine';
        osc.frequency.value = freq;
        osc.detune.value = (voice - 1.5) * 4;
        const gain = ctx.createGain();
        const voiceGain = this.scoreStyle.chordGain / (1 + voice * 0.28);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(voiceGain, start + 2.2);
        gain.gain.setValueAtTime(voiceGain, start + length * 0.58);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = this.scoreStyle.chordFilter + voice * 220;
        osc.connect(filter).connect(gain).connect(this.master);
        osc.start(start);
        osc.stop(start + length + 0.1);
        this.nodes.push(osc);
      });
    }
  }

  _plucks(now, duration) {
    const ctx = this.ctx;
    const pentatonic = this.scoreStyle.pluckScale;
    const pattern = this.scoreStyle.pluckPattern;
    for (let time = 1.4, i = 0; time < duration - 1.8; time += this.scoreStyle.pluckStep, i++) {
      const freq = pentatonic[pattern[i % pattern.length]];
      const start = now + time;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(this.scoreStyle.pluckGain, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 2.2);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2400;
      osc.connect(filter).connect(gain).connect(this.master);
      osc.start(start);
      osc.stop(start + 2.4);
      this.nodes.push(osc);
    }
  }

  async stop() {
    try {
      if (this.master && this.ctx) {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
        this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      }
      await new Promise((resolve) => setTimeout(resolve, 330));
      await this.ctx?.close();
    } catch {
      // Already closed.
    }
    this.ctx = null;
    this.stream = null;
    this.nodes = [];
  }
}
