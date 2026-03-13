/// <reference path="editor.ts" />

declare const HELP_MD: string;
declare const GLITCHSP_MD: string;
declare const EFFECTS_MD: string;

let originalBuffer: Uint8Array | null = null;
let imgWidth = 0;
let imgHeight = 0;
let runTimer: number | null = null;

const fileInput = document.getElementById('file') as HTMLInputElement;
const downloadBtn = document.getElementById('download') as HTMLButtonElement;
const seedInput = document.getElementById('seed') as HTMLInputElement;
const newSeedBtn = document.getElementById('new-seed') as HTMLButtonElement;
const errorPre = document.getElementById('error') as HTMLPreElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const loadingEl = document.getElementById('loading') as HTMLDivElement;
const canvasPaneEl = document.getElementById('canvas-pane') as HTMLDivElement;
const presetsSelect = document.getElementById('presets') as HTMLSelectElement;
const savePresetBtn = document.getElementById('save-preset') as HTMLButtonElement;
const deletePresetBtn = document.getElementById('delete-preset') as HTMLButtonElement;
const modalEl = document.getElementById('modal') as HTMLDialogElement;
const modalMsg = document.getElementById('modal-msg') as HTMLParagraphElement;
const modalInput = document.getElementById('modal-input') as HTMLInputElement;
const modalOkBtn = document.getElementById('modal-ok') as HTMLButtonElement;
const modalCancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
const presetConfirmDialog = document.getElementById('preset-confirm-dialog') as HTMLDialogElement;
const presetConfirmNameInput = document.getElementById('preset-confirm-name') as HTMLInputElement;
const presetConfirmSaveBtn = document.getElementById('preset-confirm-save') as HTMLButtonElement;
const presetConfirmDiscardBtn = document.getElementById('preset-confirm-discard') as HTMLButtonElement;
const presetConfirmCancelBtn = document.getElementById('preset-confirm-cancel') as HTMLButtonElement;
const helpBtn = document.getElementById('help-btn') as HTMLButtonElement;
const helpDialog = document.getElementById('help-dialog') as HTMLDialogElement;
const helpContent = document.getElementById('help-content') as HTMLDivElement;
const helpCloseBtn = document.getElementById('help-close') as HTMLButtonElement;

function openModal(opts: { message: string; ok?: string; input?: boolean; initial?: string }): Promise<string | null> {
  return new Promise(resolve => {
    modalMsg.textContent = opts.message;
    modalOkBtn.textContent = opts.ok ?? 'ok';
    modalInput.hidden = !opts.input;
    if (opts.input) {
      modalInput.value = opts.initial ?? '';
    }
    modalEl.showModal();
    (opts.input ? modalInput : modalOkBtn).focus();

    function done(result: string | null) {
      modalOkBtn.removeEventListener('click', onOk);
      modalCancelBtn.removeEventListener('click', onCancel);
      modalInput.removeEventListener('keydown', onKeydown);
      modalEl.removeEventListener('close', onClose);
      if (modalEl.open) modalEl.close();
      resolve(result);
    }
    const onOk = () => done(opts.input ? modalInput.value : '');
    const onCancel = () => done(null);
    const onClose = () => done(null);
    const onKeydown = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); onOk(); } };
    modalOkBtn.addEventListener('click', onOk);
    modalCancelBtn.addEventListener('click', onCancel);
    modalEl.addEventListener('close', onClose, { once: true });
    if (opts.input) modalInput.addEventListener('keydown', onKeydown);
  });
}

// Sets CSS width/height only (contain-style scaling). Never touches canvas.width/canvas.height.
function fitCanvas(): void {
  if (!canvas.width || !canvas.height) return;
  const s = getComputedStyle(canvasPaneEl);
  const pw = canvasPaneEl.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
  const ph = canvasPaneEl.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom);
  const scale = Math.min(pw / canvas.width, ph / canvas.height);
  canvas.style.width = Math.round(canvas.width * scale) + 'px';
  canvas.style.height = Math.round(canvas.height * scale) + 'px';
}

new ResizeObserver(fitCanvas).observe(canvasPaneEl);

function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000);
}

function b64encode(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}
function b64decode(s: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0)));
}

