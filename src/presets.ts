/// <reference path="glitchsp.ts" />

interface Preset { name: string; code: string; }

const BUILT_IN_PRESETS: Preset[] = [
  {
    name: 'chromatic aberration', code: `\
transpose R 4 1
transpose B -4 -1
` },
  {
    name: 'bitcrush', code: `\
bitcrush 3
noise -20
` },
  {
    name: 'echo cascade', code: `\
repeat 3 (echo 20 -6)
` },
  {
    name: 'stride glitch', code: `\
stride 8 1 (do
  (bitcrush 3)
  (noise -28))
` },
  {
    name: 'channel warp', code: `\
channel R (echo 25 -6)
channel G (bitcrush 4)
channel B (reverb 20 0.7)
` },
  {
    name: 'solarize', code: `\
solarize 0.5
fold 1.2
` },
  {
    name: 'reverb wash', code: `\
reverb 25 0.75
noise -30
` },
];

function loadUserPresets(): Preset[] {
  try { return JSON.parse(localStorage.getItem('glitchbuf_presets') ?? '[]'); }
  catch { return []; }
}

function saveUserPresets(presets: Preset[]): void {
  localStorage.setItem('glitchbuf_presets', JSON.stringify(presets));
}

function buildPresetSelect(select: HTMLSelectElement, selectedName?: string): void {
  select.innerHTML = '<option value="">— select preset —</option>';

  const builtInGroup = document.createElement('optgroup');
  builtInGroup.label = 'built-in';
  for (const p of BUILT_IN_PRESETS) {
    const opt = document.createElement('option');
    opt.value = 'builtin:' + p.name;
    opt.textContent = p.name;
    builtInGroup.appendChild(opt);
  }
  select.appendChild(builtInGroup);

  const userPresets = loadUserPresets();
  if (userPresets.length > 0) {
    const userGroup = document.createElement('optgroup');
    userGroup.label = 'saved';
    for (const p of userPresets) {
      const opt = document.createElement('option');
      opt.value = 'user:' + p.name;
      opt.textContent = p.name;
      userGroup.appendChild(opt);
    }
    select.appendChild(userGroup);
  }

  if (selectedName) {
    select.value = selectedName;
  }
}
