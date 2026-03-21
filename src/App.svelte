<script lang="ts">
  import { onMount } from 'svelte';
  import { setAppContext, type AppCtx } from './context';
  import Editor, { type EditorApi } from './components/editor/Editor.svelte';
  import { writePngMeta } from './png-meta';
  import { b64encode, b64decode, stateSearch } from './utils';
  import { openHelpDialog } from './components/dialogs';
  import { BUILT_IN_PRESETS } from './presets';
  import type { PreviewApi } from './components/Preview.svelte';
  import Preview from './components/Preview.svelte';
  import SeedRow from './components/SeedRow.svelte';
  import PresetsRow from './components/PresetsRow.svelte';
  import FileInput from './components/FileInput.svelte';
  import Field from './components/base/Field.svelte';

  // ── Global state ─────────────────────────────────────────────────────────────

  const _initParams = new URLSearchParams(location.search);
  const initialSeed =
    _initParams.get('seed') ?? String(Math.floor(Math.random() * 0x100000000) >>> 0);
  const initialScript = _initParams.has('script')
    ? b64decode(_initParams.get('script')!)
    : BUILT_IN_PRESETS[0].code;

  let state = $state({ seed: initialSeed, script: initialScript });

  // Preview API registered via onready
  let preview: PreviewApi | null = null;
  let editorApi: EditorApi | null = null;

  // ── Context methods ───────────────────────────────────────────────────────────

  function setScript(code: string): void {
    state.script = code;
    editorApi?.setScript(code);
  }

  function pushHistory(): void {
    history.pushState(null, '', stateSearch(state.seed, state.script));
  }

  const ctx: AppCtx = {
    state,
    setScript,
    pushHistory,
    loadImage: (blob) => preview?.loadImage(blob) ?? Promise.resolve(),
    runImage: (immediate?) => preview?.runImage(immediate) ?? Promise.resolve(),
    showError: (msg, immediate?) => preview?.showError(msg, immediate),
    async download() {
      const blobs = await preview?.getBlobs();
      if (!blobs) return;
      const enriched = await writePngMeta(
        blobs.output,
        state.seed,
        b64encode(state.script),
        blobs.orig
      );
      const url = URL.createObjectURL(enriched);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'glitchbuf.png';
      a.click();
      URL.revokeObjectURL(url);
    },
  };

  setAppContext(ctx);

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  onMount(() => {
    const onPopstate = () => {
      const params = new URLSearchParams(location.search);
      const seed = params.get('seed');
      const script = params.get('script');
      if (seed !== null) state.seed = seed;
      if (script !== null) {
        const decoded = b64decode(script);
        state.script = decoded;
        editorApi?.setScript(decoded);
      }
      preview?.runImage(true);
    };

    window.addEventListener('popstate', onPopstate);
    return () => window.removeEventListener('popstate', onPopstate);
  });
</script>

<div id="controls">
  <div class="file-seed-row">
    <FileInput />
    <SeedRow />
  </div>
  <PresetsRow />
  <Field label="script" for="editor" class="script-field">
    <div class="textarea-wrap">
      <Editor
        script={state.script}
        onchange={(s) => {
          state.script = s;
        }}
        oncommit={ctx.pushHistory}
        onready={(api) => {
          editorApi = api;
        }}
      />
    </div>
  </Field>
  <div class="bottom-bar">
    <button type="button" onclick={() => openHelpDialog()}>help</button>
    <button type="button" onclick={() => ctx.download()}>download png</button>
  </div>
  <Preview
    seed={state.seed}
    script={state.script}
    onready={(api) => {
      preview = api;
    }}
  />
</div>

<style>
  /* .script-field and .textarea-wrap are on/inside Field's element, needs :global() */
  :global(.script-field) {
    flex: 1;
    min-height: 0;
  }

  @media (max-width: 768px) {
    :global(.script-field) {
      order: 2;
    }
    .bottom-bar {
      order: 3;
    }
  }

  .textarea-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
  }

  .bottom-bar {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .bottom-bar :first-child {
    margin-right: auto;
  }
</style>
