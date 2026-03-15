import type { IGlitchBuffer, Percentage, Decibels, Frequency } from './effects';

// ── Op definitions ────────────────────────────────────────────────────────────
// Single source of truth for every effect: name, description, param sliders,
// and the invoke binding used by makeGlitchEnv in glitchsp.ts.

export const enum ParamType {
  float = 'float',
  int = 'int',
  log = 'log',
}

export interface ParamDef {
  name: string;
  type: ParamType;
  min: number;
  max: number;
  default: number;
  step?: number;
  unit?: string;
  desc: string;
  optional?: true;
}

export const enum OpKind {
  byte = 'byte',
  image = 'image',
  buffer = 'buffer',
  audio = 'audio',
  filter = 'filter',
  wrap = 'wrap',
}

export interface OpDef {
  name: string;
  desc: string;
  kind?: OpKind; // set on all invoke-able ops; undefined for special forms
  params: ParamDef[];
  // Buffer ops only — special forms leave this undefined.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoke?: (buf: IGlitchBuffer, ...args: any[]) => any;
}

export const OPS: OpDef[] = [
  {
    name: 'bitcrush',
    desc: 'reduce bit depth of each byte.',
    kind: OpKind.byte,
    params: [
      {
        name: 'bits',
        type: ParamType.int,
        min: 1,
        max: 8,
        default: 4,
        step: 1,
        desc: 'bit depth (1–8); low values produce harsh banding, higher values are subtler',
      },
    ],
    invoke: (buf, bits) => buf.bitcrush(bits),
  },

  {
    name: 'noise',
    desc: 'add random noise (amplitude in dB).',
    kind: OpKind.buffer,
    params: [
      {
        name: 'amount',
        type: ParamType.float,
        min: -48,
        max: 24,
        default: -12,
        step: 1,
        unit: 'dB',
        desc: 'amplitude in dB; e.g. -48 = barely perceptible, -6 = heavy',
      },
    ],
    invoke: (buf, amt) => buf.noise(amt as Decibels),
  },

  {
    name: 'reverse',
    desc: 'reverse the pixel buffer.',
    kind: OpKind.buffer,
    params: [],
    invoke: (buf) => buf.reverse(),
  },

  {
    name: 'echo',
    desc: 'delay-and-mix echo effect.',
    kind: OpKind.buffer,
    params: [
      {
        name: 'delay',
        type: ParamType.float,
        min: -100,
        max: 100,
        default: 20,
        step: 1,
        unit: '%',
        desc: 'delay length as % of buffer length',
      },
      {
        name: 'gain',
        type: ParamType.float,
        min: -32,
        max: 0,
        default: -12,
        step: 1,
        unit: 'dB',
        desc: 'echo amplitude in dB (negative = quieter)',
      },
    ],
    invoke: (buf, t, g) => buf.echo(t as Percentage, g as Decibels),
  },

  {
    name: 'reverb',
    desc: 'Freeverb-style reverb.',
    kind: OpKind.audio,
    params: [
      {
        name: 'room',
        type: ParamType.float,
        min: 0,
        max: 1,
        default: 0.7,
        step: 0.01,
        desc: 'room size (0–1); larger values produce more smearing',
      },
      {
        name: 'damp',
        type: ParamType.log,
        min: 1,
        max: 14000,
        default: 3000,
        unit: 'Hz',
        desc: 'high-frequency damping cutoff in Hz',
      },
    ],
    invoke: (buf, r, d) => buf.reverb(r, d as Frequency),
  },

  {
    name: 'resize',
    desc: 'resize the image. omit height to preserve aspect ratio.',
    kind: OpKind.image,
    params: [
      {
        name: 'width',
        type: ParamType.int,
        min: 64,
        max: 4096,
        default: 1024,
        step: 1,
        unit: 'px',
        desc: 'target width in pixels',
      },
      {
        name: 'height',
        type: ParamType.int,
        min: 64,
        max: 4096,
        default: 1024,
        step: 1,
        unit: 'px',
        desc: 'target height in pixels (omit to preserve aspect ratio)',
        optional: true,
      },
    ],
    invoke: (buf, w, h) => buf.rescale(w, h),
  },

  {
    name: 'maxsize',
    desc: 'cap the longest dimension — scales down if needed, no-ops on smaller images.',
    kind: OpKind.image,
    params: [
      {
        name: 'px',
        type: ParamType.int,
        min: 64,
        max: 4096,
        default: 1024,
        step: 1,
        unit: 'px',
        desc: 'maximum pixels for the longest dimension',
      },
    ],
    invoke: (buf, px) => buf.maxsize(px),
  },

  {
    name: 'stutter',
    desc: 'randomly repeat small buffer chunks in place — cd-skip / buffer freeze effect.',
    kind: OpKind.buffer,
    params: [
      {
        name: 'size',
        type: ParamType.log,
        min: 0.01,
        max: 50,
        default: 2,
        unit: '%',
        desc: 'chunk size as % of buffer length; smaller = tighter repeats',
      },
      {
        name: 'count',
        type: ParamType.int,
        min: 1,
        max: 200,
        default: 20,
        step: 1,
        desc: 'number of stutters to apply; higher values cover more of the buffer',
      },
    ],
    invoke: (buf, s, n) => buf.stutter(s as Percentage, n),
  },

  {
    name: 'copy',
    desc: 'copy a region to another position in the buffer.',
    kind: OpKind.buffer,
    params: [
      {
        name: 'src',
        type: ParamType.float,
        min: 0,
        max: 100,
        default: 0,
        step: 1,
        unit: '%',
        desc: 'source region start (% of buffer)',
      },
      {
        name: 'end',
        type: ParamType.float,
        min: 0,
        max: 100,
        default: 50,
        step: 1,
        unit: '%',
        desc: 'source region end (% of buffer)',
      },
      {
        name: 'dst',
        type: ParamType.float,
        min: 0,
        max: 100,
        default: 50,
        step: 1,
        unit: '%',
        desc: 'destination start (% of buffer)',
      },
    ],
    invoke: (buf, s, e, t) => buf.copy(s as Percentage, e as Percentage, t as Percentage),
  },

  {
    name: 'tremolo',
    desc: 'oscillate amplitude over the buffer length.',
    kind: OpKind.audio,
    params: [
      {
        name: 'rate',
        type: ParamType.log,
        min: 1,
        max: 100000,
        default: 100,
        desc: 'number of LFO oscillations across the buffer',
      },
      {
        name: 'depth',
        type: ParamType.float,
        min: -1,
        max: 1,
        default: 0.5,
        step: 0.01,
        desc: 'modulation depth; positive = troughs go black, negative = troughs go white',
      },
    ],
    invoke: (buf, r, d) => buf.tremolo(r, d),
  },

  {
    name: 'overdrive',
    desc: 'hard-clip overdrive — amplify then clamp.',
    kind: OpKind.byte,
    params: [
      {
        name: 'drive',
        type: ParamType.float,
        min: 1,
        max: 20,
        default: 3,
        step: 0.1,
        desc: 'amplification before clipping; low = subtle, high = everything crushed to 0 or 255',
      },
    ],
    invoke: (buf, d) => buf.overdrive(d),
  },

  {
    name: 'saturate',
    desc: 'tanh soft-clip saturation.',
    kind: OpKind.byte,
    params: [
      {
        name: 'drive',
        type: ParamType.float,
        min: 1,
        max: 10,
        default: 2,
        step: 0.1,
        desc: 'saturation amount (~1 = clean, ~10 = heavy crunch)',
      },
    ],
    invoke: (buf, d) => buf.saturate(d),
  },

  {
    name: 'chorus',
    desc: 'chorus/flanger modulation effect.',
    kind: OpKind.audio,
    params: [
      {
        name: 'rate',
        type: ParamType.log,
        min: 1,
        max: 2000,
        default: 200,
        step: 1,
        unit: 'Hz',
        desc: 'LFO oscillation count',
      },
      {
        name: 'depth',
        type: ParamType.int,
        min: 0,
        max: 72,
        default: 32,
        step: 1,
        unit: 'dB',
        desc: 'modulation width in dB',
      },
    ],
    invoke: (buf, r, d) => buf.chorus(r, d as Decibels),
  },

  {
    name: 'pitchshift',
    desc: 'shift pitch by semitones.',
    kind: OpKind.audio,
    params: [
      {
        name: 'semitones',
        type: ParamType.log,
        min: -24,
        max: 24,
        default: 1,
        desc: 'pitch shift amount in semitones',
      },
      {
        name: 'feedback',
        type: ParamType.float,
        min: 0,
        max: 0.95,
        default: 0,
        step: 0.01,
        desc: 'feeds shifted signal back into input — adds cascading resonance; high values get chaotic',
        optional: true,
      },
    ],
    invoke: (buf, s, fb) => buf.pitchShift(s, fb),
  },

  {
    name: 'phaser',
    desc: 'all-pass phaser effect.',
    kind: OpKind.audio,
    params: [
      {
        name: 'freq',
        type: ParamType.log,
        min: 0.1,
        max: 2000,
        default: 10,
        unit: 'Hz',
        desc: 'LFO rate in Hz',
      },
      {
        name: 'octaves',
        type: ParamType.float,
        min: 1,
        max: 12,
        default: 3,
        step: 1,
        desc: 'sweep width in octaves',
      },
      {
        name: 'base',
        type: ParamType.log,
        min: 1,
        max: 10000,
        default: 200,
        unit: 'Hz',
        desc: 'center frequency in Hz',
      },
    ],
    invoke: (buf, f, o, b) => buf.phaser(f as Frequency, o, b as Frequency),
  },

  {
    name: 'freqshift',
    desc: 'shift all frequency components by a fixed offset.',
    kind: OpKind.audio,
    params: [
      {
        name: 'freq',
        type: ParamType.log,
        min: -20000,
        max: 20000,
        default: 1000,
        step: 1,
        unit: 'Hz',
        desc: 'shift amount in Hz (positive = up, negative = down)',
      },
    ],
    invoke: (buf, f) => buf.frequencyShift(f as Frequency),
  },

  {
    name: 'vibrato',
    desc: 'frequency modulation vibrato.',
    kind: OpKind.audio,
    params: [
      {
        name: 'freq',
        type: ParamType.log,
        min: 0,
        max: 1000,
        default: 5,
        unit: 'Hz',
        desc: 'LFO rate in Hz',
      },
      {
        name: 'depth',
        type: ParamType.float,
        min: 0,
        max: 1,
        default: 0.5,
        step: 0.01,
        desc: 'modulation depth (0–1)',
      },
    ],
    invoke: (buf, f, d) => buf.vibrato(f as Frequency, d),
  },

  {
    name: 'chebyshev',
    desc: 'chebyshev waveshaper — adds upper harmonics. positive = odd orders, negative = even orders.',
    kind: OpKind.audio,
    params: [
      {
        name: 'order',
        type: ParamType.int,
        min: -20,
        max: 20,
        default: 1,
        step: 1,
        desc: 'positive = odd harmonic orders (0→1, 1→3…), negative = even orders (−1→2, −2→4…)',
      },
    ],
    invoke: (buf, o) => buf.chebyshev(o),
  },

  {
    name: 'autowah',
    desc: 'envelope-following auto-wah filter.',
    kind: OpKind.audio,
    params: [
      {
        name: 'base',
        type: ParamType.log,
        min: 1,
        max: 2000,
        default: 250,
        unit: 'Hz',
        desc: 'center frequency in Hz',
      },
      {
        name: 'octaves',
        type: ParamType.float,
        min: 1,
        max: 8,
        default: 6,
        step: 1,
        desc: 'sweep range in octaves',
      },
      {
        name: 'sens',
        type: ParamType.float,
        min: -60,
        max: 0,
        default: -6,
        step: 1,
        unit: 'dB',
        desc: 'envelope follower sensitivity in dB',
      },
    ],
    invoke: (buf, f, o, s) => buf.autowah(f as Frequency, o, s as Decibels),
  },

  {
    name: 'feedbackdelay',
    desc: 'feedback delay line.',
    kind: OpKind.audio,
    params: [
      {
        name: 'delay',
        type: ParamType.float,
        min: 0,
        max: 100,
        default: 20,
        step: 1,
        unit: '%',
        desc: 'delay time as % of buffer length',
      },
      {
        name: 'feedback',
        type: ParamType.float,
        min: 0,
        max: 1,
        default: 0.5,
        step: 0.01,
        desc: 'feedback amount (0–1); higher values build up more echoes',
      },
    ],
    invoke: (buf, dt, fb) => buf.feedbackDelay(dt as Percentage, fb),
  },

  {
    name: 'jpeg',
    desc: 'jpeg compression artifacts — encode and decode at low quality.',
    kind: OpKind.image,
    params: [
      {
        name: 'quality',
        type: ParamType.int,
        min: 1,
        max: 100,
        default: 20,
        step: 1,
        desc: 'jpeg quality (1–100); lower values produce heavier blocking and colour artifacts',
      },
    ],
    invoke: (buf, q) => buf.jpeg(q),
  },

  {
    name: 'bayer',
    desc: 'ordered dithering using an 8×8 Bayer threshold matrix.',
    kind: OpKind.image,
    params: [
      {
        name: 'levels',
        type: ParamType.int,
        min: 2,
        max: 256,
        default: 4,
        step: 1,
        desc: 'number of quantisation levels per channel; lower values produce stronger crosshatch patterns',
      },
    ],
    invoke: (buf, n) => buf.bayer(n),
  },

  {
    name: 'diffuse',
    desc: 'Floyd-Steinberg error diffusion dithering.',
    kind: OpKind.image,
    params: [
      {
        name: 'levels',
        type: ParamType.int,
        min: 2,
        max: 256,
        default: 4,
        step: 1,
        desc: 'number of quantisation levels per channel; lower values produce more pronounced dot patterns',
      },
    ],
    invoke: (buf, n) => buf.diffuse(n),
  },

  {
    name: 'sort',
    desc: 'pixel-sort horizontally by brightness threshold.',
    kind: OpKind.image,
    params: [
      {
        name: 'threshold',
        type: ParamType.float,
        min: 0,
        max: 100,
        default: 50,
        step: 1,
        unit: '%',
        desc: 'luma threshold; sorts runs of pixels brighter than threshold%',
      },
    ],
    invoke: (buf, t) => buf.sort(t as Percentage),
  },

  {
    name: 'smear',
    desc: 'horizontal pixel smear / motion blur.',
    kind: OpKind.image,
    params: [
      {
        name: 'amount',
        type: ParamType.log,
        min: 0,
        max: 1,
        default: 0.1,
        step: 0.01,
        unit: '%',
        desc: 'smear length as fraction of pixel count',
      },
      {
        name: 'decay',
        type: ParamType.log,
        min: 0,
        max: 1,
        default: 0.1,
        step: 0.01,
        desc: 'peak value persistence (0 = no smear, 1 = hold forever)',
      },
    ],
    invoke: (buf, a, d) => buf.smear(a as Percentage, d),
  },

  {
    name: 'xor',
    desc: 'XOR each byte with a constant value.',
    kind: OpKind.byte,
    params: [
      {
        name: 'value',
        type: ParamType.int,
        min: 0,
        max: 255,
        default: 85,
        step: 1,
        desc: 'XOR mask (0–255); 85 and 170 produce structured checkerboard-like bit patterns',
      },
    ],
    invoke: (buf, v) => buf.xor(v),
  },

  {
    name: 'chromashift',
    desc: 'shift one RGB channel by a pixel offset (chromatic aberration).',
    kind: OpKind.image,
    params: [
      {
        name: 'ch',
        type: ParamType.int,
        min: 0,
        max: 2,
        default: 0,
        step: 1,
        desc: 'channel to shift (0=R, 1=G, 2=B)',
      },
      {
        name: 'dx',
        type: ParamType.float,
        min: -100,
        max: 100,
        default: 10,
        step: 0.1,
        unit: '%',
        desc: 'horizontal shift as % of image width (negative = left)',
      },
      {
        name: 'dy',
        type: ParamType.float,
        min: -100,
        max: 100,
        default: 10,
        step: 0.1,
        unit: '%',
        desc: 'vertical shift as % of image height (negative = up)',
      },
    ],
    invoke: (buf, ch, dx, dy) => buf.chromashift(ch, dx as Percentage, dy as Percentage),
  },

  {
    name: 'blur',
    desc: 'gaussian blur.',
    kind: OpKind.image,
    params: [
      {
        name: 'radius',
        type: ParamType.log,
        min: 1,
        max: 100,
        default: 3,
        step: 1,
        unit: 'px',
        desc: 'blur radius in pixels',
      },
    ],
    invoke: (buf, r) => buf.blur(r),
  },

  {
    name: 'defocus',
    desc: 'hexagonal bokeh blur — simulates a camera lens with a hexagonal aperture.',
    kind: OpKind.image,
    params: [
      {
        name: 'radius',
        type: ParamType.log,
        min: 1,
        max: 100,
        default: 8,
        step: 1,
        unit: 'px',
        desc: 'blur radius in pixels',
      },
    ],
    invoke: (buf, r) => buf.defocus(r),
  },

  {
    name: 'warp',
    desc: 'barrel (amount>0) or pincushion (amount<0) lens distortion.',
    kind: OpKind.image,
    params: [
      {
        name: 'amount',
        type: ParamType.float,
        min: -1,
        max: 1,
        default: 0.3,
        step: 0.01,
        desc: 'distortion strength; positive = barrel (CRT), negative = pincushion',
      },
    ],
    invoke: (buf, a) => buf.warp(a),
  },

  {
    name: 'pixelate',
    desc: 'average NxN pixel blocks into flat squares.',
    kind: OpKind.image,
    params: [
      {
        name: 'size',
        type: ParamType.int,
        min: 2,
        max: 256,
        default: 8,
        step: 1,
        unit: 'px',
        desc: 'block size in pixels; larger values produce a coarser mosaic',
      },
    ],
    invoke: (buf, s) => buf.pixelate(s),
  },

  {
    name: 'polar',
    desc: 'remap to polar coordinates — x becomes angle, y becomes radius.',
    kind: OpKind.image,
    params: [],
    invoke: (buf) => buf.polar(),
  },

  {
    name: 'flip',
    desc: 'flip the image vertically (reverse row order).',
    kind: OpKind.image,
    params: [],
    invoke: (buf) => buf.flip(),
  },

  {
    name: 'mirror',
    desc: 'mirror the image horizontally (reverse pixel order within each row).',
    kind: OpKind.image,
    params: [],
    invoke: (buf) => buf.mirror(),
  },

  {
    name: 'displace',
    desc: 'use R channel to displace X, G channel to displace Y — self-referential warp.',
    kind: OpKind.image,
    params: [
      {
        name: 'amount',
        type: ParamType.float,
        min: 0,
        max: 100,
        default: 10,
        step: 0.5,
        unit: '%',
        desc: 'max displacement as % of image dimensions',
      },
    ],
    invoke: (buf, a) => buf.displace(a as Percentage),
  },

  {
    name: 'tunnel',
    desc: 'additively composite n zoomed copies — zoom tunnel effect.',
    kind: OpKind.image,
    params: [
      {
        name: 'n',
        type: ParamType.int,
        min: 1,
        max: 16,
        default: 6,
        step: 1,
        desc: 'number of zoom layers to composite',
      },
      {
        name: 'zoom',
        type: ParamType.float,
        min: 0.5,
        max: 0.99,
        default: 0.8,
        step: 0.01,
        desc: 'scale factor per layer; lower = tighter tunnel',
      },
      {
        name: 'decay',
        type: ParamType.float,
        min: 0.1,
        max: 0.95,
        default: 0.5,
        step: 0.01,
        desc: 'brightness decay per layer; lower = dimmer inner rings',
      },
      {
        name: 'angle',
        type: ParamType.float,
        min: -180,
        max: 180,
        default: 0,
        step: 0.5,
        unit: '°',
        desc: 'rotation per layer in degrees; creates a spiral tunnel effect',
        optional: true,
      },
      {
        name: 'offsetX',
        type: ParamType.float,
        min: -50,
        max: 50,
        default: 0,
        step: 0.5,
        unit: '%',
        desc: 'horizontal offset of the vanishing point as % of image width',
        optional: true,
      },
      {
        name: 'offsetY',
        type: ParamType.float,
        min: -50,
        max: 50,
        default: 0,
        step: 0.5,
        unit: '%',
        desc: 'vertical offset of the vanishing point as % of image height',
        optional: true,
      },
    ],
    invoke: (buf, n, z, d, a, ox, oy) => buf.tunnel(n, z, d, a, ox, oy),
  },

  {
    name: 'vignette',
    desc: 'darken pixels toward the edges with a radial gradient.',
    kind: OpKind.image,
    params: [
      {
        name: 'strength',
        type: ParamType.float,
        min: 0,
        max: 1,
        default: 0.8,
        step: 0.05,
        desc: 'how dark the outer edge gets (0=no effect, 1=black)',
      },
      {
        name: 'softness',
        type: ParamType.float,
        min: 0,
        max: 2,
        default: 0.7,
        step: 0.05,
        desc: 'width of the transition band (0=hard edge at the ring, 1=gradient spans the whole image)',
        optional: true,
      },
      {
        name: 'size',
        type: ParamType.float,
        min: 0.5,
        max: 4,
        default: 1,
        step: 0.1,
        desc: 'where the dark ring sits as a multiple of the corner distance; >1 pushes it outside the image for a less circular look',
        optional: true,
      },
    ],
    invoke: (buf, s, f, z) => buf.vignette(s, f, z),
  },

  {
    name: 'bitrot',
    desc: 'randomly flip individual bits — organic corruption at the bit level.',
    kind: OpKind.byte,
    params: [
      {
        name: 'prob',
        type: ParamType.log,
        min: 0.0001,
        max: 0.5,
        default: 0.01,
        desc: 'per-bit flip probability; 0.01 = ~1% of bits, 0.5 = ~half (full noise)',
      },
    ],
    invoke: (buf, p) => buf.bitrot(p),
  },

  {
    name: 'resample',
    desc: 'nearest-neighbour 1D downsample — each byte held for N samples, creating blocky aliasing.',
    kind: OpKind.buffer,
    params: [
      {
        name: 'factor',
        type: ParamType.int,
        min: 2,
        max: 256,
        default: 8,
        step: 1,
        desc: 'hold length in bytes; larger values produce coarser, blockier artifacts',
      },
    ],
    invoke: (buf, f) => buf.resample(f),
  },

  {
    name: 'levels',
    desc: 'remap input range [black, white] to 0–255.',
    kind: OpKind.byte,
    params: [
      {
        name: 'black',
        type: ParamType.int,
        min: 0,
        max: 254,
        default: 0,
        step: 1,
        desc: 'input black point (0–254); bytes at or below this map to 0',
      },
      {
        name: 'white',
        type: ParamType.int,
        min: 1,
        max: 255,
        default: 255,
        step: 1,
        desc: 'input white point (1–255); bytes at or above this map to 255',
      },
    ],
    invoke: (buf, b, w) => buf.levels(b, w),
  },

  {
    name: 'gamma',
    desc: 'power-curve each byte. g<1 brightens, g>1 darkens.',
    kind: OpKind.byte,
    params: [
      {
        name: 'g',
        type: ParamType.log,
        min: 0.1,
        max: 10,
        default: 1,
        desc: 'gamma exponent; <1 brightens, >1 darkens, 1 = passthrough',
      },
    ],
    invoke: (buf, g) => buf.gamma(g),
  },

  {
    name: 'invert',
    desc: 'invert (negate) every byte in the buffer.',
    kind: OpKind.byte,
    params: [],
    invoke: (buf) => buf.invert(),
  },

  {
    name: 'shuffle',
    desc: 'randomly swap a fraction of pixels.',
    kind: OpKind.buffer,
    params: [
      {
        name: 'amount',
        type: ParamType.float,
        min: 0,
        max: 100,
        default: 50,
        step: 1,
        unit: '%',
        desc: 'fraction of pixels to swap; higher values approach full randomisation',
      },
    ],
    invoke: (buf, pct) => buf.shuffle(pct as Percentage),
  },

  {
    name: 'quantize',
    desc: 'reduce colour to N evenly-spaced levels per channel.',
    kind: OpKind.byte,
    params: [
      {
        name: 'levels',
        type: ParamType.int,
        min: 2,
        max: 256,
        default: 8,
        step: 1,
        desc: 'number of discrete levels per channel (≥2); lower values produce more pronounced posterisation',
      },
    ],
    invoke: (buf, n) => buf.quantize(n),
  },

  {
    name: 'fold',
    desc: 'waveform-folding distortion.',
    kind: OpKind.byte,
    params: [
      {
        name: 'drive',
        type: ParamType.float,
        min: 0.5,
        max: 5,
        default: 1.5,
        step: 0.1,
        desc: 'fold amount (≤0.5 = passthrough, ~1 = one fold, higher = chaotic recursive folding)',
      },
    ],
    invoke: (buf, d) => buf.fold(d),
  },

  {
    name: 'solarize',
    desc: 'invert bytes above threshold (solarise effect).',
    kind: OpKind.byte,
    params: [
      {
        name: 'threshold',
        type: ParamType.float,
        min: 0,
        max: 1,
        default: 0.5,
        step: 0.01,
        desc: 'inversion threshold (0–1 fraction of 255); bytes above this are inverted',
      },
    ],
    invoke: (buf, t) => buf.solarize(t),
  },

  {
    name: 'lowpass',
    desc: 'biquad low-pass filter — attenuates high-frequency byte patterns.',
    kind: OpKind.filter,
    params: [
      {
        name: 'freq',
        type: ParamType.log,
        min: 0,
        max: 20000,
        default: 1000,
        unit: 'Hz',
        desc: 'cutoff frequency in Hz; lower values produce a smoother, blurrier result',
      },
      {
        name: 'Q',
        type: ParamType.log,
        min: 0.1,
        max: 100,
        default: 1,
        desc: 'resonance at the cutoff; higher values add a ringing peak',
      },
      {
        name: 'rolloff',
        type: ParamType.int,
        min: 1,
        max: 4,
        default: 1,
        step: 1,
        desc: 'filter slope: 1 = -12dB/oct (gentle), 2 = -24, 3 = -48, 4 = -96dB/oct (steep)',
        optional: true,
      },
    ],
    invoke: (buf, f, q, r) =>
      buf.lowpass(
        f as Frequency,
        q,
        r !== undefined ? [-12, -24, -48, -96][Math.round(r) - 1] : undefined
      ),
  },

  {
    name: 'highpass',
    desc: 'biquad high-pass filter — attenuates low-frequency byte patterns.',
    kind: OpKind.filter,
    params: [
      {
        name: 'freq',
        type: ParamType.log,
        min: 0,
        max: 20000,
        default: 1000,
        unit: 'Hz',
        desc: 'cutoff frequency in Hz; higher values keep only sharp edges/transitions',
      },
      {
        name: 'Q',
        type: ParamType.log,
        min: 0.1,
        max: 100,
        default: 1,
        desc: 'resonance at the cutoff; higher values add a ringing peak',
      },
      {
        name: 'rolloff',
        type: ParamType.int,
        min: 1,
        max: 4,
        default: 1,
        step: 1,
        desc: 'filter slope: 1 = -12dB/oct (gentle), 2 = -24, 3 = -48, 4 = -96dB/oct (steep)',
        optional: true,
      },
    ],
    invoke: (buf, f, q, r) =>
      buf.highpass(
        f as Frequency,
        q,
        r !== undefined ? [-12, -24, -48, -96][Math.round(r) - 1] : undefined
      ),
  },

  {
    name: 'bandpass',
    desc: 'biquad band-pass filter — isolates a frequency band of byte patterns.',
    kind: OpKind.filter,
    params: [
      {
        name: 'freq',
        type: ParamType.log,
        min: 0,
        max: 20000,
        default: 1000,
        unit: 'Hz',
        desc: 'center frequency in Hz',
      },
      {
        name: 'Q',
        type: ParamType.log,
        min: 0.1,
        max: 100,
        default: 1,
        desc: 'Q factor — higher values narrow the pass band',
      },
    ],
    invoke: (buf, f, q) => buf.bandpass(f as Frequency, q),
  },

  {
    name: 'notch',
    desc: 'notch filter — attenuates a narrow frequency band.',
    kind: OpKind.filter,
    params: [
      {
        name: 'freq',
        type: ParamType.log,
        min: 0,
        max: 20000,
        default: 1000,
        unit: 'Hz',
        desc: 'center frequency to reject in Hz',
      },
      {
        name: 'Q',
        type: ParamType.log,
        min: 0.1,
        max: 100,
        default: 1,
        desc: 'Q factor — higher values narrow the notch',
      },
    ],
    invoke: (buf, f, q) => buf.notch(f as Frequency, q),
  },

  {
    name: 'lowshelf',
    desc: 'low-shelf filter — boost or cut frequencies below the cutoff.',
    kind: OpKind.filter,
    params: [
      {
        name: 'freq',
        type: ParamType.log,
        min: 0,
        max: 20000,
        default: 1000,
        unit: 'Hz',
        desc: 'shelf frequency in Hz; frequencies below this are affected',
      },
      {
        name: 'gain',
        type: ParamType.float,
        min: -24,
        max: 48,
        default: 6,
        step: 1,
        unit: 'dB',
        desc: 'boost (positive) or cut (negative) amount in dB',
      },
    ],
    invoke: (buf, f, g) => buf.lowshelf(f as Frequency, g as Decibels),
  },

  {
    name: 'highshelf',
    desc: 'high-shelf filter — boost or cut frequencies above the cutoff.',
    kind: OpKind.filter,
    params: [
      {
        name: 'freq',
        type: ParamType.log,
        min: 0,
        max: 20000,
        default: 1000,
        unit: 'Hz',
        desc: 'shelf frequency in Hz; frequencies above this are affected',
      },
      {
        name: 'gain',
        type: ParamType.float,
        min: -24,
        max: 48,
        default: 6,
        step: 1,
        unit: 'dB',
        desc: 'boost (positive) or cut (negative) amount in dB',
      },
    ],
    invoke: (buf, f, g) => buf.highshelf(f as Frequency, g as Decibels),
  },

  // Special forms — evaluated lazily in evaluate(); invoke is unused.
  {
    name: 'select',
    kind: OpKind.wrap,
    desc: 'apply body to a sub-region of the buffer.\nusage: (select start end body)',
    params: [
      {
        name: 'start',
        type: ParamType.float,
        min: 0,
        max: 100,
        default: 0,
        step: 1,
        unit: '%',
        desc: 'selection start as % of buffer',
      },
      {
        name: 'end',
        type: ParamType.float,
        min: 0,
        max: 100,
        default: 50,
        step: 1,
        unit: '%',
        desc: 'selection end as % of buffer',
      },
    ],
  },
  {
    name: 'repeat',
    kind: OpKind.wrap,
    desc: 'repeat a body N times.\nusage: (repeat n body)',
    params: [
      {
        name: 'n',
        type: ParamType.int,
        min: 1,
        max: 12,
        default: 2,
        step: 1,
        desc: 'number of times to repeat the body',
      },
    ],
  },
  {
    name: 'scale',
    kind: OpKind.wrap,
    desc: 'downscale, apply body, then upscale back — produces lo-fi pixel artifacts.\nusage: (scale factor body)',
    params: [
      {
        name: 'factor',
        type: ParamType.float,
        min: 0.05,
        max: 1,
        default: 0.25,
        step: 0.01,
        desc: 'scale factor (0.05–1); lower values produce blockier, more pixelated results',
      },
    ],
  },
  {
    name: 'luma',
    kind: OpKind.wrap,
    desc: 'apply body to the luminance channel only, preserving colour.\nusage: (luma body)',
    params: [],
  },
  {
    name: 'transpose',
    kind: OpKind.wrap,
    desc: 'flip the pixel grid so ops apply top-to-bottom instead of left-to-right, then flip back.\nusage: (transpose body)',
    params: [],
  },
  {
    name: 'channel',
    kind: OpKind.wrap,
    desc: 'apply body to a single RGB channel (R=0 G=1 B=2).\nusage: (channel ch body)',
    params: [
      {
        name: 'ch',
        type: ParamType.int,
        min: 0,
        max: 2,
        default: 0,
        step: 1,
        desc: 'channel index (0=R, 1=G, 2=B)',
      },
    ],
  },
  {
    name: 'stride',
    kind: OpKind.wrap,
    desc: 'apply body to evenly-spaced chunks.\nusage: (stride len skip body)',
    params: [
      {
        name: 'len',
        type: ParamType.float,
        min: 0.1,
        max: 100,
        default: 10,
        step: 0.1,
        unit: '%',
        desc: 'chunk length as % of buffer',
      },
      {
        name: 'skip',
        type: ParamType.int,
        min: 0,
        max: 16,
        default: 0,
        step: 1,
        desc: 'number of chunks to skip between each processed chunk',
      },
    ],
  },
  {
    name: 'mix',
    kind: OpKind.wrap,
    desc: 'blend body result with pre-body snapshot at wet ratio.\nusage: (mix wet body)',
    params: [
      {
        name: 'wet',
        type: ParamType.float,
        min: 0,
        max: 1,
        default: 0.5,
        step: 0.01,
        desc: 'wet/dry mix ratio (0 = fully dry, 1 = fully wet)',
      },
    ],
  },
  {
    name: 'do',
    desc: 'evaluate multiple forms in sequence.\nusage: (do form ...)',
    params: [],
  },
  {
    name: 'let',
    desc: 'bind names in scope.\nusage: (let [sym val ...] body?)',
    params: [],
  },
  {
    name: 'fn',
    desc: 'create an anonymous function.\nusage: (fn [params...] body)',
    params: [],
  },
  {
    name: 'if',
    desc: 'conditional evaluation.\nusage: (if cond then else?)',
    params: [],
  },
];

export const OP_MAP = new Map(OPS.map((op) => [op.name, op]));
