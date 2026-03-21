/// <reference types="vite/client" />

declare module '*.md' {
  const html: string;
  export default html;
}

declare module 'png-chunks-extract' {
  interface PngChunk {
    name: string;
    data: Uint8Array<ArrayBuffer>;
  }
  function extractChunks(data: Uint8Array): PngChunk[];
  export = extractChunks;
}

declare module 'png-chunk-text' {
  interface PngChunk {
    name: string;
    data: Uint8Array<ArrayBuffer>;
  }
  interface TextChunk {
    keyword: string;
    text: string;
  }
  const pngChunkText: {
    encode(keyword: string, content: string): PngChunk;
    decode(chunk: PngChunk | Uint8Array): TextChunk;
  };
  export = pngChunkText;
}

declare module 'png-chunks-encode' {
  interface PngChunk {
    name: string;
    data: Uint8Array<ArrayBuffer>;
  }
  function encodeChunks(chunks: PngChunk[]): Uint8Array<ArrayBuffer>;
  export = encodeChunks;
}
