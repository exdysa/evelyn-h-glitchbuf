<script lang="ts">
  import { tick } from 'svelte';
  import { splitIntoBlocks } from '../../glitchsp';
  import { OP_MAP } from '../../ops';
  import {
    getEditText,
    placeCaretAtEnd,
    placeCaretAtPoint,
    selectionCharOffsets,
    setCaretOffset,
    findExprBounds,
  } from '../../editor';
  import LineDisplay from './LineDisplay.svelte';
  import LineButton from './LineButton.svelte';
  import type { EffectModalApi } from './types';

  let {
    block,
    lineIndex,
    linesCount,
    isDragging,
    isDragOver,
    modal,
    onblockchange,
    ondelete,
    onreplaceblocks,
    oninsertafter,
    onfocusdelta,
    onenterraw,
    ondragstart,
    ondragmove,
    ondragend,
  }: {
    block: string;
    lineIndex: number;
    linesCount: number;
    isDragging: boolean;
    isDragOver: boolean;
    modal: EffectModalApi | null;
    onblockchange: (newBlock: string, commit: boolean) => void;
    ondelete: (focusDir: number) => void;
    onreplaceblocks: (blocks: string[]) => void;
    oninsertafter: (text: string) => void;
    onfocusdelta: (delta: number) => void;
    onenterraw: () => void;
    ondragstart: (idx: number) => void;
    ondragmove: (e: PointerEvent) => void;
    ondragend: () => void;
  } = $props();

  type EditState = 'display' | 'entering' | 'editing' | 'deleting';
  let editState = $state<EditState>('display');
  const isCommented = $derived(
    block
      .split('\n')
      .filter((l) => l.trim())
      .every((l) => /^#/.test(l))
  );

  function toggleBlockComment(text: string): string {
    const lines = text.split('\n');
    const allCommented = lines.filter((l) => l.trim()).every((l) => /^#/.test(l));
    return lines
      .map((l) => (l.trim() ? (allCommented ? l.replace(/^#\s?/, '') : '# ' + l) : l))
      .join('\n');
  }
  let editEl = $state<HTMLDivElement | undefined>(undefined);
  let lineEl = $state<HTMLDivElement | undefined>(undefined);

  function enterEdit(point?: { x: number; y: number }): void {
    if (editState === 'editing') {
      if (point && editEl) placeCaretAtPoint(editEl, point.x, point.y);
      return;
    }
    editState = 'entering';
    tick().then(() => {
      editState = 'editing';
      if (!editEl) return;
      // eslint-disable-next-line svelte/no-dom-manipulating
      editEl.textContent = block;
      editEl.focus();
      if (point) placeCaretAtPoint(editEl, point.x, point.y);
      else placeCaretAtEnd(editEl);
    });
  }

  function commitEdit(): void {
    if (editState !== 'editing') return;
    const text = getEditText(editEl!);
    editState = 'display';
    if (text === '' && linesCount > 1) {
      editState = 'deleting';
      ondelete(-1);
      return;
    }
    const blocks = splitIntoBlocks(text).filter((b) => b.trim());
    if (blocks.length > 1) {
      onreplaceblocks(blocks);
      return;
    }
    onblockchange(text || block, true);
  }

  function handleFocusOut(e: FocusEvent): void {
    if (editState !== 'editing') return;
    if (e.relatedTarget !== null && lineEl!.contains(e.relatedTarget as Node)) return;
    commitEdit();
  }

  function handleEffectClick(name: string, offset: number): void {
    const meta = OP_MAP.get(name);
    if (!meta) return;
    const exprRange = findExprBounds(block, offset);
    const currentText = block.slice(exprRange.start, exprRange.end);
    modal?.open({
      kind: 'edit',
      meta,
      currentText,
      onApply: (result) => {
        const newBlock = block.slice(0, exprRange.start) + result + block.slice(exprRange.end);
        onblockchange(newBlock, true);
      },
    });
  }

  function handleWrap(): void {
    modal?.open({
      kind: 'wrap',
      original: block,
      onApply: (wrapped) => onblockchange(wrapped, true),
    });
  }

  function handleToggleComment(): void {
    onblockchange(toggleBlockComment(block), true);
  }

  function handleDelete(): void {
    editState = 'deleting';
    ondelete(-1);
  }

  function handleEditInput(): void {
    onblockchange(getEditText(editEl!), false);
  }

  function handleEditPaste(e: ClipboardEvent): void {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '');
  }

  function handleEditKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      const text = getEditText(editEl!);
      const atEnd = selectionCharOffsets(editEl!).start >= text.length;
      const singleLine = !text.includes('\n');
      if (singleLine || atEnd) {
        e.preventDefault();
        editState = 'display';
        oninsertafter(text);
      }
      return;
    }

    if (e.key === 'Backspace' && getEditText(editEl!) === '') {
      e.preventDefault();
      editState = 'deleting';
      ondelete(-1);
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const text = getEditText(editEl!);
      if (text === '' && linesCount > 1) {
        editState = 'deleting';
        ondelete(e.shiftKey ? -1 : 0);
      } else {
        onblockchange(text, true);
        editState = 'display';
        onfocusdelta(e.shiftKey ? -1 : 1);
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      const text = getEditText(editEl!);
      const selText = window.getSelection()?.toString() ?? '';
      if (selText === text) {
        e.preventDefault();
        editState = 'display';
        onenterraw();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      const text = getEditText(editEl!);
      const lines = text.split('\n');
      const allCommented = lines.filter((l) => l.trim()).every((l) => /^#/.test(l));

      const { start: startChar } = selectionCharOffsets(editEl!);
      let cursorLine = 0,
        cursorCol = 0,
        pos = 0;
      for (let li = 0; li < lines.length; li++) {
        const lineEnd = pos + lines[li].length;
        if (startChar <= lineEnd) {
          cursorLine = li;
          cursorCol = startChar - pos;
          break;
        }
        pos = lineEnd + 1;
      }

      const newText = toggleBlockComment(text);
      const newLines = newText.split('\n');
      editEl!.textContent = newText;

      let adjustedCol = cursorCol;
      if (lines[cursorLine]?.trim()) {
        if (allCommented) {
          const removed = (lines[cursorLine].match(/^#\s?/) ?? [''])[0].length;
          adjustedCol = Math.max(0, cursorCol - removed);
        } else {
          adjustedCol = cursorCol + 2;
        }
      }
      let newOffset = 0;
      for (let li = 0; li < cursorLine; li++) newOffset += newLines[li].length + 1;
      newOffset += Math.min(adjustedCol, newLines[cursorLine]?.length ?? 0);
      setCaretOffset(editEl!, newOffset);

      onblockchange(newText, false);
      return;
    }
  }
</script>

<div
  class="editor-line"
  class:is-dragging={isDragging}
  class:drag-over={isDragOver}
  class:is-commented={isCommented}
  data-index={lineIndex}
  bind:this={lineEl}
  onfocusout={handleFocusOut}
>
  <!-- pointercancel fires when the browser cancels the gesture (e.g. a scroll
       container interferes). without it the drag state gets permanently stuck. -->
  <LineButton
    class="drag-handle"
    aria-hidden="true"
    onpointerdown={(e) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      ondragstart(lineIndex);
    }}
    onpointermove={(e) => ondragmove(e)}
    onpointerup={() => ondragend()}
    onpointercancel={() => ondragend()}
  >
    <svg viewBox="0 0 6 10" width="6" height="10" fill="currentColor" aria-hidden="true">
      <rect x="0" y="0" width="2" height="2" /><rect x="4" y="0" width="2" height="2" />
      <rect x="0" y="4" width="2" height="2" /><rect x="4" y="4" width="2" height="2" />
      <rect x="0" y="8" width="2" height="2" /><rect x="4" y="8" width="2" height="2" />
    </svg>
  </LineButton>

  <LineButton
    class="wrap-btn"
    title="wrap in a special form"
    aria-label="wrap in a special form"
    onclick={handleWrap}>()</LineButton
  >

  <div class="line-wrap">
    {#if editState === 'display'}
      <LineDisplay
        {block}
        onenteredit={enterEdit}
        oneffectclick={handleEffectClick}
        {onblockchange}
      />
    {:else}
      <div
        class="line-edit"
        role="textbox"
        aria-multiline="true"
        tabindex="0"
        contenteditable="plaintext-only"
        spellcheck={false}
        bind:this={editEl}
        oninput={handleEditInput}
        onpaste={handleEditPaste}
        onkeydown={handleEditKeyDown}
      ></div>
    {/if}
  </div>

  <LineButton
    class="comment-btn"
    title={isCommented ? 'uncomment' : 'comment out'}
    aria-label={isCommented ? 'uncomment' : 'comment out'}
    onclick={handleToggleComment}
  >
    {#if isCommented}
      <svg
        viewBox="0 0 8 8"
        width="8"
        height="8"
        fill="none"
        stroke="currentColor"
        stroke-width="1"
        aria-hidden="true"
      >
        <circle cx="4" cy="4" r="3" />
      </svg>
    {:else}
      <svg viewBox="0 0 8 8" width="8" height="8" fill="currentColor" aria-hidden="true">
        <circle cx="4" cy="4" r="4" />
      </svg>
    {/if}
  </LineButton>
  <LineButton
    class="delete-line-btn"
    title="remove this block"
    aria-label="remove this block"
    onclick={handleDelete}>×</LineButton
  >
</div>

<style>
  .editor-line {
    display: flex;
    align-items: baseline;
    gap: 4px;
    padding: 2px 0;
  }

  .editor-line.is-dragging {
    opacity: 0.4;
  }

  .editor-line.drag-over {
    border-top: 2px solid var(--fg);
  }

  .editor-line :global(.drag-handle) {
    cursor: grab;
    touch-action: none;
    opacity: 0.4;
  }

  .line-wrap {
    flex: 1;
    min-width: 0;
    padding: 0 2px;
  }

  .line-edit {
    white-space: pre-wrap;
    word-break: break-all;
    min-height: 1.5em;
    outline: none;
  }

  /* zero-width space gives the empty contenteditable a first formatted line,
     so align-items: baseline has a real baseline to anchor to instead of
     falling back to the block-end margin edge and jumping the cursor up */
  .line-edit::before {
    content: '\200B';
  }

  .editor-line :global(.wrap-btn) {
    opacity: 0.3;
  }

  .editor-line :global(.comment-btn) {
    opacity: 0;
  }

  .editor-line.is-commented :global(.comment-btn) {
    opacity: 0.7;
  }

  .editor-line :global(.delete-line-btn) {
    opacity: 0;
  }

  /* on touch devices, always show action buttons since hover doesn't exist */
  @media (hover: none) {
    .editor-line :global(.wrap-btn),
    .editor-line :global(.comment-btn),
    .editor-line :global(.delete-line-btn) {
      opacity: 0.4;
    }
    .editor-line.is-commented :global(.comment-btn) {
      opacity: 0.8;
    }
  }
</style>