function updateUrl(): void {
  const params = new URLSearchParams({ seed: seedInput.value, script: b64encode(getScript()) });
  history.replaceState(null, '', '?' + params.toString());
}

// Initialise editor before reading URL params so setScript works immediately.
initEditor(document.getElementById('editor')!, () => {
  // Reset preset select when user edits the script so the same preset can be re-selected.
  if (presetsSelect.value) {
    presetsSelect.value = '';
    currentSelectValue = '';
    deletePresetBtn.disabled = true;
  }
  scheduleRun();
}, showHelpTab);

const _initParams = new URLSearchParams(location.search);
seedInput.value = _initParams.get('seed') ?? String(randomSeed());
if (_initParams.has('script')) {
  setScript(b64decode(_initParams.get('script')!));
} else {
  setScript('bitcrush 4\nnoise -24');
}

let errorTimer: number | null = null;

function showError(msg: string, immediate: boolean): void {
  if (errorTimer !== null) { clearTimeout(errorTimer); errorTimer = null; }
  if (immediate) {
    errorPre.textContent = msg;
  } else {
    errorTimer = window.setTimeout(() => { errorPre.textContent = msg; errorTimer = null; }, 600);
  }
}

async function runImage(immediate = false): Promise<void> {
  updateUrl();
  if (!originalBuffer) return;
  loadingEl.classList.add('visible');
  try {
    const seed = parseInt(seedInput.value, 10) >>> 0;
    const rand = mulberry32(seed);
    const image = new GlitchBuffer(originalBuffer.slice(), imgWidth, imgHeight, rand);
    await runGlitchsp(getScript(), image, rand);
    const rgba = glitchToRgba(image.data, image.width, image.height);
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.putImageData(new ImageData(rgba, image.width, image.height), 0, 0);
    canvasPaneEl.classList.add('has-image');
    fitCanvas();
    if (errorTimer !== null) { clearTimeout(errorTimer); errorTimer = null; }
    errorPre.textContent = '';
  } catch (e) {
    showError(String(e), immediate);
    // canvas intentionally left unchanged
  } finally {
    loadingEl.classList.remove('visible');
  }
}

function scheduleRun(): void {
  if (runTimer !== null) clearTimeout(runTimer);
  runTimer = window.setTimeout(() => {
    runTimer = null;
    try { parse(getScript()); } catch (e) { showError(String(e), false); return; }
    runImage();
  }, 300);
}

newSeedBtn.addEventListener('click', () => {
  seedInput.value = String(randomSeed());
  runImage();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      imgWidth = img.naturalWidth;
      imgHeight = img.naturalHeight;
      canvas.width = imgWidth;
      canvas.height = imgHeight;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, imgWidth, imgHeight);
      originalBuffer = rgbaToGlitch(imageData.data, imgWidth, imgHeight);
      errorPre.textContent = '';
      runImage(true);
    };
    img.src = reader.result as string;
  };
  reader.readAsDataURL(file);
});

// Track the code that was last intentionally loaded so we can detect edits.
// If the page loaded with a URL script, use '' so selecting a preset always prompts.
let lastLoadedCode = _initParams.has('script') ? '' : getScript();
// Track the select's committed value so we can restore it on cancel.
let currentSelectValue = '';

buildPresetSelect(presetsSelect);
currentSelectValue = presetsSelect.value;
deletePresetBtn.disabled = !presetsSelect.value.startsWith('user:');

