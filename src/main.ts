/// <reference path="glitchsp.ts" />

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

class GlitchBuffer {
  data: Uint8Array;
  private rand: () => number;

  constructor(data: Uint8Array, rand: () => number = Math.random) {
    this.data = data;
    this.rand = rand;
  }

  select(startPct: number, endPct: number, fn: (sub: GlitchBuffer) => void): this {
    const len = this.data.length;
    const start = Math.floor(startPct * len);
    const end = Math.floor(endPct * len);
    const sub = new GlitchBuffer(this.data.slice(start, end), this.rand);
    fn(sub);
    this.data.set(sub.data, start);
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
    const step = Math.pow(2, 8 - bits);
    for (let i = 0; i < this.data.length; i++) {
      this.data[i] = Math.floor(this.data[i] / step) * step;
    }
    return this;
  }

  noise(db: number): this {
    const amplitude = 255 * Math.pow(10, db / 20);
    for (let i = 0; i < this.data.length; i++) {
      const val = this.data[i] + (this.rand() * 2 - 1) * amplitude;
      this.data[i] = Math.max(0, Math.min(255, Math.round(val)));
    }
    return this;
  }

  echo(delayPct: number, gainDb: number): this {
    const len = this.data.length;
    const delay = Math.floor(delayPct * len);
    const gain = Math.pow(10, gainDb / 20);
    for (let i = 0; i < len - delay; i++) {
      const val = this.data[i + delay] + gain * this.data[i];
      this.data[i + delay] = Math.max(0, Math.min(255, Math.round(val)));
    }
    return this;
  }
}

let originalBuffer: Uint8Array | null = null;
let imgWidth = 0;
let imgHeight = 0;

const fileInput = document.getElementById('file') as HTMLInputElement;
const codeArea = document.getElementById('code') as HTMLTextAreaElement;
const runBtn = document.getElementById('run') as HTMLButtonElement;
const downloadBtn = document.getElementById('download') as HTMLButtonElement;
const seedInput = document.getElementById('seed') as HTMLInputElement;
const newSeedBtn = document.getElementById('new-seed') as HTMLButtonElement;
const errorPre = document.getElementById('error') as HTMLPreElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000);
}

seedInput.value = String(randomSeed());

let errorTimer: number | null = null;

function showError(msg: string, immediate: boolean): void {
  if (errorTimer !== null) { clearTimeout(errorTimer); errorTimer = null; }
  if (immediate) {
    errorPre.textContent = msg;
  } else {
    errorTimer = window.setTimeout(() => { errorPre.textContent = msg; errorTimer = null; }, 600);
  }
}

function runImage(immediate = false): void {
  if (!originalBuffer) return;
  try {
    const seed = parseInt(seedInput.value, 10) >>> 0;
    const rand = mulberry32(seed);
    const image = new GlitchBuffer(originalBuffer.slice(), rand);
    runGlitchsp(codeArea.value, image, rand);
    const rgba = glitchToRgba(image.data, imgWidth, imgHeight);
    ctx.putImageData(new ImageData(rgba, imgWidth, imgHeight), 0, 0);
    if (errorTimer !== null) { clearTimeout(errorTimer); errorTimer = null; }
    errorPre.textContent = '';
  } catch (e) {
    showError(String(e), immediate);
    // canvas intentionally left unchanged
  }
}

let runTimer: number | null = null;

codeArea.addEventListener('input', () => {
  if (runTimer !== null) clearTimeout(runTimer);
  runTimer = window.setTimeout(() => {
    runTimer = null;
    if (tryParse(codeArea.value)) runImage();
  }, 300);
});

newSeedBtn.addEventListener('click', () => {
  seedInput.value = String(randomSeed());
  runImage();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      imgWidth = img.naturalWidth;
      imgHeight = img.naturalHeight;
      canvas.width = imgWidth;
      canvas.height = imgHeight;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, imgWidth, imgHeight);
      originalBuffer = rgbaToGlitch(imageData.data, imgWidth, imgHeight);
      errorPre.textContent = '';
    };
    img.src = reader.result as string;
  };
  reader.readAsDataURL(file);
});

runBtn.addEventListener('click', () => runImage(true));

downloadBtn.addEventListener('click', () => {
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'glitchbuf.png';
    a.click();
    URL.revokeObjectURL(url);
  });
});
