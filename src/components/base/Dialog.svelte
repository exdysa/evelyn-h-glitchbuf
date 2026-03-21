<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    open,
    onclose,
    children,
    buttons,
    ...rest
  }: {
    open: boolean;
    onclose?: () => void;
    children: Snippet;
    buttons?: Snippet;
    [key: string]: unknown;
  } = $props();

  function modal(node: HTMLDialogElement) {
    $effect(() => {
      if (open) node.showModal();
      else if (node.open) node.close();
    });
  }
</script>

<dialog use:modal onclose={() => onclose?.()} aria-modal="true" {...rest}>
  {@render children()}
  {#if buttons}
    <div class="buttons">{@render buttons()}</div>
  {/if}
</dialog>

<style>
  dialog {
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--fg);
    font-family: var(--font);
    font-size: var(--font-size);
    padding: var(--sp);
    min-width: 12rem;
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.55);
  }

  .buttons {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 16px;
  }
</style>
