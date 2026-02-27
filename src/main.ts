/// <reference path="glitchsp.ts" />

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
    const image = new GlitchBuffer(originalBuffer.slice(), rand);
    await runGlitchsp(codeArea.value, image, rand);
    const rgba = glitchToRgba(image.data, imgWidth, imgHeight);
    ctx.putImageData(new ImageData(rgba, imgWidth, imgHeight), 0, 0);
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
    };
    img.src = reader.result as string;
  };
  reader.readAsDataURL(file);
});

runBtn.addEventListener('click', () => runImage(true));

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
