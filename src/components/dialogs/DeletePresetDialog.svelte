<script lang="ts">
  import Prompt from '../base/Prompt.svelte';

  let { name, onclose }: { name: string; onclose: (result: true | null) => void } = $props();
</script>

<Prompt onclose={(r) => onclose(r as true | null)}>
  {#snippet msg()}delete preset "{name}"?{/snippet}
  {#snippet buttons({ done })}
    <!-- svelte-ignore a11y_autofocus -->
    <button autofocus type="button" onclick={() => done(true)}>delete</button>
    <button type="button" onclick={() => done(null)}>cancel</button>
  {/snippet}
</Prompt>
