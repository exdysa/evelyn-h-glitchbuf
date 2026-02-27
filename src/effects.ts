declare const Tone: any;

// ── Interface ───────────────────────────────────────────────────────────────

interface IGlitchBuffer {
  width: number;
  height: number;
  bitcrush(bits: number): this;
  noise(amount: number): this;
  reverse(): this;
  echo(times: number, gainDb: number): this;
  reverb(timePct: number, wet: number): Promise<this>;
  rescale(newWidth: number, newHeight: number): Promise<this>;
  select(startPct: number, endPct: number, fn: (sub: IGlitchBuffer) => Promise<void>): Promise<this>;
  copy(srcStart: number, srcEnd: number, dstStart: number): this;
}

// ── Image conversion ────────────────────────────────────────────────────────

function rgbaToGlitch(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const buf = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    buf[i * 3]     = data[i * 4];     // R
    buf[i * 3 + 1] = data[i * 4 + 1]; // G
    buf[i * 3 + 2] = data[i * 4 + 2]; // B
  }
  return buf;
}

function glitchToRgba(buf: Uint8Array, width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  for (let i = 0; i < width * height; i++) {
    out[i * 4]     = buf[i * 3];     // R
    out[i * 4 + 1] = buf[i * 3 + 1]; // G
    out[i * 4 + 2] = buf[i * 3 + 2]; // B
    out[i * 4 + 3] = 255;
  }
  return out;
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

  async select(startPct: number, endPct: number, fn: (sub: GlitchBuffer) => Promise<void>): Promise<this> {
    const len = this.data.length;
    const start = Math.floor(startPct * len);
    const end = Math.floor(endPct * len);
    // subarray() is a zero-copy view — writes go directly into the parent buffer.
    // width/height aren't meaningful for a 1D slice; rescale inside select is unsupported.
    const sub = new GlitchBuffer(this.data.subarray(start, end), 0, 0, this.rand);
    await fn(sub);
    return this;
  }

  async rescale(newWidth: number, newHeight: number): Promise<this> {
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

  async reverb(timePct: number, wet: number): Promise<this> {
    const sampleRate = 44100;
    const len = this.data.length;
    // timePct is a fraction of the buffer length, same convention as other time params.
    const irLen = Math.max(1, Math.floor(timePct * len));

    // Convert bytes [0, 255] → floats [-1, 1]
    const samples = new Float32Array(len);
    for (let i = 0; i < len; i++) samples[i] = this.data[i] / 127.5 - 1;

    // Generate IR using the seeded PRNG so the reverb pattern is deterministic.
    // Exponential decay envelope: -60 dB at the end of the tail.
    const ir = new Float32Array(irLen);
    for (let i = 0; i < irLen; i++)
      ir[i] = (this.rand() * 2 - 1) * Math.exp(-6.9 * i / irLen);

    // Render via Web Audio ConvolverNode. Output length = signal + IR tail.
    const offCtx = new OfflineAudioContext(1, len + irLen, sampleRate);

    const sigBuf = offCtx.createBuffer(1, len, sampleRate);
    sigBuf.copyToChannel(samples, 0);
    const irBuf = offCtx.createBuffer(1, irLen, sampleRate);
    irBuf.copyToChannel(ir, 0);

    const src = offCtx.createBufferSource();
    src.buffer = sigBuf;

    const conv = offCtx.createConvolver();
    conv.buffer = irBuf;

    const wetGain = offCtx.createGain();
    wetGain.gain.value = wet;
    const dryGain = offCtx.createGain();
    dryGain.gain.value = 1 - wet;

    src.connect(conv);
    conv.connect(wetGain);
    wetGain.connect(offCtx.destination);
    src.connect(dryGain);
    dryGain.connect(offCtx.destination);

    src.start(0);
    const rendered = await offCtx.startRendering();

    // Convert back: floats [-1, 1] → bytes [0, 255], first `len` samples only
    const out = rendered.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const v = (out[i] + 1) * 127.5;
      const r = (v + 0.5) | 0;
      this.data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    }

    return this;
  }

  reverse(): this {
    this.data.reverse();
    return this;
  }

  copy(srcStart: number, srcEnd: number, dstStart: number): this {
    const len = this.data.length;
    const src = Math.floor(srcStart * len);
    const srcE = Math.floor(srcEnd * len);
    const dst = Math.floor(dstStart * len);
    const chunk = this.data.slice(src, srcE);
    this.data.set(chunk.subarray(0, Math.min(chunk.length, len - dst)), dst);
    return this;
  }

  bitcrush(bits: number): this {
    // step is always a power of 2, so masking beats float division/multiply.
    const mask = 0xFF & ~((1 << (8 - bits)) - 1);
    for (let i = 0; i < this.data.length; i++) {
      this.data[i] = this.data[i] & mask;
    }
    return this;
  }

  noise(db: number): this {
    const amplitude = 255 * Math.pow(10, db / 20);
    for (let i = 0; i < this.data.length; i++) {
      const val = this.data[i] + ((this.rand() * 2 - 1) + (this.rand() * 2 - 1)) * 0.5 * amplitude;
      const r = (val + 0.5) | 0;
      this.data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    }
    return this;
  }

  echo(delayPct: number, gainDb: number): this {
    const len = this.data.length;
    const delay = Math.floor(delayPct * len);
    const gain = Math.pow(10, gainDb / 20);
    for (let i = 0; i < len - delay; i++) {
      const val = this.data[i + delay] + gain * this.data[i];
      const r = (val + 0.5) | 0;
      this.data[i + delay] = r < 0 ? 0 : r > 255 ? 255 : r;
    }
    return this;
  }
}
