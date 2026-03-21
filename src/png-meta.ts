import extractChunks from 'png-chunks-extract';
import text from 'png-chunk-text';
import encodeChunks from 'png-chunks-encode';

export interface PngMeta {
  seed?: string;
  script?: string; // base64-encoded
  original?: Blob; // PNG blob of original image
}

export async function writePngMeta(
  outputBlob: Blob,
  seed: string,
  b64script: string,
  originalBlob: Blob
): Promise<Blob> {
  const [outputBuf, origBuf] = await Promise.all([
    outputBlob.arrayBuffer(),
    originalBlob.arrayBuffer(),
  ]);
  const chunks = extractChunks(new Uint8Array(outputBuf));
  const iend = chunks.findIndex((c) => c.name === 'IEND');
  const insert = iend >= 0 ? iend : chunks.length;
  const originalBytes = new Uint8Array(origBuf);
  chunks.splice(
    insert,
    0,
    text.encode('glitchbuf:seed', seed),
    text.encode('glitchbuf:script', b64script),
    { name: 'gbOR', data: originalBytes }
  );
  return new Blob([encodeChunks(chunks)], { type: 'image/png' });
}

export function readPngMeta(buf: ArrayBuffer): PngMeta {
  const chunks = extractChunks(new Uint8Array(buf));
  const meta: PngMeta = {};
  for (const chunk of chunks) {
    if (chunk.name === 'tEXt') {
      const { keyword, text: value } = text.decode(chunk);
      if (keyword === 'glitchbuf:seed') meta.seed = value;
      else if (keyword === 'glitchbuf:script') meta.script = value;
    } else if (chunk.name === 'gbOR') {
      meta.original = new Blob([chunk.data], { type: 'image/png' });
    }
  }
  return meta;
}
