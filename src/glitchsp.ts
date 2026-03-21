import type { IGlitchBuffer, Percentage, Wet } from './effects';
import { OPS } from './ops';

// ── PRNG ───────────────────────────────────────────────────────────────────
// Mulberry32 — fast, good quality, fully seedable 32-bit PRNG.

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Types ──────────────────────────────────────────────────────────────────

export type GlitchFn = (...args: GlitchVal[]) => GlitchVal | Promise<GlitchVal>;
export type GlitchVal = number | string | boolean | null | GlitchVal[] | IGlitchBuffer | GlitchFn;
export type BufCell = { val: IGlitchBuffer };

// ── Source-spanning parse tree ─────────────────────────────────────────────
// ParseNode carries character spans relative to the source string it was
// parsed from. Used by the editor for arg extraction and reconstruction;
// the evaluator continues to use GlitchVal via parseNodeToGlitchVal.

interface Span {
  start: number;
  end: number;
}

export type ParseNode =
  | { kind: 'atom'; raw: string; value: GlitchVal; span: Span }
  | { kind: 'list'; children: ParseNode[]; span: Span; bare?: boolean };

// Position-aware tokenizer. Strips comments but records character offsets.
function tokenizePos(src: string): Array<{ text: string; start: number; end: number }> {
  const out: Array<{ text: string; start: number; end: number }> = [];
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) {
      i++;
      continue;
    }
    if (src[i] === '#') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if ('()[]'.includes(src[i])) {
      out.push({ text: src[i], start: i, end: i + 1 });
      i++;
      continue;
    }
    const s = i;
    while (i < src.length && !/[\s()[\]#]/.test(src[i])) i++;
    if (i > s) out.push({ text: src.slice(s, i), start: s, end: i });
  }
  return out;
}

function _parseNode(toks: Array<{ text: string; start: number; end: number }>): ParseNode {
  if (!toks.length) throw new Error('Unexpected end of input');
  const tok = toks.shift()!;
  if (tok.text === '(' || tok.text === '[') {
    const close = tok.text === '(' ? ')' : ']';
    const children: ParseNode[] = [];
    while (toks.length && toks[0].text !== close) children.push(_parseNode(toks));
    if (!toks.length) throw new Error(`Missing closing ${close}`);
    const end = toks.shift()!;
    return { kind: 'list', children, span: { start: tok.start, end: end.end } };
  }
  if (tok.text === ')' || tok.text === ']') throw new Error(`Unexpected ${tok.text}`);
  return {
    kind: 'atom',
    raw: tok.text,
    value: parseAtom(tok.text),
    span: { start: tok.start, end: tok.end },
  };
}

// Parse a single block string into a ParseNode. Bare forms (no outer parens)
// are wrapped in a synthetic list so callers always get a list with the op
// name as children[0] and args as children[1..].
export function parseBlock(src: string): ParseNode {
  const toks = tokenizePos(src);
  if (!toks.length)
    return { kind: 'list', children: [], span: { start: 0, end: src.length }, bare: true };
  if (toks[0].text === '(' || toks[0].text === '[') return _parseNode(toks);
  const children: ParseNode[] = [];
  while (toks.length) children.push(_parseNode(toks));
  return { kind: 'list', children, span: { start: 0, end: src.length }, bare: true };
}

// Convert a ParseNode back to GlitchVal for the evaluator.
function parseNodeToGlitchVal(node: ParseNode): GlitchVal {
  if (node.kind === 'atom') return node.value;
  return node.children.map(parseNodeToGlitchVal);
}

// Parse a full source string into a ParseNode[]. Paren forms are parsed
// greedily; bare forms collect tokens until a newline separates them from
// the next token at depth 0.
// Bare single-token forms like `invert` become [invert] lists, which evaluate
// as zero-arg calls — so bare ops work without any special-casing in evaluate().
export function parse(src: string): ParseNode[] {
  const result: ParseNode[] = [];
  const toks = tokenizePos(src);
  while (toks.length > 0) {
    if (toks[0].text === ')' || toks[0].text === ']') {
      throw new Error(`Unexpected ${toks[0].text}`);
    } else if (toks[0].text === '(' || toks[0].text === '[') {
      result.push(_parseNode(toks));
    } else {
      // Bare form: collect until a newline gap appears between tokens at depth 0.
      const children: ParseNode[] = [];
      let lastEnd = toks[0].start;
      while (toks.length > 0 && toks[0].text !== ')' && toks[0].text !== ']') {
        if (children.length > 0 && src.slice(lastEnd, toks[0].start).includes('\n')) break;
        children.push(_parseNode(toks));
        lastEnd = children[children.length - 1].span.end;
      }
      if (children.length > 0)
        result.push({
          kind: 'list',
          bare: true,
          children,
          span: { start: children[0].span.start, end: lastEnd },
        });
    }
  }
  return result;
}

