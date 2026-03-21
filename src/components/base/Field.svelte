<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    for: labelFor,
    class: cls = '',
    children,
    ...rest
  }: {
    label?: string;
    for?: string;
    class?: string;
    children: Snippet;
    [key: string]: unknown;
  } = $props();
</script>

<div class={['field', cls].filter(Boolean).join(' ')} {...rest}>
  {#if label}
    <label for={labelFor}>{label}</label>
  {/if}
  {@render children()}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  label {
    color: var(--fg-dim);
    font-size: var(--label-size);
  }

  /* inputs in children snippets aren't scoped to this component, so :global() is needed */
  .field :global(input[type='text']) {
    width: 100%;
  }
</style>
