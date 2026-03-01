/// <reference path="presets.ts" />

let originalBuffer: Uint8Array | null = null;
let imgWidth = 0;
let imgHeight = 0;

const fileInput = document.getElementById('file') as HTMLInputElement;
const codeArea = document.getElementById('code') as HTMLTextAreaElement;
const runBtn = document.getElementById('run') as HTMLButtonElement;
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

function fitCanvas(): void {
  if (!canvas.width || !canvas.height) return;
  const s = getComputedStyle(canvasPaneEl);
  const pw = canvasPaneEl.clientWidth  - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
  const ph = canvasPaneEl.clientHeight - parseFloat(s.paddingTop)  - parseFloat(s.paddingBottom);
  const scale = Math.min(pw / canvas.width, ph / canvas.height);
  canvas.style.width  = Math.round(canvas.width  * scale) + 'px';
  canvas.style.height = Math.round(canvas.height * scale) + 'px';
}

new ResizeObserver(fitCanvas).observe(canvasPaneEl);

function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000);
}

seedInput.value = String(randomSeed());

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
  if (!originalBuffer) return;
  loadingEl.classList.add('visible');
  try {
    const seed = parseInt(seedInput.value, 10) >>> 0;
    const rand = mulberry32(seed);
    const image = new GlitchBuffer(originalBuffer.slice(), imgWidth, imgHeight, rand);
    await runGlitchsp(codeArea.value, image, rand);
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

let runTimer: number | null = null;

codeArea.addEventListener('input', () => {
  if (runTimer !== null) clearTimeout(runTimer);
  runTimer = window.setTimeout(() => {
    runTimer = null;
    if (tryParse(codeArea.value)) runImage();
  }, 300);
});

codeArea.addEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === '/') {
    e.preventDefault();
    const val = codeArea.value;
    const selStart = codeArea.selectionStart;
    const selEnd = codeArea.selectionEnd;

    // Expand to full lines
    const lineStart = val.lastIndexOf('\n', selStart - 1) + 1;
    let adjustedEnd = selEnd;
    if (selEnd > selStart && val[selEnd - 1] === '\n') adjustedEnd--;
    const nextNl = val.indexOf('\n', adjustedEnd);
    const lineEnd = nextNl === -1 ? val.length : nextNl;

    const lines = val.slice(lineStart, lineEnd).split('\n');
    const allCommented = lines.every(l => /^#/.test(l));
    const newLines = lines.map(l => allCommented ? l.replace(/^#\s?/, '') : '# ' + l);
    const newBlock = newLines.join('\n');

    codeArea.value = val.slice(0, lineStart) + newBlock + val.slice(lineEnd);
    codeArea.selectionStart = selStart;
    codeArea.selectionEnd = selEnd + (newBlock.length - (lineEnd - lineStart));
    codeArea.dispatchEvent(new Event('input'));
  }
});

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

runBtn.addEventListener('click', () => runImage(true));

// Track the code that was last intentionally loaded so we can detect edits.
let lastLoadedCode = codeArea.value;
// Track the select's committed value so we can restore it on cancel.
let currentSelectValue = '';

buildPresetSelect(presetsSelect);

presetsSelect.addEventListener('change', async () => {
  const val = presetsSelect.value;
  if (!val) {
    deletePresetBtn.disabled = true;
    return;
  }

  if (codeArea.value !== lastLoadedCode) {
    const ok = await openModal({ message: 'Load preset and discard current changes?', ok: 'load preset' });
    if (ok === null) {
      presetsSelect.value = currentSelectValue;
      return;
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
    codeArea.value = code;
    lastLoadedCode = code;
    currentSelectValue = val;
    codeArea.dispatchEvent(new Event('input'));
  }
});

savePresetBtn.addEventListener('click', async () => {
  const name = await openModal({ message: 'Preset name:', ok: 'save', input: true });
  if (!name) return;
  const userPresets = loadUserPresets();
  const existing = userPresets.findIndex(p => p.name === name);
  if (existing >= 0) {
    userPresets[existing].code = codeArea.value;
  } else {
    userPresets.push({ name, code: codeArea.value });
  }
  saveUserPresets(userPresets);
  const savedVal = 'user:' + name;
  buildPresetSelect(presetsSelect, savedVal);
  lastLoadedCode = codeArea.value;
  currentSelectValue = savedVal;
  deletePresetBtn.disabled = false;
});

deletePresetBtn.addEventListener('click', async () => {
  const val = presetsSelect.value;
  if (!val.startsWith('user:')) return;
  const name = val.slice('user:'.length);
  const ok = await openModal({ message: `Delete preset "${name}"?`, ok: 'delete' });
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
