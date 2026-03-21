<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  let {
    class: className = '',
    children,
    ...rest
  }: Omit<HTMLButtonAttributes, 'type'> & { children: Snippet } = $props();
</script>

<button type="button" class="line-btn {className}" {...rest}>{@render children()}</button>

<style>
  .line-btn {
    background: none;
    border: none;
    color: var(--fg-dim);
    cursor: pointer;
    font-size: 0.8rem;
    line-height: 1;
    width: 1.5rem;
    height: 1.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    flex-shrink: 0;
    user-select: none;
  }

  :global(.editor-line:hover) .line-btn {
    opacity: 0.7;
  }

  .line-btn:hover {
    opacity: 1 !important;
    color: var(--fg);
    background: var(--btn-hover);
  }
</style>
