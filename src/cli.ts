#!/usr/bin/const env node
/**
 * @fileoverview CLI/API for glitchbuf — load, process, save images using glitchsp DSL.
 */
import { readFileSync, writeFileSync } from 'fs';
import { extname } from 'path';
import { rgbaToGlitch, glitchToRgba, GlitchBuffer } from './effects';
import { runGlitchsp, mulberry32 } from './glitchsp';

/** Supported image formats. */
type ImageFormat = 'png' | 'jpeg' | 'jpg';

/** CLI options. */
export interface CliOpts {
  input: string;
  output: string;
  code: string;
  seed?: number;
  verbose?: boolean;
}

/** Internal state for a single pipeline run. */
export class GlitchPipeline {
  readonly buffer: GlitchBuffer;
  private originalData: Uint8Array;
  readonly rand: () => number;
  readonly width: number;
  readonly height: number;

  constructor(data: Uint8Array, width: number, height: number, rand: () => number) {
    this.buffer = new GlitchBuffer(data, width, height, rand);
    this.originalData = new Uint8Array(data);
    this.rand = rand;
    this.width = width;
    this.height = height;
  }

  /** Run glitchsp code against the current buffer state. */
  async apply(code: string, rand: () => number): Promise<GlitchBuffer> {
    await runGlitchsp(code, this.buffer, rand);
    return this.buffer;
  }

  /** Reset buffer to original unprocessed state. */
  reset(): void {
    this.buffer.data.set(this.originalData);
  }

  /** Get current buffer for read-Only inspection. */
  getBuffer(): GlitchBuffer {
    return this.buffer;
  }

  /** Set buffer data directly (after manual manipulation). */
  setBuffer(data: Uint8Array): void {
    this.buffer.data = data;
  }

  /** Get raw pixel data as Uint8Array. */
  toUint8Array(): Uint8Array {
    return this.buffer.data;
  }

  /** Get PRNG for external use. */
  getRand(): () => number {
    return this.rand;
  }
}

// ── Image loading ─────────────────────────────────────────────────────────────────

/** Load image from disk and convert to GlitchBuffer-Ready Uint8Array + dimensions. */
export async function loadImage(path: string): Promise<{ data: Uint8Array; width: number; height: number }> {
  const ext = extname(path).toLowerCase().replace('.', '') as ImageFormat;
  const buf = readFileSync(path);

  if (ext === 'png') {
    const pngjs = await import('pngjs');
    const png = (pngjs as unknown as { PNG: { sync: { read: (b: Buffer) => { width: number; height: number; data: Buffer } } } }).PNG.sync.read(buf as Buffer);
    const width = png.width;
    const height = png.height;
    return { data: rgbaToGlitch(png.data as unknown as Uint8ClampedArray, width, height), width, height };
  }
  if (ext === 'jpeg' || ext === 'jpg') {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(buf).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const rawBuf: Buffer = await sharp(buf).raw().toBuffer();
    const rgba = new Uint8ClampedArray(rawBuf.length * 4);
    for (let i = 0, j = 0; i < rawBuf.length; i += 4, j += 4) {
      rgba[j] = rawBuf[i];
      rgba[j + 1] = rawBuf[i + 1];
      rgba[j + 2] = rawBuf[i + 2];
      rgba[j + 3] = 255;
    }
    return { data: rgbaToGlitch(rgba, width, height), width, height };
  }

  throw new Error(`Unsupported format: ${ext}`);
}

// ── Image saving ─────────────────────────────────────────────────────────────────

/** Save GlitchBuffer back to disk as PNG or JPEG. */
export async function saveImage(
  data: Uint8Array,
  width: number,
  height: number,
  path: string
): Promise<void> {
  const ext = extname(path).toLowerCase().replace('.', '') as ImageFormat;
  const rgba = glitchToRgba(data, width, height);

  if (ext === 'png') {
    const pngjs = await import('pngjs');
    const png = new (pngjs as unknown as { PNG: new(opts: { width: number; height: number }) => { width: number; height: number; data: Buffer } }).PNG({ width, height });
    png.data = Buffer.from(data);
    const encoded = (pngjs as unknown as { PNG: { sync: { write: (png: { data: Buffer }) => Buffer } } }).PNG.sync.write(png);
    writeFileSync(path, encoded);
    return;
  }

  if (ext === 'jpeg' || ext === 'jpg') {
    const sharp = (await import('sharp')).default;
    await sharp(Buffer.from(rgba.buffer)).resize(width, height).jpeg({ quality: 90 }).toFile(path);
    return;
  }

  throw new Error(`Unsupported format: ${ext}`);
}

// ── Pipeline factory ─────────────────────────────────────────────────────────────

/** Create a new GlitchPipeline from an image file path. */
export async function createPipeline(path: string, seed?: number): Promise<GlitchPipeline> {
  const { data, width, height } = await loadImage(path);
  const rand = mulberry32(seed ?? Date.now());
  return new GlitchPipeline(data, width, height, rand);
}

// ── CLI ──────────────────────────────────────────────────────────────────────────

/** Parse CLI args: --input --output --code --seed --verbose */
export function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = { input: '', output: '', code: '' };
  let posIdx = 0;
  const keys: (keyof CliOpts)[] = ['input', 'output', 'code', 'seed', 'verbose'];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2) as keyof CliOpts;
      if (keys.includes(key)) {
        const val = opts[key];
        if (typeof val === 'string') (opts as unknown as Record<string, unknown>)[key] = argv[i + 1] ?? '';
        else if (typeof val === 'number') (opts as unknown as Record<string, unknown>)[key] = Number(argv[i + 1] ?? 0);
      }
    }
  }
  if (!opts.input && argv[posIdx] && !argv[posIdx].startsWith('--')) opts.input = argv[posIdx++];
  if (!opts.output && argv[posIdx] && !argv[posIdx].startsWith('--')) opts.output = argv[posIdx++];
  if (!opts.code && argv[posIdx] && !argv[posIdx].startsWith('--')) opts.code = argv[posIdx];

  return opts;
}

/** Run a single pipeline step: load → apply → save. */
export async function runPipeline(opts: CliOpts): Promise<void> {
  const { input, output, code, seed, verbose } = opts;

  if (!input || !output || !code) {
    throw new Error('Missing required args: --input --output --code');
  }

  const pipeline = await createPipeline(input, seed);
  if (verbose) console.log(`Loaded ${input}: ${pipeline.width}×${pipeline.height}`);

  await pipeline.apply(code, pipeline.getRand());
  if (verbose) console.log('Effects applied');

  await saveImage(pipeline.toUint8Array(), pipeline.width, pipeline.height, output);
  if (verbose) console.log(`Saved to ${output}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────────

const IS_MAIN = import.meta.url === `file://${process.argv[1]}`;

if (IS_MAIN) {
  const args = process.argv.slice(2);
  runPipeline(parseArgs(args)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}