// ── Atom parser ────────────────────────────────────────────────────────────

function parseAtom(token: string): GlitchVal {
  if (token === 'true') return true;
  if (token === 'false') return false;
  if (token === 'null') return null;
  if (token.startsWith('"') && token.endsWith('"')) return token.slice(1, -1);
  const n = Number(token);
  if (token !== '' && !isNaN(n)) return n;
  return token; // symbol
}

// ── Environment ────────────────────────────────────────────────────────────

export class GlitchEnv {
  private map = new Map<string, GlitchVal>();
  private computed = new Map<string, () => GlitchVal>();
  constructor(private parent?: GlitchEnv) {}

  get(name: string): GlitchVal {
    if (this.computed.has(name)) return this.computed.get(name)!();
    if (this.map.has(name)) return this.map.get(name)!;
    if (this.parent) return this.parent.get(name);
    throw new Error(`Undefined: ${name}`);
  }

  set(name: string, val: GlitchVal): void {
    this.map.set(name, val);
  }

  setComputed(name: string, fn: () => GlitchVal): void {
    this.computed.set(name, fn);
  }
}

// ── Evaluator ──────────────────────────────────────────────────────────────

export async function evaluate(expr: GlitchVal, env: GlitchEnv, buf: BufCell): Promise<GlitchVal> {
  if (typeof expr === 'number' || typeof expr === 'boolean' || expr === null) return expr;
  if (typeof expr === 'function') return expr;
  if (typeof expr === 'string') return env.get(expr);
  if (!Array.isArray(expr)) return expr; // IGlitchBuffer — self-evaluating

  if (expr.length === 0) throw new Error('Cannot evaluate empty list');
  const [head, ...rest] = expr;

  // ── special forms ────────────────────────────────────────────────────────

  if (head === 'let') {
    // (let [sym val ...] body?) — with body: scoped; without body: binds into current env
    const bindings = rest[0] as GlitchVal[];
    const hasBody = rest[1] !== undefined;
    const target = hasBody ? new GlitchEnv(env) : env;
    for (let i = 0; i < bindings.length; i += 2)
      target.set(bindings[i] as string, await evaluate(bindings[i + 1], env, buf));
    return hasBody ? evaluate(rest[1], target, buf) : null;
  }

  if (head === 'fn') {
    // (fn [params...] body) — closes over env and buf
    const params = rest[0] as string[];
    const body = rest[1];
    const closure = env;
    return (...args: GlitchVal[]): Promise<GlitchVal> => {
      const inner = new GlitchEnv(closure);
      params.forEach((p, i) => inner.set(p, args[i]));
      return evaluate(body, inner, buf);
    };
  }

  if (head === 'letfn') {
    // (letfn name [params] body scope?) — shorthand for (let [name (fn [params] body)] scope?)
    const name = rest[0] as string;
    const params = rest[1] as string[];
    const body = rest[2];
    const closure = env;
    const fn = (...args: GlitchVal[]): Promise<GlitchVal> => {
      const inner = new GlitchEnv(closure);
      params.forEach((p, i) => inner.set(p, args[i]));
      return evaluate(body, inner, buf);
    };
    const hasScope = rest[3] !== undefined;
    const target = hasScope ? new GlitchEnv(env) : env;
    target.set(name, fn);
    return hasScope ? evaluate(rest[3], target, buf) : null;
  }

  if (head === 'select') {
    // (select startPct endPct body) — body evaluated lazily with buf.val = sub
    const start = (await evaluate(rest[0], env, buf)) as Percentage;
    const end = (await evaluate(rest[1], env, buf)) as Percentage;
    const body = rest[2];
    const saved = buf.val;
    await buf.val.select(start, end, async (sub) => {
      buf.val = sub as IGlitchBuffer;
      await evaluate(body, env, buf);
    });
    buf.val = saved;
    return buf.val;
  }

  if (head === 'repeat') {
    // (repeat n body) — evaluate body n times in sequence
    const n = Math.floor((await evaluate(rest[0], env, buf)) as number);
    const body = rest[1];
    for (let i = 0; i < n; i++) await evaluate(body, env, buf);
    return buf.val;
  }

  if (head === 'channel') {
    // (channel ch body) — apply body to a single RGB channel (r=0 g=1 b=2)
    const ch = Math.floor((await evaluate(rest[0], env, buf)) as number) % 3;
    const body = rest[1];
    const top = buf.val;
    await top.channel(ch, async (sub) => {
      buf.val = sub as IGlitchBuffer;
      await evaluate(body, env, buf);
    });
    buf.val = top;
    return buf.val;
  }

  if (head === 'transpose') {
    // (transpose body) — flip grid so ops apply top-bottom instead of left-right, then flip back
    const body = rest[0];
    const top = buf.val;
    await top.transpose(async (sub) => {
      buf.val = sub as IGlitchBuffer;
      await evaluate(body, env, buf);
    });
    buf.val = top;
    return buf.val;
  }

  if (head === 'stride') {
    // (stride len skip body) — apply body to chunks of len (0–100), skipping skip chunks between each
    const chunkLen = Math.max(0.001, (await evaluate(rest[0], env, buf)) as number);
    const skip = Math.max(0, Math.floor((await evaluate(rest[1], env, buf)) as number));
    const body = rest[2];
    const top = buf.val;
    const step = chunkLen * (skip + 1);
    for (let pos = 0; pos < 100; pos += step) {
      buf.val = top;
      await top.select(
        pos as Percentage,
        Math.min(pos + chunkLen, 100) as Percentage,
        async (sub) => {
          buf.val = sub as IGlitchBuffer;
          await evaluate(body, env, buf);
        }
      );
    }
    buf.val = top;
    return buf.val;
  }

  if (head === 'scale') {
    // (scale factor body) — downscale, apply body, upscale back
    const factor = (await evaluate(rest[0], env, buf)) as number;
    const body = rest[1];
    await buf.val.scale(factor, async () => {
      await evaluate(body, env, buf);
    });
    return buf.val;
  }

  if (head === 'luma') {
    // (luma body) — apply body to luminance only, preserving chroma
    const body = rest[0];
    const top = buf.val;
    await top.luma(async (sub) => {
      buf.val = sub as IGlitchBuffer;
      await evaluate(body, env, buf);
    });
    buf.val = top;
    return buf.val;
  }

  if (head === 'mix') {
    // (mix wet body) — evaluate body, blend result with pre-body snapshot at wet ratio
    const wet = (await evaluate(rest[0], env, buf)) as Wet;
    const body = rest[1];
    await buf.val.mix(wet, async () => {
      await evaluate(body, env, buf);
    });
    return buf.val;
  }

  if (head === 'do') {
    // (do form ...) — evaluate in sequence, return last
    let result: GlitchVal = null;
    for (const form of rest) result = await evaluate(form, env, buf);
    return result;
  }

  if (head === 'if') {
    // (if cond then else?) — else is optional
    const cond = await evaluate(rest[0], env, buf);
    if (cond) return evaluate(rest[1], env, buf);
    return rest[2] !== undefined ? evaluate(rest[2], env, buf) : null;
  }

  // ── function application ─────────────────────────────────────────────────

  const fn = (await evaluate(head, env, buf)) as GlitchFn;
  const args = await Promise.all(rest.map((a) => evaluate(a, env, buf)));
  return await fn(...args);
}

