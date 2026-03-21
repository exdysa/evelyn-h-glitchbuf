import {
  Offline,
  Player,
  ToneAudioBuffer,
  Freeverb,
  Phaser,
  FrequencyShifter,
  Vibrato,
  Chebyshev,
  AutoWah,
  FeedbackDelay,
  PitchShift,
  Filter,
} from 'tone';

const SAMPLE_RATE = 44100;

// ── Newtypes for numeric types ────────────────────────────────────────────────────

declare const _pct: unique symbol;
export type Percentage = number & { readonly [_pct]: void }; // 0–100, fraction of buffer length/dimensions

declare const _db: unique symbol;
export type Decibels = number & { readonly [_db]: void }; // amplitude on dB scale

declare const _wet: unique symbol;
export type Wet = number & { readonly [_wet]: void }; // 0–1 linear mix ratio

declare const _hz: unique symbol;
export type Frequency = number & { readonly [_hz]: void }; // Hz

// ── Interface ───────────────────────────────────────────────────────────────

export interface IGlitchBuffer {
  width: number;
  height: number;
  bitcrush(bits: number): this;
  noise(amount: Decibels): this;
  reverse(): this;
  echo(delay: Percentage, gainDb: Decibels): this;
  reverb(roomSize: number, dampening: Frequency): Promise<this>;
  rescale(newWidth: number, newHeight?: number): Promise<this>;
  maxsize(px: number): Promise<this>;
  select(
    start: Percentage,
    end: Percentage,
    fn: (sub: IGlitchBuffer) => Promise<void>
  ): Promise<this>;
  copy(srcStart: Percentage, srcEnd: Percentage, dstStart: Percentage): this;
  tremolo(rate: number, depth: number): this;
  saturate(drive: number): this;
  overdrive(drive: number): this;
  chorus(rate: number, depth: Decibels): this;
  pitchShift(semitones: number, feedback?: number): Promise<this>;
  phaser(frequency: Frequency, octaves: number, baseFrequency: Frequency): Promise<this>;
  frequencyShift(frequency: Frequency): Promise<this>;
  vibrato(frequency: Frequency, depth: number): Promise<this>;
  chebyshev(order: number): Promise<this>;
  autowah(baseFrequency: Frequency, octaves: number, sensitivity: Decibels): Promise<this>;
  feedbackDelay(delayTime: Percentage, feedback: number): Promise<this>;
  lowpass(frequency: Frequency, Q: number, rolloff?: number): Promise<this>;
  highpass(frequency: Frequency, Q: number, rolloff?: number): Promise<this>;
  bandpass(frequency: Frequency, Q: number): Promise<this>;
  notch(frequency: Frequency, Q: number): Promise<this>;
  lowshelf(frequency: Frequency, gain: Decibels): Promise<this>;
  highshelf(frequency: Frequency, gain: Decibels): Promise<this>;
  jpeg(quality: number): Promise<this>;
  bayer(levels: number): this;
  diffuse(levels: number): this;
  sort(threshold: Percentage): this;
  smear(amount: Percentage, decay: number): this;
  xor(value: number): this;
  gamma(g: number): this;
  levels(black: number, white: number): this;
  bitrot(prob: number): this;
  resample(factor: number): this;
  invert(): this;
  shuffle(amount: Percentage): this;
  chromashift(ch: number, dx: Percentage, dy: Percentage): this;
  warp(amount: number): this;
  blur(radius: number): this;
  defocus(radius: number): this;
  pixelate(size: number): this;
  polar(): this;
  flip(): this;
  mirror(): this;
  displace(amount: Percentage): this;
  tunnel(
    n: number,
    zoom: number,
    decay: number,
    angle?: number,
    offsetX?: number,
    offsetY?: number
  ): this;
  vignette(strength: number, softness?: number, size?: number): this;
  quantize(levels: number): this;
  fold(drive: number): this;
  solarize(threshold: number): this;
  stutter(size: Percentage, count: number): this;
  scale(factor: number, fn: () => Promise<void>): Promise<this>;
  luma(fn: (sub: IGlitchBuffer) => Promise<void>): Promise<this>;
  channel(ch: number, fn: (sub: IGlitchBuffer) => Promise<void>): Promise<this>;
  transpose(fn: (sub: IGlitchBuffer) => Promise<void>): Promise<this>;
  mix(wet: Wet, fn: (buf: IGlitchBuffer) => Promise<void>): Promise<this>;
}

// ── Image conversion ────────────────────────────────────────────────────────

export function rgbaToGlitch(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const buf = new Uint8Array(width * height * 3);
  let si = 0,
    di = 0;
  while (di < buf.length) {
    buf[di++] = data[si];
    buf[di++] = data[si + 1];
    buf[di++] = data[si + 2];
    si += 4;
  }
  return buf;
}

export function glitchToRgba(
  buf: Uint8Array,
  width: number,
  height: number
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  let si = 0,
    di = 0;
  while (si < buf.length) {
    out[di++] = buf[si++];
    out[di++] = buf[si++];
    out[di++] = buf[si++];
    out[di++] = 255;
  }
  return out;
}

// Convert a 0–100 percentage to an integer index within a buffer of given length.
export function pct(p: number, len: number): number {
  return Math.floor((p / 100) * len);
}

// Round a float to the nearest integer and clamp to the byte range [0, 255].
export function clamp8(v: number): number {
  const r = (v + 0.5) | 0;
  return r < 0 ? 0 : r > 255 ? 255 : r;
}

