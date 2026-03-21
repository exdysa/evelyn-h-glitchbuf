<script lang="ts">
  import { tick, onMount } from 'svelte';
  import { splitIntoBlocks } from '../../glitchsp';
  import EffectModal from './EffectModal.svelte';
  import EditorLine from './EditorLine.svelte';
  import type { EffectModalApi } from './types';

  export interface EditorApi {
    setScript(code: string): void;
  }

  let {
    script,
    onchange,
    oncommit,
    onready,
  }: {
    script: string;
    onchange: (script: string) => void;
    oncommit: () => void;
    onready?: (api: EditorApi) => void;
  } = $props();

  type Line = { id: number; block: string };
  let nextId = 0;

  function toLines(code: string): Line[] {
    const blocks = splitIntoBlocks(code).filter((b) => b.trim().length > 0);
    const result = blocks.length > 0 ? blocks : [''];
    return result.map((block) => ({ id: nextId++, block }));
  }

  // script is intentionally used only as the initial value; external updates go through editorApi.setScript()
  // svelte-ignore state_referenced_locally
  let lines = $state<Line[]>(toLines(script));
  let rawMode = $state(false);
  let rawScript = $state('');
  let dragIndex = $state<number | null>(null);
  let dropIndex = $state<number | null>(null);
  let editorEl: HTMLDivElement | undefined;
  let modal = $state<EffectModalApi | null>(null);

  function setScript(code: string): void {
    lines = toLines(code);
    rawMode = false;
  }

  function focusLine(idx: number): void {
    tick().then(() => {
      const clamped = Math.max(0, Math.min(idx, lines.length - 1));
      const lineEls = editorEl!.querySelectorAll<HTMLElement>('.editor-line');
      const target = lineEls[clamped]?.querySelector<HTMLElement>('.line-display, .line-edit');
      target?.focus();
    });
  }

  function notify(newLines: Line[], commit: boolean): void {
    lines = newLines;
    onchange(newLines.map((l) => l.block).join('\n'));
    if (commit) oncommit();
  }

  function handleBlockChange(idx: number, newBlock: string, commit: boolean): void {
    const newLines = lines.slice();
    newLines[idx] = { ...newLines[idx], block: newBlock };
    notify(newLines, commit);
  }

  function handleDelete(idx: number, focusDir: number): void {
    const newLines = lines.slice();
    newLines.splice(idx, 1);
    if (newLines.length === 0) newLines.push({ id: nextId++, block: '' });
    notify(newLines, true);
    focusLine(Math.max(0, Math.min(idx + focusDir, newLines.length - 1)));
  }

  function handleReplaceBlocks(idx: number, blocks: string[]): void {
    const newLines = lines.slice();
    newLines.splice(idx, 1, ...blocks.map((block) => ({ id: nextId++, block })));
    notify(newLines, true);
  }

  function handleInsertAfter(idx: number, text: string): void {
    const newLines = lines.slice();
    newLines[idx] = { ...newLines[idx], block: text };
    newLines.splice(idx + 1, 0, { id: nextId++, block: '' });
    notify(newLines, true);
    focusLine(idx + 1);
  }

  function handleFocusDelta(idx: number, delta: number): void {
    focusLine(idx + delta);
  }

  function handleEnterRaw(): void {
    rawScript = lines.map((l) => l.block).join('\n');
    rawMode = true;
    tick().then(() => {
      const ta = editorEl!.querySelector<HTMLTextAreaElement>('.raw-edit');
      ta?.focus();
      ta?.select();
    });
  }

  function exitRaw(): void {
    const parsed = rawScript;
    setScript(parsed);
    onchange(parsed);
    oncommit();
  }

  function handleDragStart(idx: number): void {
    dragIndex = idx;
    dropIndex = null;
  }

  function handleDragMove(e: PointerEvent): void {
    if (dragIndex === null) return;
    const target = (document.elementFromPoint(e.clientX, e.clientY) as Element | null)?.closest(
      '.editor-line, .drop-sentinel'
    ) as HTMLElement | null;
    if (target) {
      const parsed = parseInt(target.dataset.index ?? '');
      if (!isNaN(parsed)) dropIndex = parsed;
    }
  }

  function handleDragEnd(): void {
    if (dragIndex !== null && dropIndex !== null && dragIndex !== dropIndex) {
      const newLines = lines.slice();
      const [moved] = newLines.splice(dragIndex, 1);
      const insertAt = dropIndex > dragIndex ? dropIndex - 1 : dropIndex;
      newLines.splice(insertAt, 0, moved);
      notify(newLines, true);
    }
    dragIndex = null;
    dropIndex = null;
  }

  function handleAdd(): void {
    modal?.open({
      kind: 'add',
      onApply: (block) => {
        notify([...lines, { id: nextId++, block }], true);
      },
    });
  }

  onMount(() => {
    onready?.({ setScript });
  });
</script>

<div id="editor" bind:this={editorEl}>
  {#if rawMode}
    <textarea
      class="raw-edit"
      bind:value={rawScript}
      spellcheck={false}
      onblur={exitRaw}
      onkeydown={(e) => {
        if (e.key === 'Escape') (e.currentTarget as HTMLElement).blur();
      }}
    ></textarea>
  {:else}
    {#each lines as line, i (line.id)}
      <EditorLine
        block={line.block}
        lineIndex={i}
        linesCount={lines.length}
        isDragging={dragIndex === i}
        isDragOver={dropIndex === i && dragIndex !== null && dragIndex !== i}
        {modal}
        onblockchange={(newBlock, commit) => handleBlockChange(i, newBlock, commit)}
        ondelete={(dir) => handleDelete(i, dir)}
        onreplaceblocks={(blocks) => handleReplaceBlocks(i, blocks)}
        oninsertafter={(text) => handleInsertAfter(i, text)}
        onfocusdelta={(delta) => handleFocusDelta(i, delta)}
        onenterraw={handleEnterRaw}
        ondragstart={handleDragStart}
        ondragmove={handleDragMove}
        ondragend={handleDragEnd}
      />
    {/each}
    <div
      class="drop-sentinel"
      data-index={lines.length}
      class:drag-over={dropIndex === lines.length && dragIndex !== null}
    ></div>
    <button
      type="button"
      class="add-effect-btn"
      title="add a new effect"
      aria-label="add a new effect"
      onclick={handleAdd}>+</button
    >
  {/if}
</div>
<EffectModal
  onready={(api) => {
    modal = api;
  }}
/>

<style>
  #editor {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    background: var(--bg-input);
    border: 1px solid var(--border);
    padding: 4px;
    line-height: 1.8;
  }

  .drop-sentinel {
    height: 4px;
    flex-shrink: 0;
  }

  .drop-sentinel.drag-over {
    border-top: 2px solid var(--fg);
  }

  .raw-edit {
    flex: 1;
    resize: none;
    background: transparent;
    border: none;
    outline: none;
    line-height: 1.5;
  }

  .add-effect-btn {
    display: block;
    width: 100%;
    padding: 2px 0;
    background: none;
    border: none;
    color: var(--fg-dim);
    cursor: pointer;
    font-size: 1rem;
    text-align: center;
    opacity: 0.5;
  }

  .add-effect-btn:hover {
    opacity: 1;
    color: var(--fg);
  }

  @media (max-width: 768px) {
    #editor {
      min-height: 8rem;
    }
  }
</style>
