/// <reference path="effects.ts" />

// ── PRNG ───────────────────────────────────────────────────────────────────
// Mulberry32 — fast, good quality, fully seedable 32-bit PRNG.

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Types ──────────────────────────────────────────────────────────────────

type GlitchFn = (...args: GlitchVal[]) => GlitchVal | Promise<GlitchVal>;
type GlitchVal = number | string | boolean | null | GlitchVal[] | IGlitchBuffer | GlitchFn;
type BufCell = { val: IGlitchBuffer };

// ── Tokenizer ──────────────────────────────────────────────────────────────

function tokenize(src: string): string[] {
  return src
    .replace(/[()[\]]/g, m => ` ${m} `)
    .trim()
    .split(/\s+/)
    .filter(t => t.length > 0);
}

// ── Parser ─────────────────────────────────────────────────────────────────

function parseExpr(tokens: string[]): GlitchVal {
  if (tokens.length === 0) throw new Error('Unexpected end of input');
  const token = tokens.shift()!;

  if (token === '(' || token === '[') {
    const close = token === '(' ? ')' : ']';
    const list: GlitchVal[] = [];
    while (tokens[0] !== close) {
      if (tokens.length === 0) throw new Error(`Missing closing ${close}`);
      list.push(parseExpr(tokens));
    }
    tokens.shift();
    return list;
  }

  if (token === ')' || token === ']') throw new Error(`Unexpected ${token}`);
  return parseAtom(token);
}

function parseAtom(token: string): GlitchVal {
  if (token === 'true') return true;
  if (token === 'false') return false;
  if (token === 'null') return null;
  if (token.startsWith('"') && token.endsWith('"')) return token.slice(1, -1);
  const n = Number(token);
  if (token !== '' && !isNaN(n)) return n;
  return token; // symbol
}

// Top-level parser: bare lines are implicit calls; all statements accumulate
// across lines until parens are balanced. # begins a line comment.
function parseAll(src: string): GlitchVal[] {
  const result: GlitchVal[] = [];
  let accumulated = '';
  let depth = 0;
  let isBare = false;

  for (const rawLine of src.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    if (depth === 0) {
      isBare = !line.startsWith('(') && !line.startsWith('[');
      accumulated = '';
    }

    accumulated += (accumulated ? ' ' : '') + line;
    for (const ch of line) {
      if (ch === '(' || ch === '[') depth++;
      if (ch === ')' || ch === ']') depth--;
    }

    if (depth === 0) {
      const tokens = tokenize(accumulated);
      if (isBare) {
        const forms: GlitchVal[] = [];
        while (tokens.length > 0) forms.push(parseExpr(tokens));
        if (forms.length > 0) result.push(forms);
      } else {
        result.push(parseExpr(tokens));
      }
      accumulated = '';
    }
  }

  if (accumulated.trim()) result.push(parseExpr(tokenize(accumulated)));
  return result;
}

// ── Environment ────────────────────────────────────────────────────────────

class GlitchEnv {
  private map = new Map<string, GlitchVal>();
  constructor(private parent?: GlitchEnv) { }

  get(name: string): GlitchVal {
    if (this.map.has(name)) return this.map.get(name)!;
    if (this.parent) return this.parent.get(name);
    throw new Error(`Undefined: ${name}`);
  }

  set(name: string, val: GlitchVal): void {
    this.map.set(name, val);
  }
}

// ── Evaluator ──────────────────────────────────────────────────────────────