function openPresetConfirmModal(): Promise<'save' | 'discard' | null> {
  return new Promise(resolve => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    presetConfirmNameInput.value =
      `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    presetConfirmDialog.showModal();
    presetConfirmSaveBtn.focus();

    function done(result: 'save' | 'discard' | null) {
      presetConfirmSaveBtn.removeEventListener('click', onSave);
      presetConfirmDiscardBtn.removeEventListener('click', onDiscard);
      presetConfirmCancelBtn.removeEventListener('click', onCancel);
      presetConfirmDialog.removeEventListener('close', onClose);
      if (presetConfirmDialog.open) presetConfirmDialog.close();
      resolve(result);
    }
    const onSave = () => done('save');
    const onDiscard = () => done('discard');
    const onCancel = () => done(null);
    const onClose = () => done(null);
    presetConfirmSaveBtn.addEventListener('click', onSave);
    presetConfirmDiscardBtn.addEventListener('click', onDiscard);
    presetConfirmCancelBtn.addEventListener('click', onCancel);
    presetConfirmDialog.addEventListener('close', onClose, { once: true });
  });
}

function saveCurrentAsPreset(name: string, selectAfter?: string): void {
  const userPresets = loadUserPresets();
  const existing = userPresets.findIndex(p => p.name === name);
  if (existing >= 0) userPresets[existing].code = getScript();
  else userPresets.push({ name, code: getScript() });
  saveUserPresets(userPresets);
  buildPresetSelect(presetsSelect, selectAfter);
}

presetsSelect.addEventListener('change', async () => {
  const val = presetsSelect.value;
  if (!val) {
    deletePresetBtn.disabled = true;
    return;
  }

  if (getScript() !== lastLoadedCode) {
    const result = await openPresetConfirmModal();
    if (result === null) {
      presetsSelect.value = currentSelectValue;
      return;
    }
    if (result === 'save') {
      const name = presetConfirmNameInput.value.trim();
      if (name) saveCurrentAsPreset(name, val);
    }
  }

  let code: string | undefined;
  if (val.startsWith('builtin:')) {
    const name = val.slice('builtin:'.length);
    code = BUILT_IN_PRESETS.find(p => p.name === name)?.code;
    deletePresetBtn.disabled = true;
  } else if (val.startsWith('user:')) {
    const name = val.slice('user:'.length);
    code = loadUserPresets().find(p => p.name === name)?.code;
    deletePresetBtn.disabled = false;
  }
  if (code !== undefined) {
    history.pushState(null, '', location.href);
    setScript(code);
    lastLoadedCode = getScript();
    currentSelectValue = val;
    scheduleRun();
  }
});

savePresetBtn.addEventListener('click', async () => {
  const name = await openModal({ message: 'preset name:', ok: 'save', input: true });
  if (!name) return;
  const savedVal = 'user:' + name;
  saveCurrentAsPreset(name, savedVal);
  lastLoadedCode = getScript();
  currentSelectValue = savedVal;
  deletePresetBtn.disabled = false;
});

deletePresetBtn.addEventListener('click', async () => {
  const val = presetsSelect.value;
  if (!val.startsWith('user:')) return;
  const name = val.slice('user:'.length);
  const ok = await openModal({ message: `delete preset "${name}"?`, ok: 'delete' });
  if (ok === null) return;
  const userPresets = loadUserPresets().filter(p => p.name !== name);
  saveUserPresets(userPresets);
  buildPresetSelect(presetsSelect);
  currentSelectValue = '';
  deletePresetBtn.disabled = true;
});

downloadBtn.addEventListener('click', () => {
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'glitchbuf.png';
    a.click();
    URL.revokeObjectURL(url);
  });
});

const helpTabContents: Record<string, string> = { app: HELP_MD, language: GLITCHSP_MD, effects: EFFECTS_MD };
let activeHelpTab = 'app';

function showHelpTab(tab: string): void {
  activeHelpTab = tab;
  helpContent.textContent = helpTabContents[tab];
  helpContent.scrollTop = 0;
  document.querySelectorAll<HTMLElement>('.help-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

helpBtn.addEventListener('click', () => {
  showHelpTab(activeHelpTab);
  helpDialog.showModal();
});
document.querySelectorAll<HTMLElement>('.help-tab').forEach(btn => {
  btn.addEventListener('click', () => showHelpTab(btn.dataset.tab!));
});
helpCloseBtn.addEventListener('click', () => helpDialog.close());
helpDialog.addEventListener('click', e => {
  if (e.target === helpDialog) helpDialog.close();
});

window.addEventListener('popstate', () => {
  const params = new URLSearchParams(location.search);
  const seed = params.get('seed');
  const script = params.get('script');
  if (seed !== null) seedInput.value = seed;
  if (script !== null) {
    setScript(b64decode(script));
    lastLoadedCode = getScript();
    presetsSelect.value = '';
    currentSelectValue = '';
    deletePresetBtn.disabled = true;
  }
  if (originalBuffer) runImage(true);
});
