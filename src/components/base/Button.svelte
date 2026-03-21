<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    children,
    type = 'button',
    ...rest
  }: {
    children: Snippet;
    type?: string;
    [key: string]: unknown;
  } = $props();
</script>

<button {type} {...rest}>{@render children()}</button>

<style>
</style>
