<script module lang="ts">
  // module-level — survives component unmount, so the tab is remembered across opens
  let lastTab: 'app' | 'language' | 'effects' = 'app';
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import Dialog from '../base/Dialog.svelte';
  import HELP_MD from '../../../HELP.md';
  import GLITCHSP_MD from '../../../GLITCHSP.md';
  import EFFECTS_MD from '../../../EFFECTS.md';

  const tabs = ['app', 'language', 'effects'] as const;
  type Tab = (typeof tabs)[number];
  const contents: Record<Tab, string> = {
    app: HELP_MD,
    language: GLITCHSP_MD,
    effects: EFFECTS_MD,
  };

  let { tab = '', onclose }: { tab?: string; onclose: (result: null) => void } = $props();

  // tab is only meaningful at creation time (dialog is mounted fresh each call)
  let activeTab = $state<Tab>(untrack(() => (tab && tab in contents ? (tab as Tab) : lastTab)));
  $effect(() => {
    lastTab = activeTab;
  });

  const fileToTab: Record<string, Tab> = {
    'HELP.md': 'app',
    'GLITCHSP.md': 'language',
    'EFFECTS.md': 'effects',
  };

  function interceptLinks(node: HTMLElement) {
    function handleClick(e: MouseEvent): void {
      const a = (e.target as Element).closest('a');
      if (!a) return;
      const href = a.getAttribute('href');
      const target = href ? fileToTab[href] : undefined;
      if (target) {
        e.preventDefault();
        activeTab = target;
      }
    }
    node.addEventListener('click', handleClick);
    return {
      destroy() {
        node.removeEventListener('click', handleClick);
      },
    };
  }
</script>

<Dialog open={true} onclose={() => onclose(null)} id="help-dialog" aria-label="help">
  <div class="help-tabs" role="tablist">
    {#each tabs as t (t)}
      <button
        class="help-tab"
        class:active={activeTab === t}
        data-tab={t}
        role="tab"
        onclick={() => {
          activeTab = t;
        }}>{t}</button
      >
    {/each}
  </div>
  <div id="help-content" use:interceptLinks>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- content is static markdown bundled at build time -->
    {@html contents[activeTab]}
  </div>
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
    overflow-wrap: break-word;
    line-height: 1.6;
    margin-bottom: var(--sp);
  }

  #help-content :global(h1) {
    font-size: 1em;
    font-weight: bold;
    margin: 0 0 1em;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.4em;
  }

  #help-content :global(h2) {
    font-size: 1em;
    font-weight: bold;
    margin: 1.4em 0 0.4em;
    color: var(--fg);
  }

  #help-content :global(h3) {
    font-size: var(--label-size);
    font-weight: bold;
    margin: 1.6em 0 0.3em;
    color: var(--fg-dim);
  }

  #help-content :global(p) {
    margin: 0 0 0.7em;
  }

  #help-content :global(ul),
  #help-content :global(ol) {
    margin: 0 0 0.7em;
    padding-left: 1.4em;
  }

  #help-content :global(li) {
    margin-bottom: 0.2em;
  }

  #help-content :global(code) {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 2px;
    padding: 0 3px;
    font-family: var(--font);
    font-size: 0.9em;
  }

  #help-content :global(pre) {
    background: var(--bg);
    border: 1px solid var(--border);
    padding: 8px 10px;
    overflow-x: auto;
    margin: 0 0 0.8em;
    line-height: 1.5;
  }

  #help-content :global(pre code) {
    background: none;
    border: none;
    padding: 0;
    font-size: inherit;
  }

  #help-content :global(hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin: 1.2em 0;
  }

  #help-content :global(strong) {
    font-weight: bold;
    color: var(--fg);
  }
</style>
