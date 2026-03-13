/// <reference path="effects.ts" />

// ── Op definitions ────────────────────────────────────────────────────────────
// Single source of truth for every effect: name, description, param sliders,
// and the invoke binding used by makeGlitchEnv in glitchsp.ts.

const enum ParamType { float = 'float', int = 'int', log = 'log' }

interface ParamDef {
  name: string;
  type: ParamType;
  min: number; max: number; default: number;
  step?: number; unit?: string;
}

const enum OpKind { audio = 'audio', byte = 'byte', pixel = 'pixel', image = 'image', wrap = 'wrap' }

interface OpDef {
  name: string;
  desc: string;
  kind?: OpKind;  // set on all invoke-able ops; undefined for special forms
  params: ParamDef[];
  // Buffer ops only — special forms leave this undefined.
  invoke?: (buf: IGlitchBuffer, ...args: any[]) => any;
}

const OPS: OpDef[] = [
  {
    name: 'bitcrush', desc: 'reduce bit depth of each byte.', kind: OpKind.byte, params: [
      { name: 'bits', type: ParamType.int, min: 1, max: 8, default: 4, step: 1 },
    ], invoke: (buf, bits) => buf.bitcrush(bits)
  },

  {
    name: 'noise', desc: 'add random noise (amplitude in dB).', kind: OpKind.byte, params: [
      { name: 'amount', type: ParamType.float, min: -24, max: 24, default: -12, step: 1, unit: 'dB' },
    ], invoke: (buf, amt) => buf.noise(amt as Decibels)
  },

  {
    name: 'reverse', desc: 'reverse the pixel buffer.', kind: OpKind.audio, params: [],
    invoke: (buf) => buf.reverse()
  },

  {
    name: 'echo', desc: 'delay-and-mix echo effect.', kind: OpKind.audio, params: [
      { name: 'delay', type: ParamType.float, min: -100, max: 100, default: 20, step: 1, unit: '%' },
      { name: 'gain', type: ParamType.float, min: -32, max: 0, default: -12, step: 1, unit: 'dB' },
    ], invoke: (buf, t, g) => buf.echo(t as Percentage, g as Decibels)
  },

  {
    name: 'reverb', desc: 'Freeverb-style reverb.', kind: OpKind.audio, params: [
      { name: 'room', type: ParamType.float, min: 0, max: 1, default: 0.7, step: 0.01 },
      { name: 'damp', type: ParamType.log, min: 1, max: 14000, default: 3000, unit: 'Hz' },
    ], invoke: (buf, r, d) => buf.reverb(r, d as Frequency)
  },

  {
    name: 'rescale', desc: 'resize the image. omit height to preserve aspect ratio.', kind: OpKind.image, params: [
      { name: 'width', type: ParamType.int, min: 64, max: 4096, default: 1024, step: 1, unit: 'px' },
      { name: 'height', type: ParamType.int, min: 64, max: 4096, default: 1024, step: 1, unit: 'px' },
    ], invoke: (buf, w, h) => buf.rescale(w, h)
  },

  {
    name: 'resize', desc: 'resize the image. omit height to preserve aspect ratio. (alias for rescale)', kind: OpKind.image, params: [
      { name: 'width', type: ParamType.int, min: 64, max: 4096, default: 1024, step: 1, unit: 'px' },
      { name: 'height', type: ParamType.int, min: 64, max: 4096, default: 1024, step: 1, unit: 'px' },
    ], invoke: (buf, w, h) => buf.rescale(w, h)
  },

  {
    name: 'copy', desc: 'copy a region to another position in the buffer.', kind: OpKind.audio, params: [
      { name: 'src', type: ParamType.float, min: 0, max: 100, default: 0, step: 1, unit: '%' },
      { name: 'end', type: ParamType.float, min: 0, max: 100, default: 50, step: 1, unit: '%' },
      { name: 'dst', type: ParamType.float, min: 0, max: 100, default: 50, step: 1, unit: '%' },
    ], invoke: (buf, s, e, t) => buf.copy(s as Percentage, e as Percentage, t as Percentage)
  },

  {
    name: 'tremolo', desc: 'oscillate amplitude over the buffer length.', kind: OpKind.audio, params: [
      { name: 'rate', type: ParamType.log, min: 1, max: 100000, default: 100 },
      { name: 'depth', type: ParamType.float, min: 0, max: 1, default: 0.5, step: 0.01 },
    ], invoke: (buf, r, d) => buf.tremolo(r, d)
  },

  {
    name: 'distort', desc: 'tanh waveshaper distortion.', kind: OpKind.byte, params: [
      { name: 'drive', type: ParamType.float, min: 1, max: 10, default: 2, step: 0.1 },
    ], invoke: (buf, d) => buf.distort(d)
  },

  {
    name: 'chorus', desc: 'chorus/flanger modulation effect.', kind: OpKind.audio, params: [
      { name: 'rate', type: ParamType.log, min: 1, max: 2000, default: 200, step: 1, unit: 'Hz' },
      { name: 'depth', type: ParamType.int, min: 0, max: 72, default: 32, step: 1, unit: 'dB' },
    ], invoke: (buf, r, d) => buf.chorus(r, d as Decibels)
  },

  {
    name: 'pitchshift', desc: 'shift pitch by semitones.', kind: OpKind.audio, params: [
      { name: 'semitones', type: ParamType.float, min: -24, max: 24, default: 1, step: 0.1 },
    ], invoke: (buf, s) => buf.pitchShift(s)
  },

  {
    name: 'phaser', desc: 'all-pass phaser effect.', kind: OpKind.audio, params: [
      { name: 'freq', type: ParamType.log, min: 1, max: 2000, default: 10, unit: 'Hz' },
      { name: 'octaves', type: ParamType.float, min: 1, max: 12, default: 3, step: 1 },
      { name: 'base', type: ParamType.log, min: 1, max: 10000, default: 200, unit: 'Hz' },
    ], invoke: (buf, f, o, b) => buf.phaser(f as Frequency, o, b as Frequency)
  },

  {
    name: 'freqshift', desc: 'shift all frequency components by a fixed offset.', kind: OpKind.audio, params: [
      { name: 'freq', type: ParamType.log, min: -20000, max: 20000, default: 1000, step: 1, unit: 'Hz' },
    ], invoke: (buf, f) => buf.frequencyShift(f as Frequency)
  },

  {
    name: 'vibrato', desc: 'frequency modulation vibrato.', kind: OpKind.audio, params: [
      { name: 'freq', type: ParamType.log, min: 0, max: 1000, default: 5, unit: 'Hz' },
      { name: 'depth', type: ParamType.float, min: 0, max: 1, default: 0.5, step: 0.01 },
    ], invoke: (buf, f, d) => buf.vibrato(f as Frequency, d)
  },

  {
    name: 'chebyshev', desc: 'chebyshev waveshaper — adds upper harmonics. positive = odd orders, negative = even orders.', kind: OpKind.audio, params: [
      { name: 'order', type: ParamType.int, min: -20, max: 20, default: 1, step: 1 },
    ], invoke: (buf, o) => buf.chebyshev(o)
  },

  {
    name: 'autowah', desc: 'envelope-following auto-wah filter.', kind: OpKind.audio, params: [
      { name: 'base', type: ParamType.log, min: 1, max: 2000, default: 250, unit: 'Hz' },
      { name: 'octaves', type: ParamType.float, min: 1, max: 8, default: 6, step: 1 },
      { name: 'sens', type: ParamType.float, min: -60, max: 0, default: -6, step: 1, unit: 'dB' },
    ], invoke: (buf, f, o, s) => buf.autowah(f as Frequency, o, s as Decibels)
  },

  {
    name: 'feedbackdelay', desc: 'feedback delay line.', kind: OpKind.audio, params: [
      { name: 'delay', type: ParamType.float, min: 0, max: 100, default: 20, step: 1, unit: '%' },
      { name: 'feedback', type: ParamType.float, min: 0, max: 1, default: 0.5, step: 0.01 },
    ], invoke: (buf, dt, fb) => buf.feedbackDelay(dt as Percentage, fb)
  },

  {
    name: 'sort', desc: 'pixel-sort horizontally by brightness threshold.', kind: OpKind.pixel, params: [
      { name: 'threshold', type: ParamType.float, min: 0, max: 100, default: 50, step: 1, unit: '%' },
    ], invoke: (buf, t) => buf.sort(t as Percentage)
  },

  {
    name: 'sortvertical', desc: 'pixel-sort vertically by brightness threshold.', kind: OpKind.pixel, params: [
      { name: 'threshold', type: ParamType.float, min: 0, max: 100, default: 50, step: 1, unit: '%' },
    ], invoke: (buf, t) => buf.sortvertical(t as Percentage)
  },

  {
    name: 'smear', desc: 'horizontal pixel smear / motion blur.', kind: OpKind.pixel, params: [
      { name: 'amount', type: ParamType.log, min: 0, max: 1, default: 0.1, step: 0.01, unit: '%' },
      { name: 'decay', type: ParamType.log, min: 0, max: 1, default: 0.1, step: 0.01 },
    ], invoke: (buf, a, d) => buf.smear(a as Percentage, d)
  },

  {
    name: 'xor', desc: 'XOR each byte with a constant value.', kind: OpKind.byte, params: [
      { name: 'value', type: ParamType.int, min: 0, max: 255, default: 85, step: 1 },
    ], invoke: (buf, v) => buf.xor(v)
  },

  {
    name: 'transpose', desc: 'shift one RGB channel by a pixel offset.', kind: OpKind.image, params: [
      { name: 'ch', type: ParamType.int, min: 0, max: 2, default: 0, step: 1 },
      { name: 'dx', type: ParamType.float, min: -100, max: 100, default: 10, step: 0.1, unit: '%' },
      { name: 'dy', type: ParamType.float, min: -100, max: 100, default: 10, step: 0.1, unit: '%' },
    ], invoke: (buf, ch, dx, dy) => buf.transpose(ch, dx as Percentage, dy as Percentage)
  },

  {
    name: 'invert', desc: 'invert (negate) every byte in the buffer.', kind: OpKind.byte, params: [],
    invoke: (buf) => buf.invert()
  },

  {
    name: 'shuffle', desc: 'randomly swap a fraction of pixels.', kind: OpKind.pixel, params: [
      { name: 'amount', type: ParamType.float, min: 0, max: 100, default: 50, step: 1, unit: '%' },
    ], invoke: (buf, pct) => buf.shuffle(pct as Percentage)
  },

  {
    name: 'quantize', desc: 'reduce colour to N evenly-spaced levels per channel.', kind: OpKind.byte, params: [
      { name: 'levels', type: ParamType.int, min: 2, max: 256, default: 8, step: 1 },
    ], invoke: (buf, n) => buf.quantize(n)
  },

  {
    name: 'fold', desc: 'waveform-folding distortion.', kind: OpKind.byte, params: [
      { name: 'drive', type: ParamType.float, min: 0.5, max: 5, default: 1.5, step: 0.1 },
    ], invoke: (buf, d) => buf.fold(d)
  },

  {
    name: 'solarize', desc: 'invert bytes above threshold (solarise effect).', kind: OpKind.byte, params: [
      { name: 'threshold', type: ParamType.float, min: 0, max: 1, default: 0.5, step: 0.01 },
    ], invoke: (buf, t) => buf.solarize(t)
  },

  // Special forms — evaluated lazily in evaluate(); invoke is unused.
  {
    name: 'select', kind: OpKind.wrap,
    desc: 'apply body to a sub-region of the buffer.\nusage: (select start end body)',
    params: [
      { name: 'start', type: ParamType.float, min: 0, max: 100, default: 0, step: 1, unit: '%' },
      { name: 'end', type: ParamType.float, min: 0, max: 100, default: 50, step: 1, unit: '%' },
    ]
  },
  {
    name: 'repeat', kind: OpKind.wrap,
    desc: 'repeat a body N times.\nusage: (repeat n body)',
    params: [
      { name: 'n', type: ParamType.int, min: 1, max: 12, default: 2, step: 1 },
    ]
  },
  {
    name: 'channel', kind: OpKind.wrap,
    desc: 'apply body to a single RGB channel (R=0 G=1 B=2).\nusage: (channel ch body)',
    params: [
      { name: 'ch', type: ParamType.int, min: 0, max: 2, default: 0, step: 1 },
    ]
  },
  {
    name: 'stride', kind: OpKind.wrap,
    desc: 'apply body to evenly-spaced chunks.\nusage: (stride len skip body)',
    params: [
      { name: 'len', type: ParamType.float, min: 0.1, max: 100, default: 10, step: 0.1, unit: '%' },
      { name: 'skip', type: ParamType.int, min: 0, max: 16, default: 0, step: 1 },
    ]
  },
  {
    name: 'mix', kind: OpKind.wrap,
    desc: 'blend body result with pre-body snapshot at wet ratio.\nusage: (mix wet body)',
    params: [
      { name: 'wet', type: ParamType.float, min: 0, max: 1, default: 0.5, step: 0.01 },
    ]
  },
  {
    name: 'do',
    desc: 'evaluate multiple forms in sequence.\nusage: (do form ...)',
    params: []
  },
  {
    name: 'let',
    desc: 'bind names in scope.\nusage: (let [sym val ...] body?)',
    params: []
  },
  {
    name: 'fn',
    desc: 'create an anonymous function.\nusage: (fn [params...] body)',
    params: []
  },
  {
    name: 'if',
    desc: 'conditional evaluation.\nusage: (if cond then else?)',
    params: []
  },
];

const OP_MAP = new Map(OPS.map(op => [op.name, op]));
