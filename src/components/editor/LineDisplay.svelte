<script lang="ts">
  import { tokenizeForDisplay, findParamAtOffset, sLog, sExp, ParamType } from '../../editor';

  let {
    block,
    onenteredit,
    oneffectclick,
    onblockchange,
  }: {
    block: string;
    onenteredit: (point?: { x: number; y: number }) => void;
    oneffectclick: (name: string, offset: number) => void;
    onblockchange: (newBlock: string, commit: boolean) => void;
  } = $props();

  const toks = $derived(tokenizeForDisplay(block));

  let pendingEffectClick: { name: string; offset: number } | null = null;

  // on touch, tapping this element gives it focus even when preventDefault() is
  // called on pointerdown — browser behaviour is inconsistent. we track pointer
  // state so handleFocus can tell whether it fired as a side effect of a tap
  // (in which case the tap handler is already doing the right thing) vs. a
  // genuine keyboard-nav focus (in which case we should enter edit mode).
  // we use both a boolean AND a timestamp because focus can arrive before OR
  // after pointerup depending on the browser, so pointerDown alone isn't enough.
  let pointerDown = false;
  let lastPointerDownAt = -Infinity;

  function startScrub(e: PointerEvent, spanEl: HTMLElement): void {
    const origText = spanEl.textContent!;
    const origVal = parseFloat(origText);
    if (isNaN(origVal)) return;

    const offset = parseInt(spanEl.dataset.offset!);
    const origLen = parseInt(spanEl.dataset.origLen!);
    const blockBefore = block.slice(0, offset);
    const blockAfter = block.slice(offset + origLen);

    const param = findParamAtOffset(block, offset);
    const isLog = param?.type === ParamType.log;
    const step = param?.step;
    const abs = Math.abs(origVal);
    const scale = abs >= 100 ? 1 : abs >= 1 ? 0.1 : 0.01;
    const logScale = isLog ? (sLog(param!.max) - sLog(param!.min)) / 768 : 0;
    const decimals =
      step !== undefined
        ? (String(step).split('.')[1] ?? '').length
        : (origText.split('.')[1] ?? '').length;

    const startX = e.clientX;
    let moved = false;
    let lastBlock = block;

    spanEl.setPointerCapture(e.pointerId);

    function onMove(me: PointerEvent) {
      if (Math.abs(me.clientX - startX) > 3) moved = true;
      if (!moved) return;
      let v: number;
      if (isLog) {
        v = sExp(sLog(origVal) + (me.clientX - startX) * logScale);
        v = Math.max(param!.min, Math.min(param!.max, v));
        v = parseFloat(v.toPrecision(3));
      } else {
        v = origVal + (me.clientX - startX) * scale;
        if (step !== undefined) v = Math.round(v / step) * step;
        if (param) v = Math.max(param.min, Math.min(param.max, v));
        v = decimals === 0 ? Math.round(v) : parseFloat(v.toFixed(decimals));
      }
      const newStr = String(v);
      spanEl.textContent = newStr;
      lastBlock = blockBefore + newStr + blockAfter;
      onblockchange(lastBlock, false);
    }

    function cleanup() {
      spanEl.removeEventListener('pointermove', onMove);
      spanEl.removeEventListener('pointerup', onUp);
      spanEl.removeEventListener('pointercancel', onCancel);
    }

    function onUp() {
      cleanup();
      if (!moved) {
        onenteredit(); // tap with no drag → enter edit mode
      } else {
        onblockchange(lastBlock, true);
      }
    }

    // pointercancel fires when the browser takes over the gesture (e.g. scroll).
    // commit whatever was scrubbed so far rather than discarding the change.
    function onCancel() {
      cleanup();
      if (moved) onblockchange(lastBlock, true);
    }

    spanEl.addEventListener('pointermove', onMove);
    spanEl.addEventListener('pointerup', onUp);
    spanEl.addEventListener('pointercancel', onCancel);
  }

  function handlePointerDown(e: PointerEvent) {
    pointerDown = true;
    lastPointerDownAt = Date.now();
    const target = e.target as HTMLElement;

    if (target.classList.contains('tok-num')) {
      e.preventDefault();
      startScrub(e, target);
      return;
    }

    if (target.classList.contains('tok-effect')) {
      e.preventDefault();
      // explicit capture so pointerup fires on this element even if the finger
      // drifts slightly — without it a tiny movement can lose the event
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      pendingEffectClick = {
        name: target.textContent!.toLowerCase(),
        offset: parseInt(target.dataset.offset!),
      };
      return;
    }

    e.preventDefault();
    onenteredit({ x: e.clientX, y: e.clientY });
  }

  function handlePointerUp() {
    pointerDown = false;
    if (pendingEffectClick !== null) {
      const { name, offset } = pendingEffectClick;
      pendingEffectClick = null;
      oneffectclick(name, offset);
    }
  }

  function handlePointerCancel() {
    pointerDown = false;
    pendingEffectClick = null;
  }

  function handleFocus() {
    // ignore focus that arrives as a side effect of a pointer gesture — we
    // don't want to enter edit mode when the user is tapping an effect badge
    // or number. the 300ms window covers both orderings: focus-before-pointerup
    // (pointerDown is still true) and focus-after-pointerup (lastPointerDownAt
    // is recent). for keyboard nav / programmatic focusLine() calls there is no
    // recent pointerdown so we fall through and enter edit mode as expected.
    if (pointerDown || Date.now() - lastPointerDownAt < 300) return;
    onenteredit();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Tab') return;
    if (e.key === 'Enter' || (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1)) {
      e.preventDefault();
      onenteredit();
    }
  }
</script>

<div
  class="line-display"
  tabindex="0"
  role="textbox"
  aria-multiline="true"
  onpointerdown={handlePointerDown}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerCancel}
  onkeydown={handleKeyDown}
  onfocus={handleFocus}
>
  {#if !block.trim()}
    &#x200b;
  {:else}
    {#each toks as tok (tok.offset)}
      {#if tok.type === 'plain'}
        {tok.text}
      {:else if tok.type === 'num'}
        <span class="tok-num" data-offset={tok.offset} data-orig-len={tok.text.length}
          >{tok.text}</span
        >
      {:else if tok.type === 'effect'}
        <span class="tok-effect" data-offset={tok.offset}>{tok.text}</span>
      {:else}
        <span class={`tok-${tok.type}`}>{tok.text}</span>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .line-display {
    white-space: pre-wrap;
    word-break: break-all;
    min-height: 1.5em;
    outline: none;
    cursor: text;
  }

  .tok-effect {
    cursor: pointer;
    border-bottom: 1px dotted var(--fg-dim);
  }

  .tok-effect:hover {
    border-bottom-color: var(--fg);
  }

  .tok-num {
    cursor: ew-resize;
    color: #8ab4d4;
  }

  .tok-num:hover {
    color: var(--accent);
  }

  .tok-paren {
    color: var(--fg-dim);
  }

  .tok-comment {
    color: var(--fg-dim);
    font-style: italic;
  }
</style>
