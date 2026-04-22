import { GlitchBuffer } from './effects';
import sharp from 'sharp';
import { runGlitchsp } from './glitchsp.js';

interface Effect {
  name: string;
  params: unknown[];
}

async function loadImage(path: string): Promise<{ data: Uint8Array; width: number; height: number }> {
  const image = sharp(path);
  const metadata = await image.metadata();
  const { width, height } = metadata;
  if (!width || !height) throw new Error('Could not determine image dimensions');
  const rgbaBuffer = await image.ensureAlpha().raw().toBuffer();
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
  const buf = new GlitchBuffer(new Uint8Array(originalData), width, height);
  const rand = Math.random;

  for (let seqIndex = 0; seqIndex < sequences.length; seqIndex++) {
    const sequence = sequences[seqIndex];
    buf.data.set(new Uint8Array(originalData));

    const code = sequence
      .map((effect) => {
        const { name, params } = effect;
        const paramStr = params
          .map((p) => {
            if (typeof p === 'string') return p;
            if (typeof p === 'number') return String(p);
            if (Array.isArray(p)) {
              return p
                .map((inner) => {
                  if (typeof inner === 'object' && inner !== null && 'name' in inner) {
                    return `(${inner.name} ${(inner.params || []).join(' ')})`;
                  }
                  return String(inner);
                })
                .join(' ');
            }
            return String(p);
          })
          .join(' ');
        return `(${name} ${paramStr})`;
      })
      .join('\n');

    await runGlitchsp(code, buf, rand);

    const rgba = bufferToRgba(buf);
    await sharp(rgba, { raw: { width, height, channels: 4 } })
      .png()
      .toFile(`${outputPath}.${seqIndex}.png`);
  }
}

export { processImage };
export type { Effect };