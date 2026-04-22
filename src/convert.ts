import type { Effect } from './process.js';

function effectToGlitchsp(name: string, params: unknown[]): string {
  const args = params.map(p => {
    if (p === null) return 'null';
    if (typeof p === 'boolean') return String(p);
    if (typeof p === 'number') return String(p);
    if (typeof p === 'string') return `"${p}"`;
    if (Array.isArray(p) && p.length > 0 && typeof p[0] === 'object' && (p[0] as Record<string, unknown>).name) {
      const arr = p as Effect[];
      const inner = arr.map(e => effectToGlitchsp(e.name, e.params));
      if (inner.length === 1) return inner[0];
      return `(do ${inner.join(' ')})`;
    }
    if (typeof p === 'object' && p !== null && (p as Record<string, unknown>).name) {
      const e = p as Effect;
      return effectToGlitchsp(e.name, e.params);
    }
    return String(p);
  });
  return `(${name}${args.length > 0 ? ' ' + args.join(' ') : ''})`;
}

export function effectsToGlitchsp(sequences: Effect[][]): string[] {
  return sequences.map(seq => seq.map(e => effectToGlitchsp(e.name, e.params)).join('\n'));
}

export function effectToGlitchspLine(name: string, params: unknown[]): string {
  return effectToGlitchsp(name, params);
}
