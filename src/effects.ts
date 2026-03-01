declare const Tone: any;

// ── Newtypes for numeric types ────────────────────────────────────────────────────

declare const _pct: unique symbol;
type Percentage = number & { readonly [_pct]: void };  // 0–100, fraction of buffer length/dimensions

declare const _db: unique symbol;
type Decibels = number & { readonly [_db]: void };     // amplitude on dB scale

declare const _wet: unique symbol;
type Wet = number & { readonly [_wet]: void };         // 0–1 linear mix ratio

declare const _hz: unique symbol;
type Frequency = number & { readonly [_hz]: void };    // Hz

// ── Interface ───────────────────────────────────────────────────────────────

interface IGlitchBuffer {
  width: number;
  height: number;
  bitcrush(bits: number): this;
  noise(amount: Decibels): this;
  reverse(): this;
  echo(delay: Percentage, gainDb: Decibels): this;
  reverb(roomSize: number, dampening: Frequency, wet: Wet): Promise<this>;
  rescale(newWidth: number, newHeight?: number): Promise<this>;
  select(start: Percentage, end: Percentage, fn: (sub: IGlitchBuffer) => Promise<void>): Promise<this>;
  copy(srcStart: Percentage, srcEnd: Percentage, dstStart: Percentage): this;
  tremolo(rate: number, depth: number): this;
  distort(drive: number): this;
  chorus(rate: number, depth: Percentage, wet: Wet): this;
  pitchShift(semitones: number): Promise<this>;
  phaser(frequency: Frequency, octaves: number, baseFrequency: Frequency, wet: Wet): Promise<this>;
  frequencyShift(frequency: Frequency, wet: Wet): Promise<this>;
  vibrato(frequency: Frequency, depth: number, wet: Wet): Promise<this>;
  chebyshev(order: number, wet: Wet): Promise<this>;
  autowah(baseFrequency: Frequency, octaves: number, sensitivity: Decibels, wet: Wet): Promise<this>;
  feedbackDelay(delayTime: Percentage, feedback: number, wet: Wet): Promise<this>;
  sort(threshold: Percentage): this;
  sortvertical(threshold: Percentage): this;
  smear(amount: Percentage, decay: number): this;
  xor(value: number): this;
  invert(): this;
  shuffle(amount: Percentage): this;
  transpose(ch: number, dx: Percentage, dy: Percentage): this;
  quantize(levels: number): this;
  fold(drive: number): this;
  solarize(threshold: number): this;
  channel(ch: number, fn: (sub: IGlitchBuffer) => Promise<void>): Promise<this>;
  mix(wet: Wet, fn: (buf: IGlitchBuffer) => Promise<void>): Promise<this>;
}

// ── Image conversion ────────────────────────────────────────────────────────

function rgbaToGlitch(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const buf = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    buf[i * 3] = data[i * 4];     // R
    buf[i * 3 + 1] = data[i * 4 + 1]; // G
    buf[i * 3 + 2] = data[i * 4 + 2]; // B
  }
  return buf;
}

function glitchToRgba(buf: Uint8Array, width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = buf[i * 3];     // R
    out[i * 4 + 1] = buf[i * 3 + 1]; // G
    out[i * 4 + 2] = buf[i * 3 + 2]; // B
    out[i * 4 + 3] = 255;
  }
  return out;
}

// Convert a 0–100 percentage to an integer index within a buffer of given length.
function pct(p: number, len: number): number {
  return Math.floor(p / 100 * len);
}

// Round a float to the nearest integer and clamp to the byte range [0, 255].
function clamp8(v: number): number {
  const r = (v + 0.5) | 0;
  return r < 0 ? 0 : r > 255 ? 255 : r;
}

// Convert a decibel value to a linear amplitude multiplier.
function dbToLin(db: number): number {
  return Math.pow(10, db / 20);
}

// ── GlitchBuffer ────────────────────────────────────────────────────────────

class GlitchBuffer implements IGlitchBuffer {
  data: Uint8Array;
  width: number;
  height: number;
  private rand: () => number;

  constructor(data: Uint8Array, width: number, height: number, rand: () => number = Math.random) {
    this.data = data;
    this.width = width;
    this.height = height;
    this.rand = rand;
  }

  async select(start: Percentage, end: Percentage, fn: (sub: GlitchBuffer) => Promise<void>): Promise<this> {
    const len = this.data.length;
    // subarray() is a zero-copy view — writes go directly into the parent buffer.
    // width/height aren't meaningful for a 1D slice; rescale inside select is unsupported.
    const sub = new GlitchBuffer(this.data.subarray(pct(start, len), pct(end, len)), 0, 0, this.rand);
    await fn(sub);
    return this;
  }

