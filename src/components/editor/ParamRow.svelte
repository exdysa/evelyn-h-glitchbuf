<script lang="ts">
  import { untrack } from 'svelte';
  import type { ParseNode } from '../../glitchsp';
  import type { ParamDef } from '../../ops';
  import { makeParamScale } from './param-math';
  import ParamSlider from './ParamSlider.svelte';
  import RandPanel from './RandPanel.svelte';

  let {
    param,
    argNode,
    currentText,
    startDisabled = false,
    onchange,
  }: {
    param: ParamDef;
    argNode?: ParseNode;
    currentText?: string;
    startDisabled?: boolean;
    onchange?: (value: string | null) => void;
  } = $props();

  let expanded = $state(false);
  function ontoggle() {
    expanded = !expanded;
  }

  // ── Parse existing argument (init-time only) ──────────────────────────────

  // (rand max) → a=0, b=max   (rand min max) → a=min, b=max
  // (randn std) → a=0, b=std  (randn mean std) → a=mean, b=std
  function parseRand(
    node: ParseNode | undefined
  ): { fn: 'rand' | 'randn'; a: number; b: number } | null {
    if (!node || node.kind !== 'list') return null;
    const len = node.children.length;
    if (len < 2 || len > 3) return null;
    const [head, arg1, arg2] = node.children;
    if (head.kind !== 'atom' || typeof head.value !== 'string') return null;
    if (head.value !== 'rand' && head.value !== 'randn') return null;
    if (arg1.kind !== 'atom' || typeof arg1.value !== 'number') return null;
    if (len === 2) {
      // single-arg: implicit a=0, parsed value is b
      return { fn: head.value as 'rand' | 'randn', a: 0, b: arg1.value };
    }
    if (arg2.kind !== 'atom' || typeof arg2.value !== 'number') return null;
    return { fn: head.value as 'rand' | 'randn', a: arg1.value, b: arg2.value };
  }

  // untrack: these read props once at mount to set up internal state.
  // argNode / param / startDisabled do not change for a given ParamRow instance.
  const { randInfo, initMode, initVal, initRandA, initRandB } = untrack(() => {
    const randInfo = parseRand(argNode);
    const parsedNum =
      !randInfo && argNode?.kind === 'atom' && typeof argNode.value === 'number'
        ? argNode.value
        : NaN;
    const isSimple = !isNaN(parsedNum);
    const initVal = isNaN(parsedNum)
      ? param.default
      : Math.min(param.max, Math.max(param.min, parsedNum));

    type Mode = 'slider' | 'rand' | 'complex' | 'disabled';
    const initMode: Mode = startDisabled
      ? 'disabled'
      : randInfo
        ? 'rand'
        : argNode && !isSimple
          ? 'complex'
          : 'slider';

    return {
      randInfo,
      initMode,
      initVal,
      initRandA: randInfo?.a ?? param.min,
      initRandB: randInfo?.b ?? param.max,
    };
  });

  // ── Internal state ────────────────────────────────────────────────────────

  type Mode = 'slider' | 'rand' | 'complex' | 'disabled';
  let mode: Mode = $state(initMode);
  let sliderValue = $state(initVal);
  let randFn: 'rand' | 'randn' = $state(randInfo?.fn ?? 'rand');
  let randA = $state(initRandA);
  let randB = $state(initRandB);

  const scale = $derived(makeParamScale(param));

  const complexText = $derived(
    argNode && currentText
      ? currentText.slice(argNode.span.start, argNode.span.end)
      : scale.fmt(param.default)
  );

  // ── Derived output value ──────────────────────────────────────────────────

  const currentValue: string | null = $derived.by(() => {
    if (mode === 'disabled') return null;
    if (mode === 'complex') return complexText;
    if (mode === 'rand') return `(${randFn} ${scale.fmt(randA)} ${scale.fmt(randB)})`;
    return scale.fmt(sliderValue);
  });

  $effect(() => {
    onchange?.(currentValue);
  });

  const headerLabel = $derived(param.unit ? `${param.name} [${param.unit}]` : param.name);
</script>

<div class="param-row">
  <div class="param-header">
    <span
      class="param-chevron"
      role="button"
      tabindex="0"
      aria-expanded={expanded}
      onclick={ontoggle}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && ontoggle()}
      >{expanded ? '▼' : '▶'}</span
    >
    <span
      class="param-label"
      title={param.desc}
      onclick={ontoggle}
      role="button"
      tabindex="0"
      aria-expanded={expanded}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && ontoggle?.()}>{headerLabel}</span
    >
    <div class="param-controls">
      {#if mode === 'slider' || mode === 'disabled'}
        <ParamSlider {param} bind:value={sliderValue} disabled={mode === 'disabled'} />
      {:else}
        <input type="text" disabled class="param-rand-preview" value={currentValue ?? ''} />
      {/if}
    </div>
  </div>

  {#if expanded}
    <div class="param-expanded">
      <p class="param-desc">{param.desc}</p>

      {#if param.optional}
        <label class="param-option">
          <input
            type="checkbox"
            checked={mode === 'disabled'}
            disabled={mode === 'rand'}
            onchange={(e) => {
              mode = e.currentTarget.checked ? 'disabled' : 'slider';
            }}
          />
          disable (use default)
        </label>
      {/if}

      {#if mode !== 'complex'}
        <label class="param-option">
          <input
            type="checkbox"
            checked={mode === 'rand'}
            disabled={mode === 'disabled'}
            onchange={(e) => {
              mode = e.currentTarget.checked ? 'rand' : 'slider';
            }}
          />
          randomize
        </label>
      {/if}

      {#if mode === 'rand'}
        <div class="param-rand-panel">
          <RandPanel {param} bind:fn={randFn} bind:a={randA} bind:b={randB} />
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .param-row {
    display: flex;
    flex-direction: column;
    margin-bottom: 16px;
  }

  /* grid: fixed chevron | shrink-to-fit label | all remaining space for controls */
  .param-header {
    display: grid;
    grid-template-columns: 1rem auto 1fr;
    align-items: center;
    gap: 8px;
  }

  .param-chevron {
    cursor: pointer;
    color: var(--fg-dim);
    font-size: 10px;
    user-select: none;
    text-align: center;
  }

  .param-header > .param-label {
    color: var(--fg-dim);
    font-size: var(--label-size);
    cursor: pointer;
    white-space: nowrap;
  }

  .param-controls {
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  }

  /* ParamSlider renders these inputs, so :global() is needed */
  .param-controls :global(input[type='range']) {
    flex: 1;
    min-width: 0;
  }
  .param-controls :global(input[type='number']) {
    width: 5rem;
    flex-shrink: 0;
  }

  .param-rand-preview {
    flex: 1;
    min-width: 0;
    color: var(--fg-dim);
  }

  .param-expanded {
    margin-top: 4px;
    padding: 8px;
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .param-expanded > :last-child {
    margin-bottom: 0;
  }

  .param-desc {
    font-size: var(--label-size);
    color: var(--fg-dim);
    margin: 0 0 8px;
  }

  .param-option {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--label-size);
    color: var(--fg);
    cursor: pointer;
  }

  .param-rand-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 4px;
  }
</style>
