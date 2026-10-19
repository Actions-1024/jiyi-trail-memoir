// A tiny generative ambient bed, synthesised in the browser. No samples, no
// licensing, no network. It is intentionally quiet and slow so the places and
// memories in the video remain the focus.
export class AmbientScore {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.stream = null;
    this.nodes = [];
  }

  static isSupported() {
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  async start(duration = 30) {
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
    filter.frequency.value = 420;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 3);
    gain.gain.setValueAtTime(0.07, now + Math.max(3, duration - 2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + duration + 0.2);
    this.nodes.push(source);
  }

  _chords(now, duration) {
    const ctx = this.ctx;
    const progression = [
      [146.83, 220.0, 293.66, 369.99],
      [123.47, 185.0, 246.94, 293.66],
      [98.0, 146.83, 196.0, 246.94],
      [110.0, 164.81, 220.0, 277.18],
    ];
    const segment = 8;
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
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.035 / (1 + voice * 0.28), start + 2.2);
        gain.gain.setValueAtTime(0.035 / (1 + voice * 0.28), start + length * 0.58);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900 + voice * 220;
        osc.connect(filter).connect(gain).connect(this.master);
        osc.start(start);
        osc.stop(start + length + 0.1);
        this.nodes.push(osc);
      });
    }
  }

  _plucks(now, duration) {
    const ctx = this.ctx;
    const pentatonic = [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66];
    const pattern = [0, 2, 4, 3, 1, 4, 2, 5, 3, 1, 2, 0];
    for (let time = 1.4, i = 0; time < duration - 1.8; time += 1.65, i++) {
      const freq = pentatonic[pattern[i % pattern.length]];
      const start = now + time;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.032, start + 0.018);
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
