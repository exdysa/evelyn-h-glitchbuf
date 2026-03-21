<script lang="ts">
  import { getAppContext } from '../context';
  import Field from './base/Field.svelte';
  import Button from './base/Button.svelte';

  const ctx = getAppContext();

  function randomise(): void {
    ctx.state.seed = String(Math.floor(Math.random() * 0x100000000) >>> 0);
    ctx.runImage(true);
  }
</script>

<div class="seed-row">
  <Field label="seed" for="seed">
    <input id="seed" type="text" spellcheck="false" bind:value={ctx.state.seed} />
  </Field>
  <Button onclick={randomise}>randomise</Button>
</div>

<style>
  .seed-row {
    display: flex;
    gap: 6px;
    align-items: flex-end;
  }

  .seed-row :global(.field) {
    flex: 1;
    min-width: 0;
  }
</style>
