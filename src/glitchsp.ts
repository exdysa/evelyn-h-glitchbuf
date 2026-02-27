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

interface IGlitchBuffer {
  bitcrush(bits: number): this;
  noise(amount: number): this;
  reverse(): this;
  echo(times: number, gainDb: number): this;
  select(startPct: number, endPct: number, fn: (sub: IGlitchBuffer) => void): this;
  copy(srcStart: number, srcEnd: number, dstStart: number): this;
}

type GlitchFn = (...args: GlitchVal[]) => GlitchVal;
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
        if (forms.length > 0) result.push(forms.length === 1 ? forms[0] : forms);
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

function evaluate(expr: GlitchVal, env: GlitchEnv, buf: BufCell): GlitchVal {
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
      inner.set(bindings[i] as string, evaluate(bindings[i + 1], env, buf));
    return evaluate(rest[1], inner, buf);
  }

  if (head === 'fn') {
    // (fn [params...] body) — closes over env and buf
    const params = rest[0] as string[];
    const body = rest[1];
    const closure = env;
    return (...args: GlitchVal[]): GlitchVal => {
      const inner = new GlitchEnv(closure);
      params.forEach((p, i) => inner.set(p, args[i]));
      return evaluate(body, inner, buf);
    };
  }

  if (head === 'select') {
    // (select startPct endPct body) — body evaluated lazily with buf.val = sub
    const start = evaluate(rest[0], env, buf) as number;
    const end = evaluate(rest[1], env, buf) as number;
    const body = rest[2];
    const saved = buf.val;
    buf.val.select(start, end, sub => {
      buf.val = sub as IGlitchBuffer;
      evaluate(body, env, buf);
    });
    buf.val = saved;
    return buf.val;
  }

  if (head === 'do') {
    // (do form ...) — evaluate in sequence, return last
    let result: GlitchVal = null;
    for (const form of rest) result = evaluate(form, env, buf);
    return result;
  }

  if (head === 'if') {
    // (if cond then else?) — else is optional
    const cond = evaluate(rest[0], env, buf);
    if (cond) return evaluate(rest[1], env, buf);
    return rest[2] !== undefined ? evaluate(rest[2], env, buf) : null;
  }

  // ── function application ─────────────────────────────────────────────────

  const fn = evaluate(head, env, buf) as GlitchFn;
  const args = rest.map(a => evaluate(a, env, buf));
  return fn(...args);
}

// ── Built-ins ──────────────────────────────────────────────────────────────
// Buffer ops close over `buf` — they never take a buffer argument.
// select is a special form above, not a function.

function makeGlitchEnv(buf: BufCell, rand: () => number): GlitchEnv {
  const env = new GlitchEnv();

  env.set('bitcrush', (bits: GlitchVal): GlitchVal => buf.val.bitcrush(bits as number));
  env.set('noise', (amt: GlitchVal): GlitchVal => buf.val.noise(amt as number));
  env.set('reverse', (): GlitchVal => buf.val.reverse());
  env.set('echo', (t: GlitchVal, g: GlitchVal): GlitchVal => buf.val.echo(t as number, g as number));
  env.set('copy', (s: GlitchVal, e: GlitchVal, t: GlitchVal): GlitchVal => buf.val.copy(s as number, e as number, t as number));

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

function runGlitchsp(code: string, image: IGlitchBuffer, rand: () => number): void {
  const buf: BufCell = { val: image };
  const env = makeGlitchEnv(buf, rand);
  for (const expr of parseAll(code)) evaluate(expr, env, buf);
}
