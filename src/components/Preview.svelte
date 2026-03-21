<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { mulberry32, parse, runGlitchsp } from '../glitchsp';
  import { GlitchBuffer, rgbaToGlitch, glitchToRgba } from '../effects';
  import { stateSearch } from '../utils';

  export interface PreviewApi {
    loadImage(blob: Blob): Promise<void>;
    runImage(immediate?: boolean): Promise<void>;
    showError(msg: string, immediate?: boolean): void;
    getBlobs(): Promise<{ output: Blob; orig: Blob } | null>;
  }

  let {
    seed,
    script,
    onready,
  }: {
    seed: string;
    script: string;
    onready?: (api: PreviewApi) => void;
  } = $props();

  let originalBuffer: Uint8Array | null = null;
  let imgWidth = 0;
  let imgHeight = 0;
  let runTimer: number | null = null;
  let errorTimer: number | null = null;
  let renderGen = 0;

  let hasImage = $state(false);
  let loading = $state(false);
  let errorText = $state('');

  let paneEl: HTMLDivElement;
  let canvasEl: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;

  function fitCanvas(): void {
    if (!canvasEl.width || !canvasEl.height) return;
    const s = getComputedStyle(paneEl);
    const pw = paneEl.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
    const ph = paneEl.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom);
    const scale = Math.min(pw / canvasEl.width, ph / canvasEl.height);
    canvasEl.style.width = Math.round(canvasEl.width * scale) + 'px';
    canvasEl.style.height = Math.round(canvasEl.height * scale) + 'px';
  }

  function showErrorImpl(msg: string, immediate = true): void {
    if (errorTimer !== null) {
      clearTimeout(errorTimer);
      errorTimer = null;
    }
    if (immediate) {
      errorText = msg;
    } else {
      errorTimer = window.setTimeout(() => {
        errorText = msg;
        errorTimer = null;
      }, 600);
    }
  }

  async function runImageImpl(immediate = false): Promise<void> {
    if (runTimer !== null) {
      clearTimeout(runTimer);
      runTimer = null;
    }
    const gen = ++renderGen;
    if (!originalBuffer) return;
    loading = true;
    // tick() flushes svelte's pending DOM writes so the loading overlay is actually in the DOM.
    // then we need to wait for the browser to paint it — rAF fires at the *start* of a frame
    // (before painting), so a single rAF isn't enough. the double-rAF pattern works because
    // the first rAF queues a paint, and the second fires only after that paint has completed.
    // without this, the main thread gets locked by the render work before the overlay ever shows.
    await tick();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // Capture prop values after flush so we render a consistent snapshot.
    // Also bail if a newer render has already started.
    if (gen !== renderGen) {
      loading = false;
      return;
    }
    const renderSeed = seed;
    const renderScript = script;
    try {
      const seedNum = parseInt(renderSeed, 10) >>> 0;
      const rand = mulberry32(seedNum);
      const image = new GlitchBuffer(originalBuffer.slice(), imgWidth, imgHeight, rand);
      await runGlitchsp(renderScript, image, rand);
      if (gen !== renderGen) return;
      const rgba = glitchToRgba(image.data, image.width, image.height);
      canvasEl.width = image.width;
      canvasEl.height = image.height;
      ctx.putImageData(new ImageData(rgba, image.width, image.height), 0, 0);
      hasImage = true;
      fitCanvas();
      if (errorTimer !== null) {
        clearTimeout(errorTimer);
        errorTimer = null;
      }
      errorText = '';
      history.replaceState(null, '', stateSearch(renderSeed, renderScript));
    } catch (e) {
      if (gen !== renderGen) return;
      showErrorImpl(String(e), immediate);
    } finally {
      if (gen === renderGen) loading = false;
    }
  }

  async function loadImageFromBlob(blob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        imgWidth = img.naturalWidth;
        imgHeight = img.naturalHeight;
        canvasEl.width = imgWidth;
        canvasEl.height = imgHeight;
        ctx.drawImage(img, 0, 0);
        originalBuffer = rgbaToGlitch(
          ctx.getImageData(0, 0, imgWidth, imgHeight).data,
          imgWidth,
          imgHeight
        );
        URL.revokeObjectURL(url);
        fitCanvas();
        resolve();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('failed to load image'));
      };
      img.src = url;
    });
  }

  function originalToPngBlob(): Promise<Blob> {
    const rgba = glitchToRgba(originalBuffer!, imgWidth, imgHeight);
    const off = new OffscreenCanvas(imgWidth, imgHeight);
    off.getContext('2d')!.putImageData(new ImageData(rgba, imgWidth, imgHeight), 0, 0);
    return off.convertToBlob({ type: 'image/png' });
  }

  // Re-run (debounced) when script changes
  $effect(() => {
    const s = script; // track
    if (!originalBuffer) return;
    if (runTimer !== null) {
      clearTimeout(runTimer);
      runTimer = null;
    }
    runTimer = window.setTimeout(() => {
      runTimer = null;
      try {
        parse(s);
      } catch (e) {
        showErrorImpl(String(e), false);
        return;
      }
      runImageImpl();
    }, 500);
  });

  onMount(() => {
    ctx = canvasEl.getContext('2d')!;
    const ro = new ResizeObserver(fitCanvas);
    ro.observe(paneEl);

    onready?.({
      loadImage: loadImageFromBlob,
      runImage: runImageImpl,
      showError: showErrorImpl,
      getBlobs: async () => {
        if (!originalBuffer) return null;
        const [output, orig] = await Promise.all([
          new Promise<Blob>((res) => canvasEl.toBlob((b) => res(b!))),
          originalToPngBlob(),
        ]);
        return { output, orig };
      },
    });

    return () => {
      ro.disconnect();
      if (runTimer !== null) clearTimeout(runTimer);
      if (errorTimer !== null) clearTimeout(errorTimer);
    };
  });
</script>

<div id="canvas-pane" class:has-image={hasImage} bind:this={paneEl}>
  <div id="no-image">no image loaded</div>
  <div id="canvas-wrap">
    <span id="preview-label">preview</span>
    <div id="canvas-frame">
      <canvas id="canvas" bind:this={canvasEl} aria-label="glitch effect preview"></canvas>
      <div id="loading" class:visible={loading} role="status" aria-live="polite">rendering…</div>
    </div>
  </div>
</div>
<pre id="error" role="alert">{errorText}</pre>

<style>
  #canvas-pane {
    grid-column: 2;
    grid-row: 1 / -1;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    padding: var(--sp);
    overflow: hidden;
    min-width: 0;
  }

  #canvas-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  #canvas-frame {
    position: relative;
  }

  #preview-label {
    font-size: var(--label-size);
    color: var(--fg-dim);
    display: none;
  }

  #canvas-pane.has-image #preview-label {
    display: block;
  }

  #no-image {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-dim);
    font-size: var(--label-size);
    position: absolute;
    inset: 0;
  }

  #canvas-pane.has-image #no-image {
    display: none;
  }

  #loading {
    display: none;
    position: absolute;
    inset: 0;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    color: var(--fg);
    z-index: 1;
  }

  #loading.visible {
    display: flex;
  }

  #canvas {
    display: block;
    image-rendering: pixelated;
  }

  #error {
    color: var(--error);
    margin: 0;
    white-space: pre-wrap;
  }

  @media (max-width: 768px) {
    #canvas-pane {
      grid-column: 1;
      grid-row: auto;
      order: 1;
      max-height: 50vh;
      min-height: 256px;
      padding-left: 0;
      padding-right: 0;
    }
  }
</style>
