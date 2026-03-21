<script lang="ts">
  import type { ParamDef } from '../../ops';
  import ParamSlider from './ParamSlider.svelte';

  let {
    param,
    fn = $bindable('rand' as 'rand' | 'randn'),
    a = $bindable(),
    b = $bindable(),
  }: {
    param: ParamDef;
    fn: 'rand' | 'randn';
    a: number;
    b: number;
  } = $props();

  // unique name so radio groups don't bleed across multiple ParamRows
  const groupId = `rand-fn-${Math.random().toString(36).slice(2)}`;

  const stdMax = $derived(Math.abs(param.max - param.min) / 2);
  const stdParam: ParamDef = $derived({
    ...param,
    min: 0,
    max: stdMax,
    default: 0,
  });

  function setFn(newFn: 'rand' | 'randn') {
    if (newFn === fn) return;
    fn = newFn;
    if (newFn === 'rand') {
      a = param.min;
      b = param.max;
    } else {
      a = (param.min + param.max) / 2;
      b = Math.abs(param.max - param.min) / 6;
    }
  }
</script>

<div class="param-rand-type">
  <label>
    <input
      type="radio"
      name={groupId}
      value="rand"
      checked={fn === 'rand'}
      onchange={() => setFn('rand')}
    />
    rand (uniform)
  </label>
  <label>
    <input
      type="radio"
      name={groupId}
      value="randn"
      checked={fn === 'randn'}
      onchange={() => setFn('randn')}
    />
    randn (gaussian)
  </label>
</div>
<div class="param-rand-inputs">
  {#if fn === 'rand'}
    <div class="param-rand-row">
      <span>min</span>
      <ParamSlider {param} bind:value={a} />
    </div>
    <div class="param-rand-row">
      <span>max</span>
      <ParamSlider {param} bind:value={b} />
    </div>
  {:else}
    <div class="param-rand-row">
      <span>mean</span>
      <ParamSlider {param} bind:value={a} />
    </div>
    <div class="param-rand-row">
      <span>std</span>
      <ParamSlider param={stdParam} bind:value={b} />
    </div>
  {/if}
</div>

<style>
  .param-rand-type {
    display: flex;
    gap: 16px;
    font-size: var(--label-size);
  }

  .param-rand-type > label {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .param-rand-inputs {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .param-rand-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--label-size);
    color: var(--fg-dim);
  }

  .param-rand-row span {
    flex-shrink: 0;
    min-width: 28px;
  }

  /* ParamSlider renders these inputs, so :global() is needed */
  .param-rand-row :global(input[type='range']) {
    flex: 1;
    min-width: 0;
  }
  .param-rand-row :global(input[type='number']) {
    width: 5rem;
    flex-shrink: 0;
  }
</style>
