<script lang="ts">
  import Prompt from '../base/Prompt.svelte';
  import Field from '../base/Field.svelte';

  let { onclose }: { onclose: (result: string | null) => void } = $props();
  let name = $state('');
</script>

<Prompt onclose={(r) => onclose(r as string | null)}>
  {#snippet msg()}preset name:{/snippet}
  {#snippet body({ done })}
    <!-- svelte-ignore a11y_autofocus -->
    <Field>
      <input
        autofocus
        type="text"
        spellcheck="false"
        bind:value={name}
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            done(name.trim() || null);
          }
        }}
      />
    </Field>
  {/snippet}
  {#snippet buttons({ done })}
    <button type="button" onclick={() => done(name.trim() || null)}>save</button>
    <button type="button" onclick={() => done(null)}>cancel</button>
  {/snippet}
</Prompt>