async function evaluate(expr: GlitchVal, env: GlitchEnv, buf: BufCell): Promise<GlitchVal> {
  if (typeof expr === 'number' || typeof expr === 'boolean' || expr === null) return expr;
  if (typeof expr === 'function') return expr;
  if (typeof expr === 'string') return env.get(expr);
  if (!Array.isArray(expr)) return expr; // IGlitchBuffer — self-evaluating

  if (expr.length === 0) throw new Error('Cannot evaluate empty list');
  const [head, ...rest] = expr;

  // ── special forms ────────────────────────────────────────────────────────

  if (head === 'let') {
    // (let [sym val ...] body)
    const bindings = rest[0] as GlitchVal[];
    const inner = new GlitchEnv(env);
    for (let i = 0; i < bindings.length; i += 2)
      inner.set(bindings[i] as string, await evaluate(bindings[i + 1], env, buf));
    return evaluate(rest[1], inner, buf);
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

  if (head === 'select') {
    // (select startPct endPct body) — body evaluated lazily with buf.val = sub
    const start = await evaluate(rest[0], env, buf) as number;
    const end = await evaluate(rest[1], env, buf) as number;
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
    const n = Math.floor(await evaluate(rest[0], env, buf) as number);
    const body = rest[1];
    for (let i = 0; i < n; i++) await evaluate(body, env, buf);
    return buf.val;
  }

  if (head === 'channel') {
    // (channel ch body) — apply body to a single RGB channel (r=0 g=1 b=2)
    const ch = Math.floor(await evaluate(rest[0], env, buf) as number) % 3;
    const body = rest[1];
    const top = buf.val;
    await top.channel(ch, async (sub) => {
      buf.val = sub as IGlitchBuffer;
      await evaluate(body, env, buf);
    });
    buf.val = top;
    return buf.val;
  }

  if (head === 'stride') {
    // (stride len skip body) — apply body to chunks of len (0–100), skipping skip chunks between each
    const chunkLen = Math.max(0.1, await evaluate(rest[0], env, buf) as number);
    const skip = Math.max(0, Math.floor(await evaluate(rest[1], env, buf) as number));
    const body = rest[2];
    const top = buf.val;
    const step = chunkLen * (skip + 1);
    for (let pos = 0; pos < 100; pos += step) {
      buf.val = top;
      await top.select(pos, Math.min(pos + chunkLen, 100), async (sub) => {
        buf.val = sub as IGlitchBuffer;
        await evaluate(body, env, buf);
      });
    }
    buf.val = top;
    return buf.val;
  }

  if (head === 'mix') {
    // (mix wet body) — evaluate body, blend result with pre-body snapshot at wet ratio
    const wet = await evaluate(rest[0], env, buf) as number;
    const body = rest[1];
    await buf.val.mix(wet, async () => { await evaluate(body, env, buf); });
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

  const fn = await evaluate(head, env, buf) as GlitchFn;
  const args = await Promise.all(rest.map(a => evaluate(a, env, buf)));
  return await fn(...args);
}

// ── Built-ins ──────────────────────────────────────────────────────────────
// Buffer ops close over `buf` — they never take a buffer argument.
// select is a special form above, not a function.

function makeGlitchEnv(buf: BufCell, rand: () => number): GlitchEnv {
  const env = new GlitchEnv();

  env.set('reverb', (t: GlitchVal, w: GlitchVal): Promise<GlitchVal> => buf.val.reverb(t as number, w as number));
  env.set('rescale', (w: GlitchVal, h: GlitchVal): Promise<GlitchVal> => buf.val.rescale(w as number, h as number));
  env.set('bitcrush', (bits: GlitchVal): GlitchVal => buf.val.bitcrush(bits as number));
  env.set('noise', (amt: GlitchVal): GlitchVal => buf.val.noise(amt as number));
  env.set('reverse', (): GlitchVal => buf.val.reverse());
  env.set('echo', (t: GlitchVal, g: GlitchVal): GlitchVal => buf.val.echo(t as number, g as number));
  env.set('copy', (s: GlitchVal, e: GlitchVal, t: GlitchVal): GlitchVal => buf.val.copy(s as number, e as number, t as number));
  env.set('tremolo', (r: GlitchVal, d: GlitchVal): GlitchVal => buf.val.tremolo(r as number, d as number));
  env.set('distort', (d: GlitchVal): GlitchVal => buf.val.distort(d as number));
  env.set('chorus', (r: GlitchVal, d: GlitchVal, w: GlitchVal): GlitchVal => buf.val.chorus(r as number, d as number, w as number));
  env.set('pitchshift', (s: GlitchVal): Promise<GlitchVal> => buf.val.pitchShift(s as number));
  env.set('transpose', (ch: GlitchVal, dx: GlitchVal, dy: GlitchVal): GlitchVal => buf.val.transpose(ch as number, dx as number, dy as number));
  env.set('invert', (): GlitchVal => buf.val.invert());
  env.set('shuffle', (pct: GlitchVal): GlitchVal => buf.val.shuffle(pct as number));
  env.set('quantize', (n: GlitchVal): GlitchVal => buf.val.quantize(n as number));
  env.set('fold', (d: GlitchVal): GlitchVal => buf.val.fold(d as number));
  env.set('solarize', (t: GlitchVal): GlitchVal => buf.val.solarize(t as number));

  // channel constants
  env.set('R', 0); env.set('G', 1); env.set('B', 2);

  // arithmetic
  env.set('+', (a: GlitchVal, b: GlitchVal) => (a as number) + (b as number));
  env.set('-', (a: GlitchVal, b: GlitchVal) => (a as number) - (b as number));
  env.set('*', (a: GlitchVal, b: GlitchVal) => (a as number) * (b as number));
  env.set('/', (a: GlitchVal, b: GlitchVal) => (a as number) / (b as number));
  env.set('mod', (a: GlitchVal, b: GlitchVal) => (a as number) % (b as number));
  env.set('clamp', (v: GlitchVal, lo: GlitchVal, hi: GlitchVal) =>
    Math.min(Math.max(v as number, lo as number), hi as number));

  // comparison & logic
  env.set('<', (a: GlitchVal, b: GlitchVal) => (a as number) < (b as number));
  env.set('>', (a: GlitchVal, b: GlitchVal) => (a as number) > (b as number));
  env.set('<=', (a: GlitchVal, b: GlitchVal) => (a as number) <= (b as number));
  env.set('>=', (a: GlitchVal, b: GlitchVal) => (a as number) >= (b as number));
  env.set('=', (a: GlitchVal, b: GlitchVal) => a === b);
  env.set('not', (a: GlitchVal): GlitchVal => !a);

  // random — uses seeded PRNG
  env.set('rand', (...args: GlitchVal[]): GlitchVal =>
    args.length > 0 ? rand() * (args[0] as number) : rand());

  return env;
}

// ── Entry point ────────────────────────────────────────────────────────────

function tryParse(code: string): boolean {
  try { parseAll(code); return true; } catch { return false; }
}

async function runGlitchsp(code: string, image: IGlitchBuffer, rand: () => number): Promise<void> {
  const buf: BufCell = { val: image };
  const env = makeGlitchEnv(buf, rand);
  for (const expr of parseAll(code)) await evaluate(expr, env, buf);
}
