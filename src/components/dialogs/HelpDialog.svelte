<script lang="ts">
  import { untrack } from 'svelte';
  import Dialog from '../base/Dialog.svelte';
  import HELP_MD from '../../../HELP.md?raw';
  import GLITCHSP_MD from '../../../GLITCHSP.md?raw';
  import EFFECTS_MD from '../../../EFFECTS.md?raw';

  const tabs = ['app', 'language', 'effects'] as const;
  type Tab = (typeof tabs)[number];
  const contents: Record<Tab, string> = { app: HELP_MD, language: GLITCHSP_MD, effects: EFFECTS_MD };

  let { tab = '', onclose }: { tab?: string; onclose: (result: null) => void } = $props();

  // tab is only meaningful at creation time (dialog is mounted fresh each call)
  let activeTab = $state<Tab>(untrack(() => tab && tab in contents ? tab as Tab : 'app'));
</script>

<Dialog open={true} onclose={() => onclose(null)} id="help-dialog" aria-label="help">
  <div class="help-tabs" role="tablist">
    {#each tabs as t}
      <button
        class="help-tab"
        class:active={activeTab === t}
        data-tab={t}
        role="tab"
        onclick={() => { activeTab = t; }}
      >{t}</button>
    {/each}
  </div>
  <div id="help-content">{contents[activeTab]}</div>
  {#snippet buttons()}
    <button type="button" onclick={() => onclose(null)}>close</button>
  {/snippet}
</Dialog>

<style>
  :global(#help-dialog) {
    max-width: min(680px, 90vw);
    max-height: 80vh;
    width: 100%;
    overflow: hidden;
  }

  :global(#help-dialog[open]) {
    display: flex;
    flex-direction: column;
  }

  .help-tabs {
    display: flex;
    gap: 6px;
    margin-bottom: var(--sp);
    flex-shrink: 0;
  }

  .help-tab {
    background: none;
    border: 1px solid transparent;
    color: var(--fg-dim);
    padding: 3px 10px;
  }

  .help-tab:hover {
    color: var(--fg);
  }

  .help-tab.active {
    border-color: var(--border);
    background: var(--btn-bg);
    color: var(--fg);
  }

  #help-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    line-height: 1.5;
    margin-bottom: var(--sp);
  }

</style>
