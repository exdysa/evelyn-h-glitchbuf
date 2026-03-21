<script lang="ts">
  import Prompt from '../base/Prompt.svelte';
  import Field from '../base/Field.svelte';

  type Result = { name: string } | 'discard' | null;
  let { onclose }: { onclose: (result: Result) => void } = $props();

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  let name = $state(
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  );
</script>

<Prompt onclose={(r) => onclose(r as Result)}>
  {#snippet msg()}save current script as a preset before loading?{/snippet}
  {#snippet body()}
    <Field label="name" for="preset-confirm-name">
      <input id="preset-confirm-name" type="text" spellcheck="false" bind:value={name} />
    </Field>
  {/snippet}
  {#snippet buttons({ done })}
    <!-- svelte-ignore a11y_autofocus -->
    <button autofocus type="button" onclick={() => done({ name: name.trim() })}
      >save &amp; load</button
    >
    <div class="spacer"></div>
    <button type="button" onclick={() => done('discard')}>discard</button>
    <button type="button" onclick={() => done(null)}>cancel</button>
  {/snippet}
</Prompt>

<style>
  .spacer {
    flex: 1;
  }
</style>