// Convert a decibel value to a linear amplitude multiplier.
export function dbToLin(db: number): number {
  return Math.pow(10, db / 20);
}

// ── GlitchBuffer ────────────────────────────────────────────────────────────

export class GlitchBuffer implements IGlitchBuffer {
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

  async select(
    start: Percentage,
    end: Percentage,
    fn: (sub: GlitchBuffer) => Promise<void>
  ): Promise<this> {
    const len = this.data.length;
    if (start > end) {
      const t = start;
      start = end;
      end = t;
    }
    // subarray() is a zero-copy view — writes go directly into the parent buffer.
    // width/height aren't meaningful for a 1D slice; rescale inside select is unsupported.
    const sub = new GlitchBuffer(
      this.data.subarray(pct(start, len), pct(end, len)),
      0,
      0,
      this.rand
    );
    await fn(sub);
    return this;
  }

  async rescale(
    newWidth: number,
    newHeight = Math.round((newWidth * this.height) / this.width)
  ): Promise<this> {
    const src = new OffscreenCanvas(this.width, this.height);
    src
      .getContext('2d')!
      .putImageData(
        new ImageData(glitchToRgba(this.data, this.width, this.height), this.width, this.height),
        0,
        0
      );

    const dst = new OffscreenCanvas(newWidth, newHeight);
    dst.getContext('2d')!.drawImage(src, 0, 0, newWidth, newHeight);

    const dstData = dst.getContext('2d')!.getImageData(0, 0, newWidth, newHeight);
    this.data = rgbaToGlitch(dstData.data, newWidth, newHeight);
    this.width = newWidth;
    this.height = newHeight;
    return this;
  }

  // Resize only if the longest dimension exceeds px — no-ops on smaller images.
  async maxsize(px: number): Promise<this> {
    const longest = Math.max(this.width, this.height);
    if (longest <= px) return this;
    const scale = px / longest;
    return this.rescale(Math.round(this.width * scale), Math.round(this.height * scale));
  }

  // Shared pipeline for all Tone.js effects: bytes↔floats + Offline render.
  // buildFx is called inside the Offline context and must return an unconnected Tone node.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async toneProcess(extraDuration: number, buildFx: () => any): Promise<this> {
    const sampleRate = SAMPLE_RATE;
    const len = this.data.length;
    if (len === 0) return this;
    const duration = len / sampleRate;

    const samples = new Float32Array(len);
    for (let i = 0; i < len; i++) samples[i] = this.data[i] / 127.5 - 1;

