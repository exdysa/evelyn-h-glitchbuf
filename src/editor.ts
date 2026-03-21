import { parseBlock } from './glitchsp';
import type { ParseNode } from './glitchsp';
import { OP_MAP, ParamType } from './ops';
import type { ParamDef } from './ops';

// ── Display tokenizer ─────────────────────────────────────────────────────────

export type TokType = 'effect' | 'num' | 'paren' | 'comment' | 'plain';
export interface Tok {
  type: TokType;
  text: string;
  offset: number;
}

export function tokenizeForDisplay(block: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < block.length) {
    const ch = block[i];

    // Comment: # to end of line
    if (ch === '#') {
      const end = block.indexOf('\n', i);
      const text = end === -1 ? block.slice(i) : block.slice(i, end);
      toks.push({ type: 'comment', text, offset: i });
      i += text.length;
      continue;
    }

    // Parens / brackets
    if (ch === '(' || ch === ')' || ch === '[' || ch === ']') {
      toks.push({ type: 'paren', text: ch, offset: i });
      i++;
      continue;
    }

    // Whitespace (including newlines — preserve them)
    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < block.length && /\s/.test(block[j])) j++;
      toks.push({ type: 'plain', text: block.slice(i, j), offset: i });
      i = j;
      continue;
    }

    // Number: digit, or minus followed by digit at a word boundary
    const prev = i > 0 ? block[i - 1] : ' ';
    if (/\d/.test(ch) || (ch === '-' && /\d/.test(block[i + 1] ?? '') && /[\s([)]/.test(prev))) {
      const m = block.slice(i).match(/^-?\d+(\.\d+)?/);
      if (m) {
        toks.push({ type: 'num', text: m[0], offset: i });
        i += m[0].length;
        continue;
      }
    }

    // Word / symbol — run until whitespace, paren, or #
    let j = i + 1;
    while (j < block.length && !/[\s()[\]#]/.test(block[j])) j++;
    const word = block.slice(i, j);
    toks.push({ type: OP_MAP.has(word.toLowerCase()) ? 'effect' : 'plain', text: word, offset: i });
    i = j;
  }
  return toks;
}

// Find bounds of the expression containing the effect at effectOffset.
// Uses the AST so ) inside comments doesn't confuse depth counting.
export function findExprBounds(
  block: string,
  effectOffset: number
): { start: number; end: number } {
  try {
    const ast = parseBlock(block);
    const findDeepest = (node: ParseNode, offset: number): ParseNode | null => {
      if (node.kind !== 'list') return null;
      if (node.span.start > offset || node.span.end <= offset) return null;
      for (const child of node.children) {
        const deeper = findDeepest(child, offset);
        if (deeper) return deeper;
      }
      return node;
    };
    const found = findDeepest(ast, effectOffset);
    if (found) return found.span;
  } catch {
    /* malformed — fall through */
  }
  return { start: effectOffset, end: block.length };
}

// Walk the AST for `block` and return the ParamDef for the number at `offset`,
// or null if the number isn't a recognised op argument.
export function findParamAtOffset(block: string, offset: number): ParamDef | null {
  try {
    const ast = parseBlock(block);
    const search = (node: ParseNode): ParamDef | null => {
      if (node.kind !== 'list') return null;
      const first = node.children[0];
      if (first?.kind === 'atom' && typeof first.value === 'string') {
        const meta = OP_MAP.get(first.value);
        if (meta) {
          for (let j = 0; j < meta.params.length; j++) {
            const arg = node.children[j + 1];
            if (arg?.kind === 'atom' && arg.span.start === offset) return meta.params[j];
          }
        }
      }
      for (const child of node.children) {
        const found = search(child);
        if (found) return found;
      }
      return null;
    };
    return search(ast);
  } catch {
    return null;
  }
}

// Returns char offsets of current selection anchor/focus within el.
export function selectionCharOffsets(el: HTMLElement): { start: number; end: number } {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return { start: 0, end: 0 };
  const range = sel.getRangeAt(0);
  const getOff = (node: Node, off: number) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.setEnd(node, off);
    return r.toString().length;
  };
  return {
    start: getOff(range.startContainer, range.startOffset),
    end: getOff(range.endContainer, range.endOffset),
  };
}

export function setCaretOffset(el: HTMLElement, offset: number): void {
  const range = document.createRange();
  let remaining = offset;
  let placed = false;
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent!.length;
      if (remaining <= len) {
        range.setStart(node, remaining);
        range.collapse(true);
        placed = true;
        return true;
      }
      remaining -= len;
    } else {
      for (const child of Array.from(node.childNodes)) {
        if (walk(child)) return true;
      }
    }
    return false;
  };
  walk(el);
  if (!placed) {
    range.selectNodeContents(el);
    range.collapse(false);
  }
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

// Read the edit div's text, stripping the trailing newline some browsers append.
export function getEditText(el: HTMLElement): string {
  return el.innerText.replace(/\n$/, '');
}

export function placeCaretAtEnd(el: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

export function placeCaretAtPoint(el: HTMLElement, x: number, y: number): void {
  let placed = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (document as any).caretRangeFromPoint === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: Range = (document as any).caretRangeFromPoint(x, y);
    if (r && el.contains(r.startContainer)) {
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(r);
      placed = true;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } else if (typeof (document as any).caretPositionFromPoint === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pos = (document as any).caretPositionFromPoint(x, y);
    if (pos && el.contains(pos.offsetNode)) {
      const range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      placed = true;
    }
  }
  if (!placed) placeCaretAtEnd(el);
}

// ── Number scrubbing ──────────────────────────────────────────────────────────

// Signed log: smooth through zero, log-scale on both sides.
export const sLog = (x: number) => Math.sign(x) * Math.log1p(Math.abs(x));
export const sExp = (y: number) => Math.sign(y) * Math.expm1(Math.abs(y));

export { ParamType };