  async rescale(newWidth: number, newHeight = Math.round(newWidth * this.height / this.width)): Promise<this> {
    const src = new OffscreenCanvas(this.width, this.height);
    src.getContext('2d')!.putImageData(
      new ImageData(glitchToRgba(this.data, this.width, this.height), this.width, this.height), 0, 0);

    const dst = new OffscreenCanvas(newWidth, newHeight);
    dst.getContext('2d')!.drawImage(src, 0, 0, newWidth, newHeight);

    const dstData = dst.getContext('2d')!.getImageData(0, 0, newWidth, newHeight);
    this.data = rgbaToGlitch(dstData.data, newWidth, newHeight);
    this.width = newWidth;
    this.height = newHeight;
    return this;
  }

  // Shared pipeline for all Tone.js effects: bytes↔floats + Tone.Offline render.
  // buildFx is called inside the Offline context and must return an unconnected Tone node.
  private async toneProcess(extraDuration: number, buildFx: () => any): Promise<this> {
    const sampleRate = 44100;
    const len = this.data.length;
    const duration = len / sampleRate;

    const samples = new Float32Array(len);
    for (let i = 0; i < len; i++) samples[i] = this.data[i] / 127.5 - 1;

    const srcBuffer = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate });
    srcBuffer.copyToChannel(samples, 0);

    const rendered = await Tone.Offline(({ transport }: any) => {
      const fx = buildFx().toDestination();
      const player = new Tone.Player(new Tone.ToneAudioBuffer(srcBuffer));
      player.connect(fx);
      player.start(0);
      transport.start(0);
    }, duration + extraDuration);

    const out = rendered.getChannelData(0);
    for (let i = 0; i < len; i++) this.data[i] = clamp8((out[i] + 1) * 127.5);

    return this;
  }

  async reverb(roomSize: number, dampening: Frequency, wet: Wet): Promise<this> {
    return this.toneProcess(1.0, () => new Tone.Freeverb({ roomSize, dampening, wet }));
  }

  reverse(): this {
    this.data.reverse();
    return this;
  }

  copy(srcStart: Percentage, srcEnd: Percentage, dstStart: Percentage): this {
    const len = this.data.length;
    const src = pct(srcStart, len);
    const srcE = pct(srcEnd, len);
    const dst = pct(dstStart, len);
    const chunk = this.data.slice(src, srcE);
    this.data.set(chunk.subarray(0, Math.min(chunk.length, len - dst)), dst);
    return this;
  }

  bitcrush(bits: number): this {
    // step is always a power of 2, so masking beats float division/multiply.
    const mask = 0xFF & ~((1 << (8 - bits)) - 1);
    for (let i = 0; i < this.data.length; i++) this.data[i] &= mask;
    return this;
  }

  noise(db: Decibels): this {
    const amplitude = 255 * dbToLin(db);
    for (let i = 0; i < this.data.length; i++)
      this.data[i] = clamp8(this.data[i] + ((this.rand() * 2 - 1) + (this.rand() * 2 - 1)) * 0.5 * amplitude);
    return this;
  }

  echo(delay: Percentage, gainDb: Decibels): this {
    const len = this.data.length;
    const d = pct(delay, len);
    const gain = dbToLin(gainDb);
    for (let i = 0; i < len - d; i++)
      this.data[i + d] = clamp8(this.data[i + d] + gain * this.data[i]);
    return this;
  }

  // Sinusoidal amplitude modulation. rate = oscillation count across buffer.
  // depth 0–1: how deeply the LFO dips (0 = no effect, 1 = full tremolo).
  tremolo(rate: number, depth: number): this {
    const len = this.data.length;
    for (let i = 0; i < len; i++) {
      const lfo = 1 - depth * 0.5 * (1 - Math.sin(2 * Math.PI * rate * i / len));
      this.data[i] = clamp8((this.data[i] - 127.5) * lfo + 127.5);
    }
    return this;
  }

  // Soft-clip via tanh. drive > 1 saturates; ~1 = clean, ~10 = heavy crunch.
  distort(drive: number): this {
    for (let i = 0; i < this.data.length; i++) {
      const x = this.data[i] / 127.5 - 1;
      this.data[i] = ((Math.tanh(x * drive) + 1) * 127.5 + 0.5) | 0;
    }
    return this;
  }

  // Mix original with an LFO-time-shifted copy. rate = LFO oscillations,
  // depth = modulation width as fraction of buffer, wet = 0–1 mix.
  chorus(rate: number, depth: Percentage, wet: Wet): this {
    const len = this.data.length;
    const orig = this.data.slice();
    const halfDepth = Math.floor(depth * len * 0.0001);
    for (let i = 0; i < len; i++) {
      const offset = Math.round(halfDepth * Math.sin(2 * Math.PI * rate * i / len));
      const j = i + offset;
      const sample = (j >= 0 && j < len) ? orig[j] : orig[i];
      this.data[i] = clamp8(orig[i] * (1 - wet) + sample * wet);
    }
    return this;
  }

  invert(): this {
    for (let i = 0; i < this.data.length; i++) this.data[i] = 255 - this.data[i];
    return this;
  }

  // Shift one RGB channel by (dx, dy) as 0–100 percentages of width/height. Wraps toroidally.
  transpose(ch: number, dx: Percentage, dy: Percentage): this {
    const { width, height } = this;
    if (!width || !height) return this;
    const offX = Math.round(dx / 100 * width);
    const offY = Math.round(dy / 100 * height);
    const orig = this.data.slice();
    for (let srcY = 0; srcY < height; srcY++) {
      const py = ((srcY + offY) % height + height) % height;
      for (let srcX = 0; srcX < width; srcX++) {
        const px = ((srcX + offX) % width + width) % width;
        this.data[(py * width + px) * 3 + ch] = orig[(srcY * width + srcX) * 3 + ch];
      }
    }
    return this;
  }

  // amount: 0–100 percentage of total pixels to swap. Swaps whole RGB pixels.
  shuffle(amount: Percentage): this {
    const pixels = Math.floor(this.data.length / 3);
    const swaps = pct(amount, pixels);
    for (let i = 0; i < swaps; i++) {
      const a = Math.floor(this.rand() * pixels) * 3;
      const b = Math.floor(this.rand() * pixels) * 3;
      for (let c = 0; c < 3; c++) {
        const tmp = this.data[a + c]; this.data[a + c] = this.data[b + c]; this.data[b + c] = tmp;
      }
    }
    return this;
  }

  // Quantize to n discrete levels (evenly spaced across 0–255).
  quantize(levels: number): this {
    const n = Math.max(2, Math.floor(levels));
    const step = 255 / (n - 1);
    for (let i = 0; i < this.data.length; i++) {
      this.data[i] = Math.round(Math.round(this.data[i] / step) * step);
    }
    return this;
  }

  // Wavefolder: reflects values at 0 and 255 boundaries.
  // drive ≤ 0.5 = passthrough, ~1 = one full fold, higher = multiple folds.
  fold(drive: number): this {
    for (let i = 0; i < this.data.length; i++) {
      let v = (this.data[i] / 255) * drive;
      v = v - Math.floor(v); // fractional part → triangle wave fold
      if (v > 0.5) v = 1 - v;
      this.data[i] = Math.round(v * 2 * 255);
    }
    return this;
  }

  // Solarize: invert bytes above threshold (0–1 fraction of 255).
  solarize(threshold: number): this {
    const t = Math.round(threshold * 255);
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] > t) this.data[i] = 255 - this.data[i];
    }
    return this;
  }

  private luma(idx: number): number {
    return (this.data[idx * 3] * 77 + this.data[idx * 3 + 1] * 150 + this.data[idx * 3 + 2] * 29) >> 8;
  }

  private sortRun(run: number[]): void {
    if (run.length < 2) return;
    const px = run.map(i => ({ r: this.data[i * 3], g: this.data[i * 3 + 1], b: this.data[i * 3 + 2], l: this.luma(i) }));
    px.sort((a, b) => a.l - b.l);
    for (let k = 0; k < run.length; k++) {
      this.data[run[k] * 3] = px[k].r;
      this.data[run[k] * 3 + 1] = px[k].g;
      this.data[run[k] * 3 + 2] = px[k].b;
    }
  }

  // Sort pixels by luma within rows. Runs above threshold (positive) or below abs(threshold) (negative).
  sort(threshold: Percentage): this {
    const { width, height } = this;
    if (!width || !height) return this;
    const t = Math.abs(threshold) / 100 * 255;
    const above = threshold >= 0;
    for (let y = 0; y < height; y++) {
      let run: number[] = [];
      for (let x = 0; x <= width; x++) {
        const idx = y * width + x;
        const in_ = x < width && (above ? this.luma(idx) >= t : this.luma(idx) < t);
        if (in_) { run.push(idx); } else { this.sortRun(run); run = []; }
      }
    }
    return this;
  }

  // Sort pixels by luma within columns. Threshold sign works the same as sort.
  sortvertical(threshold: Percentage): this {
    const { width, height } = this;
    if (!width || !height) return this;
    const t = Math.abs(threshold) / 100 * 255;
    const above = threshold >= 0;
    for (let x = 0; x < width; x++) {
      let run: number[] = [];
      for (let y = 0; y <= height; y++) {
        const idx = y * width + x;
        const in_ = y < height && (above ? this.luma(idx) >= t : this.luma(idx) < t);
        if (in_) { run.push(idx); } else { this.sortRun(run); run = []; }
      }
    }
    return this;
  }

  // Peak-follower smear: propagate the running maximum forward with exponential decay, per channel.
  // amount: smear length as % of pixel count; decay: fraction remaining at that distance (0 = no smear, 1 = hold forever).
  smear(amount: Percentage, decay: number): this {
    const len = this.data.length;
    const steps = Math.max(1, pct(amount, Math.floor(len / 3)));
    const perStep = Math.pow(decay, 1 / steps);
    for (let ch = 0; ch < 3; ch++) {
      let run = 0;
      for (let i = ch; i < len; i += 3) {
        run = Math.max(this.data[i], run * perStep);
        this.data[i] = (run + 0.5) | 0;
      }
    }
    return this;
  }

  // XOR every byte against a fixed value (0–255). xor 85 / xor 170 give structured bit patterns.
  xor(value: number): this {
    for (let i = 0; i < this.data.length; i++) this.data[i] ^= value;
    return this;
  }

  // Extract one RGB channel (0=R 1=G 2=B) into a contiguous sub-buffer,
  // apply fn, then write back — same pattern as select.
  async channel(ch: number, fn: (sub: GlitchBuffer) => Promise<void>): Promise<this> {
    const count = Math.floor(this.data.length / 3);
    const extracted = new Uint8Array(count);
    for (let i = 0; i < count; i++) extracted[i] = this.data[i * 3 + ch];
    const sub = new GlitchBuffer(extracted, 0, 0, this.rand);
    await fn(sub);
    for (let i = 0; i < count; i++) this.data[i * 3 + ch] = extracted[i];
    return this;
  }

  // Snapshot → evaluate fn → blend result back at wet ratio.
  async mix(wet: Wet, fn: (buf: GlitchBuffer) => Promise<void>): Promise<this> {
    const snapshot = this.data.slice();
    await fn(this);
    const len = Math.min(snapshot.length, this.data.length);
    for (let i = 0; i < len; i++)
      this.data[i] = (snapshot[i] * (1 - wet) + this.data[i] * wet + 0.5) | 0;
    return this;
  }

  // Tone.js Phaser — all-pass filter cascade swept by an LFO.
  // frequency: LFO rate in Hz, octaves: sweep width, baseFrequency: center Hz, wet: 0–1.
  async phaser(frequency: Frequency, octaves: number, baseFrequency: Frequency, wet: Wet): Promise<this> {
    return this.toneProcess(0.1, () => new Tone.Phaser({ frequency, octaves, baseFrequency, wet }));
  }

  // Tone.js FrequencyShifter — shifts all frequencies up or down by a fixed Hz amount.
  // frequency: Hz shift (positive = up, negative = down), wet: 0–1.
  async frequencyShift(frequency: Frequency, wet: Wet): Promise<this> {
    return this.toneProcess(0.1, () => new Tone.FrequencyShifter({ frequency, wet }));
  }

  // Tone.js Vibrato — LFO pitch wobble via delay modulation.
  // frequency: LFO rate in Hz, depth: modulation amount 0–1, wet: 0–1.
  async vibrato(frequency: Frequency, depth: number, wet: Wet): Promise<this> {
    return this.toneProcess(0.1, () => new Tone.Vibrato({ frequency, depth, wet }));
  }

  // Tone.js Chebyshev waveshaper — adds nth-order harmonics. order 1 = clean, ~50 = harsh.
  async chebyshev(order: number, wet: Wet): Promise<this> {
    return this.toneProcess(0.1, () => new Tone.Chebyshev({ order, wet }));
  }

  // Tone.js AutoWah — envelope follower sweeps a bandpass filter.
  // baseFrequency: center Hz, octaves: sweep range, sensitivity: follower threshold dB, wet: 0–1.
  async autowah(baseFrequency: Frequency, octaves: number, sensitivity: Decibels, wet: Wet): Promise<this> {
    return this.toneProcess(0.1, () => new Tone.AutoWah({ baseFrequency, octaves, sensitivity, wet }));
  }

  // Tone.js FeedbackDelay — delay with a recirculating feedback loop.
  // delayTime: 0–100% of buffer length converted to seconds, feedback: 0–1, wet: 0–1.
  async feedbackDelay(delayTime: Percentage, feedback: number, wet: Wet): Promise<this> {
    const delaySeconds = pct(delayTime, this.data.length) / 44100;
    return this.toneProcess(2.0, () => new Tone.FeedbackDelay({ delayTime: delaySeconds, feedback, wet }));
  }

  // Tone.js PitchShift — time-preserving pitch shift. semitones: e.g. -12 to 12.
  async pitchShift(semitones: number): Promise<this> {
    return this.toneProcess(0.5, () => new Tone.PitchShift(semitones)); // extra headroom for lookahead
  }
}
