/// <reference path="presets.ts" />

// ── Display tokenizer ─────────────────────────────────────────────────────────

type TokType = 'effect' | 'num' | 'paren' | 'comment' | 'plain';
interface Tok { type: TokType; text: string; offset: number; }

function tokenizeForDisplay(block: string): Tok[] {
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

function renderDisplay(el: HTMLElement, block: string): void {
  el.innerHTML = '';
  for (const tok of tokenizeForDisplay(block)) {
    if (tok.type === 'plain') {
      el.appendChild(document.createTextNode(tok.text));
    } else {
      const span = document.createElement('span');
      span.className = 'tok-' + tok.type;
      span.textContent = tok.text;
      // Both num and effect spans store their character offset for targeted edits.
      if (tok.type === 'num' || tok.type === 'effect') {
        span.dataset.offset = String(tok.offset);
      }
      if (tok.type === 'num') {
        span.dataset.origLen = String(tok.text.length);
      }
      el.appendChild(span);
    }
  }
  // Ensure empty block still has a visible line
  if (!block.trim()) el.appendChild(document.createTextNode('\u200b'));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Find bounds of the expression containing the effect at effectOffset.
// Uses the AST so ) inside comments doesn't confuse depth counting.
function findExprBounds(block: string, effectOffset: number): { start: number; end: number } {
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
  } catch { /* malformed — fall through */ }
  return { start: effectOffset, end: block.length };
}

// Returns char offsets of current selection anchor/focus within el.
function selectionCharOffsets(el: HTMLElement): { start: number; end: number } {
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

// ── State ─────────────────────────────────────────────────────────────────────

let _editorLines: string[] = [''];
let _editorEl: HTMLElement;
let _effectDialog: HTMLDialogElement;
let _dialogName: HTMLElement;
let _dialogDesc: HTMLElement;
let _dialogParams: HTMLElement;
let _dialogApply: HTMLButtonElement;
let _addDialog: HTMLDialogElement;
let _addSelect: HTMLSelectElement;
let _addDesc: HTMLParagraphElement;
let _addParams: HTMLDivElement;
let _addApplyBtn: HTMLButtonElement;
let _wrapDialog: HTMLDialogElement;
let _wrapSelect: HTMLSelectElement;
let _wrapDesc: HTMLParagraphElement;
let _wrapParams: HTMLDivElement;
let _wrapApplyBtn: HTMLButtonElement;
let _onChange: () => void;
let _openHelp: ((tab: string) => void) | undefined;
let _dragIndex: number | null = null;
let _dropIndex: number | null = null;
let _dropTarget: HTMLElement | null = null; // the current drag-over .editor-line element
let _suppressBlur = false;

// ── Caret utilities ───────────────────────────────────────────────────────────

function setCaretOffset(el: HTMLElement, offset: number): void {
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
  if (!placed) { range.selectNodeContents(el); range.collapse(false); }
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

// Read the edit div's text, stripping the trailing newline some browsers append.
function getEditText(el: HTMLElement): string {
  return el.innerText.replace(/\n$/, '');
}

function placeCaretAtEnd(el: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

function placeCaretAtPoint(el: HTMLElement, x: number, y: number): void {
  let placed = false;
  if (typeof (document as any).caretRangeFromPoint === 'function') {
    const r: Range = (document as any).caretRangeFromPoint(x, y);
    if (r && el.contains(r.startContainer)) {
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(r);
      placed = true;
    }
  } else if (typeof (document as any).caretPositionFromPoint === 'function') {
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

// ── Focus helpers ─────────────────────────────────────────────────────────────

function focusLine(idx: number): void {
  const displays = _editorEl.querySelectorAll<HTMLElement>('.line-display');
  const clamped = Math.max(0, Math.min(idx, displays.length - 1));
  displays[clamped]?.focus();
}

function enterEditMode(
  displayEl: HTMLElement,
  editEl: HTMLElement,
  block: string,
  focusPoint?: { x: number; y: number }
): void {
  editEl.textContent = block;
  displayEl.hidden = true;
  editEl.hidden = false;
  editEl.focus();
  if (focusPoint) {
    placeCaretAtPoint(editEl, focusPoint.x, focusPoint.y);
  } else {
    placeCaretAtEnd(editEl);
  }
}

// ── Number scrubbing ──────────────────────────────────────────────────────────

// Signed log: smooth through zero, log-scale on both sides.
const sLog = (x: number) => Math.sign(x) * Math.log1p(Math.abs(x));
const sExp = (y: number) => Math.sign(y) * Math.expm1(Math.abs(y));

// Walk the AST for `block` and return the ParamDef for the number at `offset`,
// or null if the number isn't a recognised op argument.
function findParamAtOffset(block: string, offset: number): ParamDef | null {
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
  } catch { return null; }
}

function startScrub(
  e: PointerEvent,
  span: HTMLElement,
  lineIndex: number,
  displayEl: HTMLElement,
  editEl: HTMLElement
): void {
  const origText = span.textContent!;
  const origVal = parseFloat(origText);
  if (isNaN(origVal)) return;

  const offset = parseInt(span.dataset.offset!);
  const origLen = parseInt(span.dataset.origLen!);
  const blockBefore = _editorLines[lineIndex].slice(0, offset);
  const blockAfter = _editorLines[lineIndex].slice(offset + origLen);

  const param = findParamAtOffset(_editorLines[lineIndex], offset);
  const isLog = param?.type === ParamType.log;
  const step = param?.step;
  const abs = Math.abs(origVal);
  const scale = abs >= 100 ? 1 : abs >= 1 ? 0.1 : 0.01;
  // For log params: 768px sweeps the full log range.
  const logScale = isLog ? (sLog(param!.max) - sLog(param!.min)) / 768 : 0;
  const decimals = step !== undefined
    ? (String(step).split('.')[1] ?? '').length
    : (origText.split('.')[1] ?? '').length;

  const startX = e.clientX;
  let moved = false;

  span.setPointerCapture(e.pointerId);

  function onMove(me: PointerEvent) {
    if (Math.abs(me.clientX - startX) > 3) moved = true;
    if (!moved) return;
    let v: number;
    if (isLog) {
      v = sExp(sLog(origVal) + (me.clientX - startX) * logScale);
      v = Math.max(param!.min, Math.min(param!.max, v));
      v = parseFloat(v.toPrecision(3));
    } else {
      v = origVal + (me.clientX - startX) * scale;
      if (step !== undefined) v = Math.round(v / step) * step;
      if (param) v = Math.max(param.min, Math.min(param.max, v));
      v = decimals === 0 ? Math.round(v) : parseFloat(v.toFixed(decimals));
    }
    const newStr = String(v);
    _editorLines[lineIndex] = blockBefore + newStr + blockAfter;
    span.textContent = newStr;
    _onChange();
  }

  function onUp() {
    span.removeEventListener('pointermove', onMove);
    span.removeEventListener('pointerup', onUp);
    if (!moved) {
      // Treat plain click on number as enter-edit
      enterEditMode(displayEl, editEl, _editorLines[lineIndex]);
    } else {
      // Re-render display with updated block text
      renderDisplay(displayEl, _editorLines[lineIndex]);
    }
  }

  span.addEventListener('pointermove', onMove);
  span.addEventListener('pointerup', onUp);
}

// ── Effect modal ──────────────────────────────────────────────────────────────

// Renders param rows into container. argNodes[j] is the parsed arg for param j
// (undefined = use default). currentText is needed to display complex expressions verbatim.
// Returns getArgs() which yields one formatted string per param (complex = verbatim expression).
function renderParamInputs(
  container: HTMLElement,
  meta: OpDef,
  argNodes: (ParseNode | undefined)[],
  currentText?: string
): () => string[] {
  const inputs: HTMLInputElement[] = [];
  const isComplex: boolean[] = [];

  meta.params.forEach((param, j) => {
    const row = document.createElement('div');
    row.className = 'param-row';

    const label = document.createElement('label');
    label.textContent = param.unit ? `${param.name} (${param.unit})` : param.name;

    const argNode = argNodes[j];
    const isSimple = argNode?.kind === 'atom' && typeof argNode.value === 'number';
    isComplex.push(!!argNode && !isSimple);

    const parsed = isSimple ? (argNode as { value: number }).value : NaN;
    const initVal = isNaN(parsed) ? param.default : Math.min(param.max, Math.max(param.min, parsed));

    const isLog = param.type === ParamType.log;
    const logMin = isLog ? sLog(param.min) : 0;
    const logRange = isLog ? sLog(param.max) - logMin : 0;
    const toSlider = (v: number) => isLog ? 100 * (sLog(v) - logMin) / logRange : v;
    const fromSlider = (t: number) => isLog ? sExp(logMin + (t / 100) * logRange) : t;

    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(toSlider(param.min));
    range.max = String(toSlider(param.max));
    range.step = String(param.step ?? 1);
    range.value = String(toSlider(initVal));
    range.disabled = isComplex[j];

    const num = document.createElement('input');
    num.type = 'number';
    num.min = String(param.min);
    num.max = String(param.max);
    num.step = String(param.step ?? 1);
    num.value = isComplex[j] && currentText && argNode
      ? currentText.slice(argNode.span.start, argNode.span.end)
      : String(initVal);
    num.disabled = isComplex[j];
    if (isComplex[j]) num.title = 'complex expression — edit in source';

    range.addEventListener('input', () => {
      const v = fromSlider(parseFloat(range.value));
      num.value = String(isLog ? parseFloat(v.toPrecision(3)) : v);
    });
    num.addEventListener('input', () => {
      const v = parseFloat(num.value);
      if (!isNaN(v)) range.value = String(toSlider(Math.min(param.max, Math.max(param.min, v))));
    });

    inputs.push(num);
    row.append(label, range, num);
    container.appendChild(row);
  });

  return () => inputs.map((inp, j) => {
    if (isComplex[j] && currentText && argNodes[j]) {
      return currentText.slice(argNodes[j]!.span.start, argNodes[j]!.span.end);
    }
    const v = parseFloat(inp.value);
    return Number.isInteger(v) ? String(v) : parseFloat(v.toFixed(4)).toString();
  });
}

function openEffectModal(
  meta: OpDef,
  currentText: string,
  lineIndex: number,
  exprRange?: { start: number; end: number }
): void {
  _dialogName.textContent = meta.name;
  _dialogDesc.textContent = meta.desc;
  _dialogParams.innerHTML = '';

  // Parse the block into an AST so we can inspect each arg's structure.
  let listAst: Extract<ParseNode, { kind: 'list' }> | null = null;
  try {
    const ast = parseBlock(currentText);
    listAst = ast.kind === 'list' ? ast : null;
  } catch { /* malformed — inputs will show defaults */ }

  // children[0] = op name, children[1..n] = args, children[n+1..] = body (special forms)
  const argNodes = (listAst ? listAst.children.slice(1, 1 + meta.params.length) : []) as (ParseNode | undefined)[];
  const isParenForm = listAst !== null && !listAst.bare;

  const getArgs = renderParamInputs(_dialogParams, meta, argNodes, currentText);

  _dialogApply.hidden = meta.params.length === 0;
  _dialogApply.onclick = () => {
    const args = getArgs();

    // For special forms, preserve the body nodes verbatim using their spans.
    const bodyNodes = listAst && !meta.invoke ? listAst.children.slice(1 + meta.params.length) : [];
    const bodyParts = bodyNodes.map((n: ParseNode) => currentText.slice(n.span.start, n.span.end));

    const inner = [meta.name, ...args, ...bodyParts].join(' ');
    const newText = (isParenForm ? `(${inner})` : inner).trimEnd();

    if (exprRange) {
      _editorLines[lineIndex] =
        _editorLines[lineIndex].slice(0, exprRange.start) +
        newText +
        _editorLines[lineIndex].slice(exprRange.end);
    } else {
      _editorLines[lineIndex] = newText;
    }
    renderEditor();
    _onChange();
    _effectDialog.close();
  };

  _effectDialog.showModal();
}

const ADD_KIND_ORDER: OpKind[] = [OpKind.byte, OpKind.pixel, OpKind.audio, OpKind.image];

function openAddEffectDialog(): void {
  _addSelect.innerHTML = '';
  for (const kind of ADD_KIND_ORDER) {
    const ops = OPS.filter(op => op.invoke && op.kind === kind)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (ops.length === 0) continue;
    const group = document.createElement('optgroup');
    group.label = kind;
    for (const op of ops) {
      const opt = document.createElement('option');
      opt.value = op.name;
      opt.textContent = op.name;
      group.appendChild(opt);
    }
    _addSelect.appendChild(group);
  }

  let getArgs: () => string[] = () => [];

  function updateForSelection(): void {
    const meta = OP_MAP.get(_addSelect.value);
    if (!meta) return;
    _addDesc.textContent = meta.desc;
    _addParams.innerHTML = '';
    getArgs = renderParamInputs(_addParams, meta, []);
  }

  _addSelect.onchange = updateForSelection;
  updateForSelection();

  _addApplyBtn.onclick = () => {
    const meta = OP_MAP.get(_addSelect.value);
    if (!meta) return;
    const block = [meta.name, ...getArgs()].join(' ').trimEnd();
    _editorLines.push(block);
    renderEditor();
    _onChange();
    _addDialog.close();
  };

  _addDialog.showModal();
}

// ── Wrap dialog ───────────────────────────────────────────────────────────────

const WRAP_OPS = OPS.filter(op => op.kind === OpKind.wrap);

function openWrapDialog(lineIndex: number): void {
  _wrapSelect.innerHTML = '';
  for (const op of WRAP_OPS) {
    const opt = document.createElement('option');
    opt.value = op.name;
    opt.textContent = op.name;
    _wrapSelect.appendChild(opt);
  }

  let getArgs: () => string[] = () => [];

  function updateForSelection(): void {
    const meta = OP_MAP.get(_wrapSelect.value);
    if (!meta) return;
    _wrapDesc.textContent = meta.desc;
    _wrapParams.innerHTML = '';
    getArgs = renderParamInputs(_wrapParams, meta, []);
  }

  _wrapSelect.onchange = updateForSelection;
  updateForSelection();

  _wrapApplyBtn.onclick = () => {
    const meta = OP_MAP.get(_wrapSelect.value);
    if (!meta) return;
    const original = _editorLines[lineIndex];
    let bodyText: string;
    try {
      const ast = parseBlock(original);
      bodyText = (ast.kind === 'list' && !ast.bare) ? original : `(${original})`;
    } catch {
      bodyText = `(${original})`;
    }
    _editorLines[lineIndex] = `(${meta.name} ${[...getArgs(), bodyText].join(' ')})`;
    renderEditor();
    _onChange();
    _wrapDialog.close();
  };

  _wrapDialog.showModal();
}

// ── Raw mode ──────────────────────────────────────────────────────────────────

function enterRawMode(): void {
  const ta = document.createElement('textarea');
  ta.className = 'raw-edit';
  ta.value = getScript();
  ta.spellcheck = false;
  _editorEl.innerHTML = '';
  _editorEl.appendChild(ta);
  ta.focus();
  ta.select();
  ta.addEventListener('blur', () => {
    setScript(ta.value);
    _onChange();
  }, { once: true });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); ta.blur(); }
  });
}

// ── Block rendering ───────────────────────────────────────────────────────────

function attachBlockHandlers(
  lineEl: HTMLElement,
  displayEl: HTMLElement,
  editEl: HTMLElement,
  i: number
): void {
  // Drag handle
  const handle = lineEl.querySelector<HTMLElement>('.drag-handle')!;

  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    _dragIndex = i;
    _dropIndex = null;
    _dropTarget = null;
    lineEl.classList.add('is-dragging');
  });

  handle.addEventListener('pointermove', (e) => {
    if (_dragIndex === null) return;
    const target = (document.elementFromPoint(e.clientX, e.clientY) as Element | null)
      ?.closest('.editor-line') as HTMLElement | null;
    const newDrop = target ? parseInt(target.dataset.index!) : _dropIndex;
    if (newDrop !== _dropIndex) {
      // Update drag-over only on the changed element rather than querying all lines.
      _dropTarget?.classList.remove('drag-over');
      _dropIndex = newDrop;
      _dropTarget = (_dropIndex !== null && _dropIndex !== _dragIndex) ? target : null;
      _dropTarget?.classList.add('drag-over');
    }
  });

  handle.addEventListener('pointerup', () => {
    if (_dragIndex !== null && _dropIndex !== null && _dragIndex !== _dropIndex) {
      const [moved] = _editorLines.splice(_dragIndex, 1);
      const insertAt = _dropIndex > _dragIndex ? _dropIndex - 1 : _dropIndex;
      _editorLines.splice(insertAt, 0, moved);
      renderEditor();
      _onChange();
    }
    lineEl.classList.remove('is-dragging');
    _dropTarget?.classList.remove('drag-over');
    _dragIndex = null;
    _dropIndex = null;
    _dropTarget = null;
  });

  // ── Display interactions ────────────────────────────────────────────────────
  // Track whether a pointerdown on tok-effect is pending (to open modal on pointerup
  // without triggering edit mode). preventDefault on pointerdown blocks focus change.
  let pendingEffectClick: { name: string; offset: number } | null = null;

  displayEl.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement;

    if (target.classList.contains('tok-num')) {
      e.preventDefault();
      startScrub(e, target, i, displayEl, editEl);
      return;
    }

    if (target.classList.contains('tok-effect')) {
      e.preventDefault();
      pendingEffectClick = {
        name: target.textContent!.toLowerCase(),
        offset: parseInt(target.dataset.offset!),
      };
      return;
    }

    // Anything else: enter edit mode at click point
    e.preventDefault();
    enterEditMode(displayEl, editEl, _editorLines[i], { x: e.clientX, y: e.clientY });
  });

  displayEl.addEventListener('pointerup', () => {
    if (pendingEffectClick !== null) {
      const { name, offset } = pendingEffectClick;
      pendingEffectClick = null;
      const meta = OP_MAP.get(name);
      if (!meta) return;
      const exprRange = findExprBounds(_editorLines[i], offset);
      const currentText = _editorLines[i].slice(exprRange.start, exprRange.end);
      openEffectModal(meta, currentText, i, exprRange);
    }
  });

  // If the pointer leaves without a pointerup, discard the pending effect click.
  displayEl.addEventListener('pointercancel', () => { pendingEffectClick = null; });

  // Tab / Enter on display (keyboard access without clicking)
  displayEl.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Tab') return; // let Tab move focus naturally
    if (e.key === 'Enter' || (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1)) {
      e.preventDefault();
      enterEditMode(displayEl, editEl, _editorLines[i]);
      // Insert the typed char immediately
      if (e.key.length === 1 && e.key !== 'Enter') {
        document.execCommand('insertText', false, e.key);
      }
    }
  });

  // Focus on display (e.g. via Tab) → enter edit mode
  displayEl.addEventListener('focus', () => {
    // Skip if already in edit mode (shouldn't happen but guard anyway)
    if (!editEl.hidden) return;
    enterEditMode(displayEl, editEl, _editorLines[i]);
  });

  // ── Edit interactions ───────────────────────────────────────────────────────
  editEl.addEventListener('blur', () => {
    if (_suppressBlur) return;
    const text = getEditText(editEl);
    if (text === '' && _editorLines.length > 1) {
      _editorLines.splice(i, 1);
      renderEditor();
      _onChange();
      return;
    }
    _editorLines[i] = text;
    editEl.hidden = true;
    displayEl.hidden = false;
    renderDisplay(displayEl, text);
    _onChange();
  });

  editEl.addEventListener('input', () => {
    _editorLines[i] = getEditText(editEl);
    _onChange();
  });

  // Ensure paste is always plain text
  editEl.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  });

  editEl.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const text = getEditText(editEl);
      const atEnd = selectionCharOffsets(editEl).start >= text.length;
      const singleLine = !text.includes('\n');
      if (singleLine || atEnd) {
        e.preventDefault();
        _editorLines[i] = text;
        editEl.blur();
        _editorLines.splice(i + 1, 0, '');
        renderEditor();
        focusLine(i + 1);
      }
      // else: allow default (inserts newline within multi-line block)
      return;
    }

    if (e.key === 'Backspace' && getEditText(editEl) === '') {
      e.preventDefault();
      _editorLines.splice(i, 1);
      if (_editorLines.length === 0) _editorLines = [''];
      _suppressBlur = true;
      renderEditor();
      _suppressBlur = false;
      focusLine(Math.max(0, i - 1));
      _onChange();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const text = getEditText(editEl);
      if (text === '' && _editorLines.length > 1) {
        // Remove the empty line and focus correctly without index skew from blur.
        _editorLines.splice(i, 1);
        _suppressBlur = true;
        renderEditor();
        _suppressBlur = false;
        focusLine(e.shiftKey ? i - 1 : i);
        _onChange();
      } else {
        _editorLines[i] = text;
        editEl.blur();
        focusLine(i + (e.shiftKey ? -1 : 1));
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      // First Ctrl+A: browser selects all in block. Second Ctrl+A (already
      // fully selected): enter raw mode so the user can select across blocks.
      const text = getEditText(editEl);
      const selText = window.getSelection()?.toString() ?? '';
      if (selText === text) {
        e.preventDefault();
        enterRawMode();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      const text = getEditText(editEl);
      const lines = text.split('\n');

      // Save cursor position as (line index, column) and get selection range.
      const { start: startChar, end: endChar } = selectionCharOffsets(editEl);
      let cursorLine = 0, cursorCol = 0, pos = 0;
      for (let li = 0; li < lines.length; li++) {
        const lineEnd = pos + lines[li].length;
        if (startChar <= lineEnd) { cursorLine = li; cursorCol = startChar - pos; break; }
        pos = lineEnd + 1;
      }

      // Determine which lines are touched by the current selection.
      let firstLine = 0, lastLine = lines.length - 1;
      pos = 0;
      let foundFirst = false;
      for (let li = 0; li < lines.length; li++) {
        const lineEnd = pos + lines[li].length;
        if (!foundFirst && startChar <= lineEnd) { firstLine = li; foundFirst = true; }
        if (endChar <= lineEnd) { lastLine = li; break; }
        if (li === lines.length - 1) lastLine = li;
        pos = lineEnd + 1;
      }

      const allCommented = lines.slice(firstLine, lastLine + 1).every(l => /^#/.test(l));
      const newLines = lines.map((l, idx) => {
        if (idx < firstLine || idx > lastLine) return l;
        return allCommented ? l.replace(/^#\s?/, '') : '# ' + l;
      });
      const newText = newLines.join('\n');
      editEl.textContent = newText;
      _editorLines[i] = newText;

      // Restore caret, adjusting column for the prefix added/removed on cursor's line.
      let adjustedCol = cursorCol;
      if (cursorLine >= firstLine && cursorLine <= lastLine) {
        if (allCommented) {
          const removed = (lines[cursorLine].match(/^#\s?/) ?? [''])[0].length;
          adjustedCol = Math.max(0, cursorCol - removed);
        } else {
          adjustedCol = cursorCol + 2; // '# '
        }
      }
      let newOffset = 0;
      for (let li = 0; li < cursorLine; li++) newOffset += newLines[li].length + 1;
      newOffset += Math.min(adjustedCol, newLines[cursorLine]?.length ?? 0);
      setCaretOffset(editEl, newOffset);

      _onChange();
      return;
    }
  });
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderEditor(): void {
  _suppressBlur = false;
  _editorEl.innerHTML = '';

  _editorLines.forEach((block, i) => {
    const lineEl = document.createElement('div');
    lineEl.className = 'editor-line';
    lineEl.dataset.index = String(i);

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.setAttribute('aria-hidden', 'true');
    handle.textContent = '⠿';

    const wrapBtn = document.createElement('button');
    wrapBtn.type = 'button';
    wrapBtn.className = 'wrap-btn';
    wrapBtn.textContent = '()';
    wrapBtn.title = 'wrap in a special form';
    wrapBtn.addEventListener('pointerdown', () => { _suppressBlur = true; });
    wrapBtn.addEventListener('pointerup', () => { _suppressBlur = false; });
    wrapBtn.addEventListener('click', () => openWrapDialog(i));

    const lineWrap = document.createElement('div');
    lineWrap.className = 'line-wrap';

    const displayEl = document.createElement('div');
    displayEl.className = 'line-display';
    displayEl.tabIndex = 0;
    renderDisplay(displayEl, block);

    const editEl = document.createElement('div');
    editEl.className = 'line-edit';
    editEl.setAttribute('contenteditable', 'plaintext-only');
    editEl.spellcheck = false;
    editEl.hidden = true;

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-line-btn';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'remove this block';
    deleteBtn.addEventListener('pointerdown', () => { _suppressBlur = true; });
    deleteBtn.addEventListener('pointerup', () => { _suppressBlur = false; });
    deleteBtn.addEventListener('click', () => {
      _editorLines.splice(i, 1);
      if (_editorLines.length === 0) _editorLines = [''];
      renderEditor();
      _onChange();
    });

    lineWrap.append(displayEl, editEl);
    lineEl.append(handle, wrapBtn, lineWrap, deleteBtn);
    _editorEl.appendChild(lineEl);

    attachBlockHandlers(lineEl, displayEl, editEl, i);
  });

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'add-effect-btn';
  addBtn.textContent = '+';
  addBtn.title = 'add a new effect';
  addBtn.addEventListener('click', openAddEffectDialog);
  _editorEl.appendChild(addBtn);
}

// ── Public API ────────────────────────────────────────────────────────────────

function initEditor(
  el: HTMLElement,
  onChange: () => void,
  openHelp?: (tab: string) => void
): void {
  _editorEl = el;
  _onChange = onChange;
  _openHelp = openHelp;
  _effectDialog = document.getElementById('effect-dialog') as HTMLDialogElement;
  _dialogName = document.getElementById('effect-dialog-name')!;
  _dialogDesc = document.getElementById('effect-dialog-desc')!;
  _dialogParams = document.getElementById('effect-dialog-params')!;
  _dialogApply = document.getElementById('effect-dialog-apply') as HTMLButtonElement;
  document.getElementById('effect-dialog-cancel')!
    .addEventListener('click', () => _effectDialog.close());
  _effectDialog.addEventListener('click', e => {
    if (e.target === _effectDialog) _effectDialog.close();
  });

  _addDialog = document.getElementById('add-effect-dialog') as HTMLDialogElement;
  _addSelect = document.getElementById('add-effect-select') as HTMLSelectElement;
  _addDesc = document.getElementById('add-effect-desc') as HTMLParagraphElement;
  _addParams = document.getElementById('add-effect-params') as HTMLDivElement;
  _addApplyBtn = document.getElementById('add-effect-apply') as HTMLButtonElement;
  document.getElementById('add-effect-cancel')!
    .addEventListener('click', () => _addDialog.close());
  _addDialog.addEventListener('click', e => {
    if (e.target === _addDialog) _addDialog.close();
  });

  _wrapDialog = document.getElementById('wrap-dialog') as HTMLDialogElement;
  _wrapSelect = document.getElementById('wrap-select') as HTMLSelectElement;
  _wrapDesc = document.getElementById('wrap-desc') as HTMLParagraphElement;
  _wrapParams = document.getElementById('wrap-params') as HTMLDivElement;
  _wrapApplyBtn = document.getElementById('wrap-apply') as HTMLButtonElement;
  document.getElementById('wrap-cancel')!
    .addEventListener('click', () => _wrapDialog.close());
  _wrapDialog.addEventListener('click', e => {
    if (e.target === _wrapDialog) _wrapDialog.close();
  });

  renderEditor();
}

function getScript(): string {
  return _editorLines.join('\n');
}

function setScript(code: string): void {
  const blocks = splitIntoBlocks(code).filter(b => b.trim().length > 0);
  // Always keep at least one block so the editor has an editable line.
  _editorLines = blocks.length > 0 ? blocks : [''];
  renderEditor();
}
