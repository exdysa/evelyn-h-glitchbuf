<script lang="ts">
  import { onMount } from 'svelte';
  import { OPS, OP_MAP, OpKind } from '../../ops';
  import type { OpDef } from '../../ops';
  import { parseBlock } from '../../glitchsp';
  import type { ParseNode } from '../../glitchsp';
  import Dialog from '../base/Dialog.svelte';
  import ParamRow from './ParamRow.svelte';
  import type { EffectModalApi, EffectModalOpts } from './types';

  let { onready }: { onready: (api: EffectModalApi) => void } = $props();

  // ── State ─────────────────────────────────────────────────────────────────

  let isOpen = $state(false);
  let opts: EffectModalOpts | null = $state(null);
  let selectedOpName = $state('');
  let paramValues: (string | null)[] = $state([]);

  // ── Op lists ──────────────────────────────────────────────────────────────

  const ADD_KIND_ORDER: OpKind[] = [
    OpKind.byte,
    OpKind.buffer,
    OpKind.image,
    OpKind.audio,
    OpKind.filter,
  ];
  const addOps = OPS.filter((op) => op.invoke && op.kind !== OpKind.wrap);
  const addOpsByKind = ADD_KIND_ORDER.map((kind) => ({
    kind,
    ops: addOps.filter((op) => op.kind === kind),
  })).filter((g) => g.ops.length > 0);
  const wrapOps = OPS.filter((op) => op.kind === OpKind.wrap);

  // ── Derived current meta ──────────────────────────────────────────────────

  const currentMeta = $derived.by((): OpDef | null => {
    if (!opts) return null;
    if (opts.kind === 'edit') return opts.meta;
    return OP_MAP.get(selectedOpName) ?? null;
  });

  // For 'edit': parse currentText once into argNodes, isParenForm, bodyParts.
  const editParsed = $derived.by(() => {
    if (opts?.kind !== 'edit') return null;
    try {
      const ast = parseBlock(opts.currentText);
      if (ast.kind !== 'list')
        return {
          argNodes: [] as (ParseNode | undefined)[],
          isParenForm: false,
          bodyParts: [] as string[],
        };
      const meta = opts.meta;
      const argNodes = ast.children.slice(1, 1 + meta.params.length) as (ParseNode | undefined)[];
      const bodyNodes = !meta.invoke ? ast.children.slice(1 + meta.params.length) : [];
      const bodyParts = bodyNodes.map((n: ParseNode) =>
        opts.currentText.slice(n.span.start, n.span.end)
      );
      return { argNodes, isParenForm: !ast.bare, bodyParts };
    } catch {
      return {
        argNodes: [] as (ParseNode | undefined)[],
        isParenForm: true,
        bodyParts: [] as string[],
      };
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function trimArgs(args: (string | null)[]): string[] {
    if (!currentMeta) return [];
    let last = args.length;
    while (last > 0 && args[last - 1] === null) last--;
    // substitute defaults for intermediate nulls so later optional params
    // don't get misinterpreted as earlier ones
    return args.slice(0, last).map((a, i) => a ?? String(currentMeta!.params[i].default));
  }

  function buildResult(): string | null {
    if (!opts || !currentMeta) return null;
    const args = trimArgs(paramValues);

    if (opts.kind === 'edit') {
      const { isParenForm, bodyParts } = editParsed ?? {
        isParenForm: true,
        bodyParts: [],
      };
      const inner = [currentMeta.name, ...args, ...bodyParts].join(' ');
      return (isParenForm ? `(${inner})` : inner).trimEnd();
    }

    if (opts.kind === 'add') {
      return [currentMeta.name, ...args].join(' ').trimEnd();
    }

    if (opts.kind === 'wrap') {
      let bodyText: string;
      try {
        const ast = parseBlock(opts.original);
        bodyText = ast.kind === 'list' && !ast.bare ? opts.original : `(${opts.original})`;
      } catch {
        bodyText = `(${opts.original})`;
      }
      return `(${[currentMeta.name, ...args, bodyText].join(' ')})`;
    }

    return null;
  }

  function maybeLivePreview() {
    if (opts?.kind !== 'edit' || !opts.onLivePreview) return;
    const result = buildResult();
    if (result !== null) opts.onLivePreview(result);
  }

  function apply() {
    const result = buildResult();
    if (result === null || !opts) return;
    opts.onApply(result);
    close();
  }

  // timestamp of the last open() call, used to ignore the synthetic click that
  // touch browsers fire ~0–300ms after pointerup. without this guard, tapping
  // an effect badge opens the modal and the same tap's click event immediately
  // closes it again (the dialog is modal so it receives the click).
  let openTime = 0;

  function close() {
    isOpen = false;
    opts = null;
  }

  // ── Open ──────────────────────────────────────────────────────────────────

  function open(newOpts: EffectModalOpts) {
    opts = newOpts;
    if (newOpts.kind === 'add') selectedOpName = addOps[0]?.name ?? '';
    else if (newOpts.kind === 'wrap') selectedOpName = wrapOps[0]?.name ?? '';
    paramValues = (currentMeta?.params ?? []).map(() => null);
    isOpen = true;
    openTime = Date.now();
  }

  function onSelectChange() {
    paramValues = (OP_MAP.get(selectedOpName)?.params ?? []).map(() => null);
  }

  const applyLabel = $derived(
    opts?.kind === 'add' ? 'add' : opts?.kind === 'wrap' ? 'wrap' : 'apply'
  );

  // hide apply only when editing a 0-param effect (just an info popup)
  const showApply = $derived(opts?.kind !== 'edit' || (currentMeta?.params.length ?? 0) > 0);

  onMount(() => {
    onready({ open });
  });
</script>

<Dialog
  open={isOpen}
  onclose={close}
  class="effect-modal"
  onclick={(e: MouseEvent) => {
    // close on click in the dialog padding (backdrop). the 500ms guard rejects
    // the synthetic click that arrives from the tap that opened the modal.
    if (e.target === e.currentTarget && Date.now() - openTime > 500) close();
  }}
>
  {#if opts && currentMeta}
    {#if opts.kind === 'edit'}
      <p class="effect-name">{currentMeta.name}</p>
      <p class="effect-desc">{currentMeta.desc}</p>
    {:else}
      <div class="select-row">
        <label for="effect-modal-select">{opts.kind === 'wrap' ? 'wrap with' : 'effect'}</label>
        <select id="effect-modal-select" bind:value={selectedOpName} onchange={onSelectChange}>
          {#if opts.kind === 'add'}
            {#each addOpsByKind as group (group.kind)}
              <optgroup label={group.kind}>
                {#each group.ops as op (op.name)}
                  <option value={op.name}>{op.name}</option>
                {/each}
              </optgroup>
            {/each}
          {:else}
            {#each wrapOps as op (op.name)}
              <option value={op.name}>{op.name}</option>
            {/each}
          {/if}
        </select>
      </div>
      <p class="effect-desc">{currentMeta.desc}</p>
    {/if}

    {#each currentMeta.params as param, i (currentMeta.name + i)}
      {@const argNode = editParsed?.argNodes[i]}
      {@const startDisabled = !!param.optional && (!editParsed || i >= editParsed.argNodes.length)}
      <ParamRow
        {param}
        {argNode}
        currentText={opts.kind === 'edit' ? opts.currentText : undefined}
        {startDisabled}
        onchange={(v) => {
          paramValues[i] = v;
          maybeLivePreview();
        }}
      />
    {/each}
  {/if}
  {#snippet buttons()}
    {#if showApply}
      <button type="button" onclick={apply}>{applyLabel}</button>
    {/if}
    <button type="button" onclick={close}>cancel</button>
  {/snippet}
</Dialog>

<style>
  :global(.effect-modal) {
    width: 380px;
    max-width: 90vw;
  }

  .effect-name {
    font-weight: bold;
    margin: 0 0 4px;
  }

  .effect-desc {
    color: var(--fg-dim);
    margin: 0 0 16px;
    white-space: pre-line;
    font-size: var(--label-size);
  }

  .select-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .select-row label {
    font-size: var(--label-size);
    color: var(--fg-dim);
    white-space: nowrap;
  }

  .select-row select {
    flex: 1;
  }
</style>
