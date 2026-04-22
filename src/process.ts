import { GlitchBuffer } from './effects';
import sharp from 'sharp';

interface Effect {
  name: string;
  params: unknown[];
}


async function loadImage(path: string): Promise<{ data: Uint8Array; width: number; height: number }> {
  const image = sharp(path);
  const metadata = await image.metadata();
  const { width, height } = metadata;
  if (!width || !height) {
    throw new Error('Could not determine image dimensions');
  }
  const rgbaBuffer = await image
    .ensureAlpha()
    .raw()
    .toBuffer();
  const rgbBuffer = new Uint8Array(width * height * 3);
  let src = 0;
  let dst = 0;
  while (src < rgbaBuffer.length) {
    rgbBuffer[dst++] = rgbaBuffer[src++];
    rgbBuffer[dst++] = rgbaBuffer[src++];
    rgbBuffer[dst++] = rgbaBuffer[src++];
    src++;
  }
  return { data: rgbBuffer, width, height };
}

function bufferToRgba(buf: GlitchBuffer): Uint8ClampedArray {
  const { width, height, data } = buf;
  const rgba = new Uint8ClampedArray(width * height * 4);
  let si = 0;
  let di = 0;
  while (si < data.length) {
    rgba[di++] = data[si++];
    rgba[di++] = data[si++];
    rgba[di++] = data[si++];
    rgba[di++] = 255;
  }
  return rgba;
}

async function processImage(
  inputPath: string,
  outputPath: string,
  sequences: Effect[][]
): Promise<void> {
  const { data: originalData, width, height } = await loadImage(inputPath);

  for (let seqIndex = 0; seqIndex < sequences.length; seqIndex++) {
    const sequence = sequences[seqIndex];
    const dataCopy = new Uint8Array(originalData);
    const buf = new GlitchBuffer(dataCopy, width, height);

    for (const effect of sequence) {
      const { name, params } = effect;
      const fn = buf[name as keyof typeof buf] as (this: GlitchBuffer, ...args: unknown[]) => unknown;
      if (typeof fn !== 'function') {
        throw new Error(`Unknown effect: ${name}`);
      }
      const result = fn.call(buf, ...params);
      if (result instanceof Promise) {
        await result;
      }
    }

    const rgba = bufferToRgba(buf);
    await sharp(
      rgba,
      {
        raw: {
          width,
          height,
          channels: 4,
        }
      }
    )
    .png()
    .toFile(`${outputPath}.${seqIndex}.png`);
  }
}

export { processImage };
export type { Effect };