// ── Built-ins ──────────────────────────────────────────────────────────────
// Buffer ops close over `buf` — they never take a buffer argument.
// select is a special form above, not a function.

export function makeGlitchEnv(buf: BufCell, rand: () => number): GlitchEnv {
  const env = new GlitchEnv();

  // Register all buffer ops from OPS (those with an invoke function)
  for (const op of OPS) {
    if (op.invoke) {
      const fn = op.invoke;
      env.set(op.name, (...args: GlitchVal[]) => fn(buf.val, ...args));
    }
  }

  // buffer dimensions — read dynamically so they reflect the current sub-buffer
  env.setComputed('width', () => buf.val.width);
  env.setComputed('height', () => buf.val.height);

  // channel constants
  env.set('R', 0);
  env.set('G', 1);
  env.set('B', 2);

  // arithmetic
  env.set('+', (a: GlitchVal, b: GlitchVal) => (a as number) + (b as number));
  env.set('-', (a: GlitchVal, b: GlitchVal) => (a as number) - (b as number));
  env.set('*', (a: GlitchVal, b: GlitchVal) => (a as number) * (b as number));
  env.set('/', (a: GlitchVal, b: GlitchVal) => (a as number) / (b as number));
  env.set('mod', (a: GlitchVal, b: GlitchVal) => (a as number) % (b as number));
  env.set('clamp', (v: GlitchVal, lo: GlitchVal, hi: GlitchVal) =>
    Math.min(Math.max(v as number, lo as number), hi as number)
  );

  // comparison & logic
  env.set('<', (a: GlitchVal, b: GlitchVal) => (a as number) < (b as number));
  env.set('>', (a: GlitchVal, b: GlitchVal) => (a as number) > (b as number));
  env.set('<=', (a: GlitchVal, b: GlitchVal) => (a as number) <= (b as number));
  env.set('>=', (a: GlitchVal, b: GlitchVal) => (a as number) >= (b as number));
  env.set('=', (a: GlitchVal, b: GlitchVal) => a === b);
  env.set('not', (a: GlitchVal): GlitchVal => !a);

  // random — uses seeded PRNG
  // (rand) → 0–1, (rand max) → 0–max, (rand min max) → min–max
  env.set('rand', (...args: GlitchVal[]): GlitchVal => {
    if (args.length >= 2) {
      const min = args[0] as number,
        max = args[1] as number;
      return min + rand() * (max - min);
    }
    return args.length === 1 ? rand() * (args[0] as number) : rand();
  });

  // integer random — same signature as rand but floors to integer
  // (randint max) → 0–max-1, (randint min max) → min–max-1
  env.set('randint', (...args: GlitchVal[]): GlitchVal => {
    if (args.length >= 2) {
      const min = args[0] as number,
        max = args[1] as number;
      return Math.floor(min + rand() * (max - min));
    }
    return Math.floor(rand() * (args[0] as number));
  });

  // normal distribution via Box-Muller — uses seeded PRNG
  // (randn) → N(0,1), (randn std) → N(0,std), (randn mean std) → N(mean,std)
  env.set('randn', (...args: GlitchVal[]): GlitchVal => {
    const u = rand(),
      v = rand();
    const n = Math.sqrt(-2 * Math.log(u === 0 ? 1e-10 : u)) * Math.cos(2 * Math.PI * v);
    if (args.length >= 2) return (args[0] as number) + n * (args[1] as number);
    return args.length === 1 ? n * (args[0] as number) : n;
  });

  return env;
}

// ── Block splitter ─────────────────────────────────────────────────────────
// Split raw source into top-level block strings, preserving comments (unlike
// parse()). Used by the editor to split source into draggable rows.

export function splitIntoBlocks(src: string): string[] {
  const rawLines = src.split('\n');
  const blocks: string[] = [];
  let currentLines: string[] = [];
  let depth = 0;
  for (const rawLine of rawLines) {
    const active = rawLine.replace(/#.*$/, '');
    for (const ch of active) {
      if (ch === '(' || ch === '[') depth++;
      if (ch === ')' || ch === ']') depth--;
    }
    currentLines.push(rawLine);
    if (depth <= 0) {
      blocks.push(currentLines.join('\n'));
      currentLines = [];
      depth = 0;
    }
  }
  if (currentLines.length > 0) blocks.push(currentLines.join('\n'));
  return blocks;
}

// ── Entry point ────────────────────────────────────────────────────────────

export async function runGlitchsp(
  code: string,
  image: IGlitchBuffer,
  rand: () => number
): Promise<void> {
  const buf: BufCell = { val: image };
  const env = makeGlitchEnv(buf, rand);
  for (const node of parse(code)) await evaluate(parseNodeToGlitchVal(node), env, buf);
}