    const srcBuffer = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate });
    srcBuffer.copyToChannel(samples, 0);

    const rendered = await Offline(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ transport }: any) => {
        const fx = buildFx().toDestination();
        const player = new Player(new ToneAudioBuffer(srcBuffer));
        player.connect(fx);
        player.start(0);
        transport.start(0);
      },
      duration + extraDuration,
      1,
      sampleRate
    );

    const out = rendered.getChannelData(0);
    for (let i = 0; i < len; i++) this.data[i] = clamp8(((out[i] ?? 0) + 1) * 127.5);

    return this;
  }

  async reverb(roomSize: number, dampening: Frequency): Promise<this> {
    // Uses Freeverb directly (not Tone.Reverb) so the IR is deterministic — Tone.Reverb
    // generates a random IR internally, breaking reproducibility across runs.
    return this.toneProcess(1.0, () => new Freeverb({ roomSize, dampening }));
  }

  reverse(): this {
    this.data.reverse();
    return this;
  }

  copy(srcStart: Percentage, srcEnd: Percentage, dstStart: Percentage): this {
    const len = this.data.length;
    if (srcStart > srcEnd) {
      const t = srcStart;
      srcStart = srcEnd;
      srcEnd = t;
    }
    const src = pct(srcStart, len);
    const srcE = pct(srcEnd, len);
    const dst = pct(dstStart, len);
    const chunk = this.data.slice(src, srcE);
    this.data.set(chunk.subarray(0, Math.min(chunk.length, len - dst)), dst);
    return this;
  }

  bitcrush(bits: number): this {
    // step is always a power of 2, so masking beats float division/multiply.
    const mask = 0xff & ~((1 << (8 - bits)) - 1);
    for (let i = 0; i < this.data.length; i++) this.data[i] &= mask;
    return this;
  }

  noise(db: Decibels): this {
    const amplitude = 255 * dbToLin(db);
    for (let i = 0; i < this.data.length; i++)
      this.data[i] = clamp8(this.data[i] + (this.rand() * 2 - 1) * amplitude);
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
  // depth>0: troughs lerp toward black; depth<0: troughs lerp toward white.
  tremolo(rate: number, depth: number): this {
    const len = this.data.length;
    for (let i = 0; i < len; i++) {
      const t = 0.5 * (1 - Math.sin((2 * Math.PI * rate * i) / len)); // 0 at peak, 1 at trough
      const v = this.data[i];
      this.data[i] = depth >= 0 ? clamp8(v * (1 - depth * t)) : clamp8(v + (255 - v) * -depth * t);
    }
    return this;
  }

  // Hard clip: amplify then clamp. drive > 1 flattens peaks against the byte ceiling/floor.
  overdrive(drive: number): this {
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) lut[v] = clamp8((v - 127.5) * drive + 127.5);
    for (let i = 0; i < this.data.length; i++) this.data[i] = lut[this.data[i]];
    return this;
  }

  // Soft-clip via tanh. drive > 1 saturates; ~1 = clean, ~10 = heavy crunch.
  saturate(drive: number): this {
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++)
      lut[v] = ((Math.tanh((v / 127.5 - 1) * drive) + 1) * 127.5 + 0.5) | 0;
    for (let i = 0; i < this.data.length; i++) this.data[i] = lut[this.data[i]];
    return this;
  }

  // Mix original with an LFO-time-shifted copy.
  // rate = LFO oscillations,
  // depth = modulation width as fraction of buffer
  chorus(rate: number, depth: Decibels): this {
    const len = this.data.length;
    const orig = this.data.slice();
    // const halfDepth = Math.floor(depth * len * 0.0001);
    const halfDepth = dbToLin(depth);
    for (let i = 0; i < len; i++) {
      const offset = Math.round(halfDepth * Math.sin((2 * Math.PI * rate * i) / len));
      const j = i + offset;
      this.data[i] = j >= 0 && j < len ? orig[j] : orig[i];
    }
    return this;
  }

  invert(): this {
    for (let i = 0; i < this.data.length; i++) this.data[i] = 255 - this.data[i];
    return this;
  }

  // Shift one RGB channel by (dx, dy) as 0–100 percentages of width/height. Wraps toroidally.
  chromashift(ch: number, dx: Percentage, dy: Percentage): this {
    const { width, height } = this;
    if (!width || !height) return this;
    const offX = Math.round((dx / 100) * width);
    const offY = Math.round((dy / 100) * height);
    const orig = this.data.slice();
    const xMap = new Int32Array(width),
      yMap = new Int32Array(height);
    for (let x = 0; x < width; x++) xMap[x] = (((x + offX) % width) + width) % width;
    for (let y = 0; y < height; y++) yMap[y] = (((y + offY) % height) + height) % height;
    for (let srcY = 0; srcY < height; srcY++) {
      const py = yMap[srcY];
      for (let srcX = 0; srcX < width; srcX++)
        this.data[(py * width + xMap[srcX]) * 3 + ch] = orig[(srcY * width + srcX) * 3 + ch];
    }
    return this;
  }

  // Barrel (amount>0) or pincushion (amount<0) lens distortion.
  // For barrel, scale compensates so corners map exactly to the source edge (no black fill).
  warp(amount: number): this {
    const { width, height } = this;
    if (!width || !height) return this;
    const src = new Uint8Array(this.data);
    const cx = width / 2,
      cy = height / 2;
    // Edge midpoints have r²=1 in normalised space; scale ensures they map exactly to ±1.
    const scale = amount > 0 ? 1 / (1 + amount) : 1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const nx = (x - cx) / cx,
          ny = (y - cy) / cy;
        const r2 = nx * nx + ny * ny;
        const distort = (1 + amount * r2) * scale;
        const sx = Math.round(nx * distort * cx + cx);
        const sy = Math.round(ny * distort * cy + cy);
        const di = (y * width + x) * 3;
        if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
          const si = (sy * width + sx) * 3;
          this.data[di] = src[si];
          this.data[di + 1] = src[si + 1];
          this.data[di + 2] = src[si + 2];
        } else {
          this.data[di] = this.data[di + 1] = this.data[di + 2] = 0;
        }
      }
    }
    return this;
  }

  // Gaussian blur approximated by 3 passes of sliding-window box blur.
  // O(w×h) per pass regardless of radius.
  blur(radius: number): this {
    const { width, height } = this;
    if (!width || !height) return this;
    const r = Math.max(1, Math.round(radius));
    const tmp = new Float32Array(this.data.length);
    const tmp2 = new Float32Array(this.data.length);

    const boxH = (src: Float32Array | Uint8Array, dst: Float32Array) => {
      const n = 2 * r + 1;
      for (let y = 0; y < height; y++) {
        let s0 = 0,
          s1 = 0,
          s2 = 0;
        for (let k = -r; k <= r; k++) {
          const si = (y * width + Math.max(0, Math.min(width - 1, k))) * 3;
          s0 += src[si];
          s1 += src[si + 1];
          s2 += src[si + 2];
        }
        for (let x = 0; x < width; x++) {
          const di = (y * width + x) * 3;
          dst[di] = s0 / n;
          dst[di + 1] = s1 / n;
          dst[di + 2] = s2 / n;
          const leave = (y * width + Math.max(0, x - r)) * 3;
          const enter = (y * width + Math.min(width - 1, x + r + 1)) * 3;
          s0 += src[enter] - src[leave];
          s1 += src[enter + 1] - src[leave + 1];
          s2 += src[enter + 2] - src[leave + 2];
        }
      }
    };

    const boxV = (src: Float32Array, dst: Float32Array) => {
      const n = 2 * r + 1;
      for (let x = 0; x < width; x++) {
        let s0 = 0,
          s1 = 0,
          s2 = 0;
        for (let k = -r; k <= r; k++) {
          const si = (Math.max(0, Math.min(height - 1, k)) * width + x) * 3;
          s0 += src[si];
          s1 += src[si + 1];
          s2 += src[si + 2];
        }
        for (let y = 0; y < height; y++) {
          const di = (y * width + x) * 3;
          dst[di] = s0 / n;
          dst[di + 1] = s1 / n;
          dst[di + 2] = s2 / n;
          const leave = (Math.max(0, y - r) * width + x) * 3;
          const enter = (Math.min(height - 1, y + r + 1) * width + x) * 3;
          s0 += src[enter] - src[leave];
          s1 += src[enter + 1] - src[leave + 1];
          s2 += src[enter + 2] - src[leave + 2];
        }
      }
    };

    // 3 box-blur passes ≈ Gaussian; alternate between tmp/tmp2 so src ≠ dst
    boxH(this.data, tmp);
    boxV(tmp, tmp2);
    boxH(tmp2, tmp);
    boxV(tmp, tmp2);
    boxH(tmp2, tmp);
    boxV(tmp, tmp2);

    for (let i = 0; i < this.data.length; i++) this.data[i] = tmp2[i];
    return this;
  }

  // Hexagonal bokeh blur — three sequential 1D line-segment blurs at 0°/60°/-60°.
  // The Minkowski sum of three equal line segments at those angles is a regular hexagon,
  // so the resulting convolution kernel has a hexagonal aperture shape.
  //
  // The horizontal pass uses a sliding window (O(w×h)). The diagonal passes use
  // precomputed offset tables to avoid Math.round/max/min in the hot loop, plus an
  // interior fast-path that skips clamping for the ~90% of pixels away from the edges.
  defocus(radius: number): this {
    const { width, height } = this;
    if (!width || !height) return this;
    const r = Math.max(1, Math.round(radius));
    const ch = 3;
    const n = 2 * r + 1;
    const tmp = new Float32Array(this.data.length);
    const tmp2 = new Float32Array(this.data.length);

    const boxH = (src: Float32Array | Uint8Array, dst: Float32Array) => {
      for (let y = 0; y < height; y++) {
        let s0 = 0,
          s1 = 0,
          s2 = 0;
        for (let k = -r; k <= r; k++) {
          const si = (y * width + Math.max(0, Math.min(width - 1, k))) * ch;
          s0 += src[si];
          s1 += src[si + 1];
          s2 += src[si + 2];
        }
        for (let x = 0; x < width; x++) {
          const di = (y * width + x) * ch;
          dst[di] = s0 / n;
          dst[di + 1] = s1 / n;
          dst[di + 2] = s2 / n;
          const leave = (y * width + Math.max(0, x - r)) * ch;
          const enter = (y * width + Math.min(width - 1, x + r + 1)) * ch;
          s0 += src[enter] - src[leave];
          s1 += src[enter + 1] - src[leave + 1];
          s2 += src[enter + 2] - src[leave + 2];
        }
      }
    };

    const lineBlur = (
      src: Float32Array | Uint8Array,
      dst: Float32Array,
      dxf: number,
      dyf: number
    ) => {
      const dxOff = new Int32Array(n),
        dyOff = new Int32Array(n);
      for (let k = -r; k <= r; k++) {
        dxOff[k + r] = Math.round(k * dxf);
        dyOff[k + r] = Math.round(k * dyf);
      }
      const bx = Math.abs(dxOff[0]),
        by = Math.abs(dyOff[0]); // border half-widths
      for (let y = 0; y < height; y++) {
        const interior_y = y >= by && y < height - by;
        for (let x = 0; x < width; x++) {
          let s0 = 0,
            s1 = 0,
            s2 = 0;
          if (interior_y && x >= bx && x < width - bx) {
            for (let k = 0; k < n; k++) {
              const si = ((y + dyOff[k]) * width + (x + dxOff[k])) * ch;
              s0 += src[si];
              s1 += src[si + 1];
              s2 += src[si + 2];
            }
          } else {
            for (let k = 0; k < n; k++) {
              const si =
                (Math.max(0, Math.min(height - 1, y + dyOff[k])) * width +
                  Math.max(0, Math.min(width - 1, x + dxOff[k]))) *
                ch;
              s0 += src[si];
              s1 += src[si + 1];
              s2 += src[si + 2];
            }
          }
          const di = (y * width + x) * ch;
          dst[di] = s0 / n;
          dst[di + 1] = s1 / n;
          dst[di + 2] = s2 / n;
        }
      }
    };

    const s3 = Math.sqrt(3);
    boxH(this.data, tmp); // 0°
    lineBlur(tmp, tmp2, 0.5, s3 / 2); // 60°
    lineBlur(tmp2, tmp, 0.5, -s3 / 2); // −60°

    for (let i = 0; i < this.data.length; i++) this.data[i] = clamp8(tmp[i]);
    return this;
  }

  // Average NxN pixel blocks into flat squares.
  pixelate(size: number): this {
    const { width, height } = this;
    if (!width || !height) return this;
    size = Math.max(1, Math.round(size));
    for (let by = 0; by < height; by += size) {
      for (let bx = 0; bx < width; bx += size) {
        const bw = Math.min(size, width - bx),
          bh = Math.min(size, height - by);
        let r = 0,
          g = 0,
          b = 0,
          n = 0;
        for (let y = by; y < by + bh; y++) {
          for (let x = bx; x < bx + bw; x++) {
            const i = (y * width + x) * 3;
            r += this.data[i];
            g += this.data[i + 1];
            b += this.data[i + 2];
            n++;
          }
        }
        r = (r / n) | 0;
        g = (g / n) | 0;
        b = (b / n) | 0;
        for (let y = by; y < by + bh; y++) {
          for (let x = bx; x < bx + bw; x++) {
            const i = (y * width + x) * 3;
            this.data[i] = r;
            this.data[i + 1] = g;
            this.data[i + 2] = b;
          }
        }
      }
    }
    return this;
  }

  // Remap to polar coordinates: x→angle, y→radius. Samples from the original image.
  // Flip the image vertically (reverse row order in place).
  flip(): this {
    const { width, height } = this;
    if (!width || !height) return this;
    const stride = width * 3;
    const row = new Uint8Array(stride);
    for (let y = 0; y < Math.floor(height / 2); y++) {
      const top = y * stride,
        bot = (height - 1 - y) * stride;
      row.set(this.data.subarray(top, top + stride));
      this.data.copyWithin(top, bot, bot + stride);
      this.data.set(row, bot);
    }
    return this;
  }

  // Mirror the image horizontally (reverse pixel order within each row).
  mirror(): this {
    const { width, height } = this;
    if (!width || !height) return this;
    const px = new Uint8Array(3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < Math.floor(width / 2); x++) {
        const l = (y * width + x) * 3,
          r = (y * width + (width - 1 - x)) * 3;
        px.set(this.data.subarray(l, l + 3));
        this.data.copyWithin(l, r, r + 3);
        this.data.set(px, r);
      }
    }
    return this;
  }

  polar(): this {
    const { width, height } = this;
    if (!width || !height) return this;
    const src = new Uint8Array(this.data);
    const cx = width / 2,
      cy = height / 2;
    // theta only depends on x — precompute cos/sin to avoid O(w×h) trig calls.
    const cosT = new Float32Array(width),
      sinT = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      const theta = (x / width) * 2 * Math.PI;
      cosT[x] = Math.cos(theta);
      sinT[x] = Math.sin(theta);
    }
    for (let y = 0; y < height; y++) {
      const r = y / height;
      const rCx = r * cx,
        rCy = r * cy;
      for (let x = 0; x < width; x++) {
        const sx = Math.round(cx + rCx * cosT[x]);
        const sy = Math.round(cy + rCy * sinT[x]);
        const di = (y * width + x) * 3;
        if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
          const si = (sy * width + sx) * 3;
          this.data[di] = src[si];
          this.data[di + 1] = src[si + 1];
          this.data[di + 2] = src[si + 2];
        } else {
          this.data[di] = this.data[di + 1] = this.data[di + 2] = 0;
        }
      }
    }
    return this;
  }

  // Use R channel to displace X, G channel to displace Y. Wraps toroidally.
  displace(amount: Percentage): this {
    const { width, height } = this;
    if (!width || !height) return this;
    const src = new Uint8Array(this.data);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 3;
        const dx = Math.round((((src[i] / 127.5 - 1) * amount) / 100) * width);
        const dy = Math.round((((src[i + 1] / 127.5 - 1) * amount) / 100) * height);
        const sx = (((x + dx) % width) + width) % width;
        const sy = (((y + dy) % height) + height) % height;
        const si = (sy * width + sx) * 3;
        this.data[i] = src[si];
        this.data[i + 1] = src[si + 1];
        this.data[i + 2] = src[si + 2];
      }
    }
    return this;
  }

  // Screen-composite n scaled copies of the image (zoom tunnel effect).
  // Screen blend: out = a + b - a*b/255 — brightens without blowing out.
  tunnel(n: number, zoom: number, decay: number, angle = 0, offsetX = 0, offsetY = 0): this {
    const { width, height } = this;
    if (!width || !height) return this;
    const src = new Uint8Array(this.data);
    const cx = width / 2 + (offsetX / 100) * width;
    const cy = height / 2 + (offsetY / 100) * height;
    const rad = (angle * Math.PI) / 180;
    for (let pass = 1; pass <= n; pass++) {
      const s = Math.pow(zoom, pass);
      const alpha = Math.pow(decay, pass);
      const cos = Math.cos(rad * pass),
        sin = Math.sin(rad * pass);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const dx = (x - cx) / s,
            dy = (y - cy) / s;
          const sx = Math.round(dx * cos + dy * sin + cx);
          const sy = Math.round(-dx * sin + dy * cos + cy);
          if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
            const si = (sy * width + sx) * 3,
              di = (y * width + x) * 3;
            for (let c = 0; c < 3; c++) {
              const a = this.data[di + c],
                b = src[si + c] * alpha;
              this.data[di + c] = clamp8(a + b - (a * b) / 255);
            }
          }
        }
      }
    }
    return this;
  }

  // Darken pixels toward the edges with a radial gradient.
  // strength: how dark the corners get (0=no effect, 1=black corners).
  // softness: fraction of the diagonal that stays fully bright (0=darkens from centre, 0.9=only corners affected).
  // The two params are fully decoupled: strength never touches the clear zone, softness never changes corner brightness.
  // strength: how dark the outer edge gets (0=none, 3=black).
  // softness: feathering — 0=hard edge at the ring, 1=gradient spans the whole image.
  // size: where the dark ring sits, as a multiple of the corner distance (√2).
  //   size=1 → ring at corners; size>1 → ring outside the image for a less circular look.
  vignette(strength: number, softness = 0.7, size = 1): this {
    const { width, height } = this;
    if (!width || !height) return this;
    const cx = width / 2,
      cy = height / 2;
    const outer = size * Math.sqrt(2);
    const inner = outer * (1 - softness);
    const scale = outer - inner || 0.0001;
    // Precompute squared normalised distances per column and row.
    const dx2 = new Float32Array(width),
      dy2 = new Float32Array(height);
    for (let x = 0; x < width; x++) {
      const d = (x - cx) / cx;
      dx2[x] = d * d;
    }
    for (let y = 0; y < height; y++) {
      const d = (y - cy) / cy;
      dy2[y] = d * d;
    }
    for (let y = 0; y < height; y++) {
      const d2y = dy2[y];
      for (let x = 0; x < width; x++) {
        const r = Math.sqrt(dx2[x] + d2y);
        const t = Math.min(1, Math.max(0, (r - inner) / scale));
        const smooth = t * t * (3 - 2 * t);
        const factor = Math.max(0, 1 - strength * smooth);
        const i = (y * width + x) * 3;
        this.data[i] = (this.data[i] * factor) | 0;
        this.data[i + 1] = (this.data[i + 1] * factor) | 0;
        this.data[i + 2] = (this.data[i + 2] * factor) | 0;
      }
    }
    return this;
  }

  // amount: 0–100 percentage of total pixels to swap.
  shuffle(amount: Percentage): this {
    const pixels = Math.floor(this.data.length / 3);
    const swaps = pct(amount, pixels);
    for (let i = 0; i < swaps; i++) {
      const a = Math.floor(this.rand() * pixels) * 3;
      const b = Math.floor(this.rand() * pixels) * 3;
      for (let c = 0; c < 3; c++) {
        const tmp = this.data[a + c];
        this.data[a + c] = this.data[b + c];
        this.data[b + c] = tmp;
      }
    }
    return this;
  }

  // Quantize to n discrete levels (evenly spaced across 0–255).
  quantize(levels: number): this {
    const n = Math.max(2, Math.floor(levels));
    const step = 255 / (n - 1);
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) lut[v] = Math.round(Math.round(v / step) * step);
    for (let i = 0; i < this.data.length; i++) this.data[i] = lut[this.data[i]];
    return this;
  }

  // Wavefolder: reflects values at 0 and 255 boundaries.
  // drive ≤ 0.5 = passthrough, ~1 = one full fold, higher = multiple folds.
  fold(drive: number): this {
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      let x = (v / 255) * drive;
      x = x - Math.floor(x);
      if (x > 0.5) x = 1 - x;
      lut[v] = Math.round(x * 2 * 255);
    }
    for (let i = 0; i < this.data.length; i++) this.data[i] = lut[this.data[i]];
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

  async jpeg(quality: number): Promise<this> {
    const off = new OffscreenCanvas(this.width, this.height);
    off
      .getContext('2d')!
      .putImageData(
        new ImageData(glitchToRgba(this.data, this.width, this.height), this.width, this.height),
        0,
        0
      );
    const blob = await off.convertToBlob({ type: 'image/jpeg', quality: quality / 100 });
    const bitmap = await createImageBitmap(blob);
    const dst = new OffscreenCanvas(this.width, this.height);
    dst.getContext('2d')!.drawImage(bitmap, 0, 0);
    this.data = rgbaToGlitch(
      dst.getContext('2d')!.getImageData(0, 0, this.width, this.height).data,
      this.width,
      this.height
    );
    return this;
  }

  // 8×8 Bayer threshold matrix, values 0–63. Flat Uint8Array for cache locality.
  private static readonly BAYER8 = new Uint8Array([
    0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60,
    28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47,
    7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
  ]);

  // Ordered dithering using the 8×8 Bayer matrix. Adds a spatially-varying threshold
  // before quantizing, producing a crosshatch pattern instead of flat posterisation.
  bayer(levels: number): this {
    const { width, height } = this;
    if (!width || !height) return this;
    const n = Math.max(2, Math.floor(levels));
    const step = 255 / (n - 1);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = (GlitchBuffer.BAYER8[((y & 7) << 3) | (x & 7)] / 64 - 0.5) * step;
        const base = (y * width + x) * 3;
        for (let c = 0; c < 3; c++)
          this.data[base + c] = clamp8(Math.round((this.data[base + c] + t) / step) * step);
      }
    }
    return this;
  }

  // Floyd-Steinberg error diffusion dithering. Quantizes each pixel and spreads
  // the rounding error to neighbouring pixels, producing organic dot patterns.
  diffuse(levels: number): this {
    const { width, height } = this;
    if (!width || !height) return this;
    const n = Math.max(2, Math.floor(levels));
    const step = 255 / (n - 1);
    for (let c = 0; c < 3; c++) {
      const buf = new Float32Array(width * height);
      for (let i = 0; i < width * height; i++) buf[i] = this.data[i * 3 + c];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          const quantized = clamp8(Math.round(buf[i] / step) * step);
          const err = buf[i] - quantized;
          buf[i] = quantized;
          if (x + 1 < width) buf[i + 1] += (err * 7) / 16;
          if (y + 1 < height) {
            if (x > 0) buf[i + width - 1] += (err * 3) / 16;
            buf[i + width] += (err * 5) / 16;
            if (x + 1 < width) buf[i + width + 1] += (err * 1) / 16;
          }
        }
      }
      for (let i = 0; i < width * height; i++) this.data[i * 3 + c] = clamp8(buf[i]);
    }
    return this;
  }

  private lumaAt(idx: number): number {
    return (
      (this.data[idx * 3] * 77 + this.data[idx * 3 + 1] * 150 + this.data[idx * 3 + 2] * 29) >> 8
    );
  }

  private sortRun(run: number[]): void {
    const n = run.length;
    if (n < 2) return;
    // Copy pixels into a flat buffer and sort an index array by luma — avoids per-pixel objects.
    const tmp = new Uint8Array(n * 3);
    for (let k = 0; k < n; k++) {
      const i = run[k] * 3;
      tmp[k * 3] = this.data[i];
      tmp[k * 3 + 1] = this.data[i + 1];
      tmp[k * 3 + 2] = this.data[i + 2];
    }
    const order = Array.from({ length: n }, (_, k) => k);
    order.sort(
      (a, b) =>
        tmp[a * 3] * 77 +
        tmp[a * 3 + 1] * 150 +
        tmp[a * 3 + 2] * 29 -
        (tmp[b * 3] * 77 + tmp[b * 3 + 1] * 150 + tmp[b * 3 + 2] * 29)
    );
    for (let k = 0; k < n; k++) {
      const di = run[k] * 3,
        si = order[k] * 3;
      this.data[di] = tmp[si];
      this.data[di + 1] = tmp[si + 1];
      this.data[di + 2] = tmp[si + 2];
    }
  }

  // Sort pixels by luma within rows. Runs above threshold (positive) or below abs(threshold) (negative).
  sort(threshold: Percentage): this {
    const { width, height } = this;
    if (!width || !height) return this;
    const t = (Math.abs(threshold) / 100) * 255;
    const above = threshold >= 0;
    for (let y = 0; y < height; y++) {
      let run: number[] = [];
      for (let x = 0; x <= width; x++) {
        const idx = y * width + x;
        const in_ = x < width && (above ? this.lumaAt(idx) >= t : this.lumaAt(idx) < t);
        if (in_) {
          run.push(idx);
        } else {
          this.sortRun(run);
          run = [];
        }
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

  gamma(g: number): this {
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(v / 255, g);
    for (let i = 0; i < this.data.length; i++) this.data[i] = lut[this.data[i]];
    return this;
  }

  levels(black: number, white: number): this {
    const range = white - black || 1;
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) lut[v] = Math.max(0, Math.min(255, ((v - black) / range) * 255));
    for (let i = 0; i < this.data.length; i++) this.data[i] = lut[this.data[i]];
    return this;
  }

  // Randomly flip individual bits with probability prob (0–1).
  // Uses geometric skip: samples distance to next flip, so rand() is called once per flip
  // rather than once per bit — ~1/prob times fewer calls for sparse probabilities.
  bitrot(prob: number): this {
    if (prob <= 0) return this;
    const logQ = Math.log(1 - prob);
    let bit = Math.floor(Math.log(this.rand()) / logQ);
    while (bit < this.data.length * 8) {
      this.data[bit >> 3] ^= 1 << (bit & 7);
      bit += 1 + Math.floor(Math.log(this.rand()) / logQ);
    }
    return this;
  }

  // Nearest-neighbour 1D resample: hold each sample for `factor` bytes (downsample then repeat).
  resample(factor: number): this {
    factor = Math.max(2, Math.round(factor));
    for (let i = 0; i < this.data.length; i++) this.data[i] = this.data[i - (i % factor)];
    return this;
  }

  // Downscale by factor, call fn, then upscale back to original dimensions.
  async scale(factor: number, fn: () => Promise<void>): Promise<this> {
    const origW = this.width,
      origH = this.height;
    if (!origW || !origH) return this;
    await this.rescale(
      Math.max(1, Math.round(origW * factor)),
      Math.max(1, Math.round(origH * factor))
    );
    await fn();
    await this.rescale(origW, origH);
    return this;
  }

  // Extract luminance (Y from YCbCr), apply fn, then recompose with original chroma.
  // The sub-buffer is 3-channel (R=G=B=Y) so all effects work on it normally.
  async luma(fn: (sub: GlitchBuffer) => Promise<void>): Promise<this> {
    const count = Math.floor(this.data.length / 3);
    const Cb = new Uint8Array(count),
      Cr = new Uint8Array(count);
    const rgb = new Uint8Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = this.data[i * 3],
        g = this.data[i * 3 + 1],
        b = this.data[i * 3 + 2];
      const y = clamp8(0.299 * r + 0.587 * g + 0.114 * b);
      Cb[i] = clamp8(128 - 0.168736 * r - 0.331264 * g + 0.5 * b);
      Cr[i] = clamp8(128 + 0.5 * r - 0.418688 * g - 0.081312 * b);
      rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = y;
    }
    await fn(new GlitchBuffer(rgb, this.width, this.height, this.rand));
    for (let i = 0; i < count; i++) {
      const y = rgb[i * 3],
        cb = Cb[i] - 128,
        cr = Cr[i] - 128;
      this.data[i * 3] = clamp8(y + 1.402 * cr);
      this.data[i * 3 + 1] = clamp8(y - 0.344136 * cb - 0.714136 * cr);
      this.data[i * 3 + 2] = clamp8(y + 1.772 * cb);
    }
    return this;
  }

  // Stutter: pick random positions, grab a chunk, and repeat it forward.
  // size: chunk length as % of buffer; count: number of stutters to apply.
  stutter(size: Percentage, count: number): this {
    const len = this.data.length;
    const maxChunk = Math.max(1, pct(size, len));
    for (let i = 0; i < count; i++) {
      const chunkLen = Math.max(1, Math.floor(this.rand() * maxChunk));
      const src = Math.floor(this.rand() * (len - chunkLen));
      const chunk = this.data.slice(src, src + chunkLen);
      const dst = Math.floor(this.rand() * (len - chunkLen));
      for (let j = 0; j < chunkLen && dst + j < len; j++)
        this.data[dst + j] = chunk[j % chunk.length];
    }
    return this;
  }

  // Transpose the pixel grid (swap width↔height), apply fn, then transpose back.
  async transpose(fn: (sub: GlitchBuffer) => Promise<void>): Promise<this> {
    const { width: W, height: H } = this;
    if (!W || !H) return this;
    const flipped = new Uint8Array(this.data.length);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        for (let c = 0; c < 3; c++) flipped[(x * H + y) * 3 + c] = this.data[(y * W + x) * 3 + c];
    const sub = new GlitchBuffer(flipped, H, W, this.rand);
    await fn(sub);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        for (let c = 0; c < 3; c++) this.data[(y * W + x) * 3 + c] = sub.data[(x * H + y) * 3 + c];
    return this;
  }

  // Extract one RGB channel into a 3-channel sub-buffer with R=G=B=channel value,
  // apply fn, then write back channel 0. Using a proper 3-channel buffer means 2D
  // effects (sort, transpose, blur, etc.) see valid stride-3 data and real dimensions.
  async channel(ch: number, fn: (sub: GlitchBuffer) => Promise<void>): Promise<this> {
    const count = Math.floor(this.data.length / 3);
    const rgb = new Uint8Array(count * 3);
    for (let i = 0; i < count; i++)
      rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = this.data[i * 3 + ch];
    const sub = new GlitchBuffer(rgb, this.width, this.height, this.rand);
    await fn(sub);
    for (let i = 0; i < count; i++) this.data[i * 3 + ch] = rgb[i * 3];
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
  // frequency: LFO rate in Hz, octaves: sweep width, baseFrequency: center Hz.
  async phaser(frequency: Frequency, octaves: number, baseFrequency: Frequency): Promise<this> {
    return this.toneProcess(0.1, () => new Phaser({ frequency, octaves, baseFrequency }));
  }

  // Tone.js FrequencyShifter — shifts all frequencies up or down by a fixed Hz amount.
  // frequency: Hz shift (positive = up, negative = down).
  async frequencyShift(frequency: Frequency): Promise<this> {
    return this.toneProcess(0.1, () => new FrequencyShifter({ frequency }));
  }

  // Tone.js Vibrato — LFO pitch wobble via delay modulation.
  // frequency: LFO rate in Hz, depth: modulation amount 0–1.
  async vibrato(frequency: Frequency, depth: number): Promise<this> {
    return this.toneProcess(0.1, () => new Vibrato({ frequency, depth }));
  }

  // Tone.js Chebyshev waveshaper — adds nth-order harmonics. order 1 = clean, ~50 = harsh.
  async chebyshev(order: number): Promise<this> {
    const n = order >= 0 ? 2 * order + 1 : -2 * order;
    return this.toneProcess(0.1, () => new Chebyshev({ order: n }));
  }

  // Tone.js AutoWah — envelope follower sweeps a bandpass filter.
  // baseFrequency: center Hz, octaves: sweep range, sensitivity: follower threshold dB.
  async autowah(baseFrequency: Frequency, octaves: number, sensitivity: Decibels): Promise<this> {
    return this.toneProcess(0.1, () => new AutoWah({ baseFrequency, octaves, sensitivity }));
  }

  // Tone.js FeedbackDelay — delay with a recirculating feedback loop.
  // delayTime: 0–100% of buffer length converted to seconds, feedback: 0–1.
  async feedbackDelay(delayTime: Percentage, feedback: number): Promise<this> {
    const delaySeconds = pct(delayTime, this.data.length) / SAMPLE_RATE;
    return this.toneProcess(2.0, () => new FeedbackDelay({ delayTime: delaySeconds, feedback }));
  }

  // Tone.js PitchShift — time-preserving pitch shift. semitones: e.g. -12 to 12.
  // feedback: recirculates shifted signal back into input, adding a cascading resonance.
  async pitchShift(semitones: number, feedback = 0): Promise<this> {
    return this.toneProcess(0.5, () => new PitchShift({ pitch: semitones, feedback }));
  }

  // Tone.js Filter — biquad lowpass, highpass, bandpass.
  // frequency: cutoff/center Hz, Q: resonance (higher = sharper peak).
  async lowpass(frequency: Frequency, Q: number, rolloff = -12): Promise<this> {
    return this.toneProcess(
      0.1,
      () => new Filter({ type: 'lowpass', frequency, Q, rolloff: rolloff as -12 | -24 | -48 | -96 })
    );
  }

  async highpass(frequency: Frequency, Q: number, rolloff = -12): Promise<this> {
    return this.toneProcess(
      0.1,
      () =>
        new Filter({ type: 'highpass', frequency, Q, rolloff: rolloff as -12 | -24 | -48 | -96 })
    );
  }

  async bandpass(frequency: Frequency, Q: number): Promise<this> {
    return this.toneProcess(0.1, () => new Filter({ type: 'bandpass', frequency, Q }));
  }

  async notch(frequency: Frequency, Q: number): Promise<this> {
    return this.toneProcess(0.1, () => new Filter({ type: 'notch', frequency, Q }));
  }

  async lowshelf(frequency: Frequency, gain: Decibels): Promise<this> {
    return this.toneProcess(0.1, () => new Filter({ type: 'lowshelf', frequency, gain }));
  }

  async highshelf(frequency: Frequency, gain: Decibels): Promise<this> {
    return this.toneProcess(0.1, () => new Filter({ type: 'highshelf', frequency, gain }));
  }
}
