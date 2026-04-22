declare module 'pngjs' {
  interface IPng {
    width: number;
    height: number;
    data: Buffer;
  }
  interface PngJsStatic {
    PNG: {
      new(opts: { width: number; height: number }): IPng;
      sync: {
        read(buffer: Buffer): IPng;
        write(png: IPng): Buffer;
      };
    };
  }
  const pngjs: PngJsStatic;
  export default pngjs;
}

declare module 'png-chunks-parse' {
  export interface PngChunk {
    name: string;
    chunk: { data: unknown };
  }
  export function extract(buffer: Buffer): PngChunk[];
}

declare module 'png-chunks-encode' {
  import type { PngChunk } from 'png-chunks-parse';
  const encodeChunks: (chunks: PngChunk[], opts?: { ignoreEnd?: boolean }) => Uint8Array;
  export default encodeChunks;
}