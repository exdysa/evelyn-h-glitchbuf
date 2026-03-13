/// <reference path="glitchsp.ts" />

interface Preset { name: string; code: string; }

const BUILT_IN_PRESETS: Preset[] = [
  {
    name: 'chromatic aberration', code: `\
transpose R (randn 2) (randn 2)
transpose B (randn 2) (randn 2)
` },
  {
    name: 'bitcrush', code: `\
bitcrush 3
noise -20
` },
  {
    name: 'echo cascade', code: `\
repeat 3 (echo 20 -12)
` },
  {
    name: 'channel warp', code: `\
channel R (echo 25 -6)
channel G (bitcrush 3)
channel B (mix 0.8 (reverb 0.6 5000))
` },
  {
    name: 'solarize', code: `\
solarize 0.5
fold 1.2
` },
  {
    name: 'reverb wash', code: `\
resize 1024
mix 0.7 (reverb 0.85 4000)
noise -30
` },
  {
    name: 'phaser', code: `\
resize 1024
mix .7 (do
  (noise -18)
  (phaser .2 3 50)
  (distort 2)
  (chorus (+ 128 45) .2 .8)
)
` },
  {
    name: 'pixel sort', code: `\
sort 50
` },
  {
    name: 'data mosh', code: `\
copy 10 40 20
select 60 90 (reverse)
noise -12
` },
  {
    name: 'vhs', code: `\
smear .008 0.05
transpose G 2 0
transpose B -1 0
noise -32
` },
  {
    name: 'fold cascade', code: `\
repeat 3 (fold 1.5)
solarize 0.6
` },
  {
    name: 'xor sort', code: `\
xor 85
sort 20
` },
  {
    name: 'infrared', code: `\
channel R (invert)
channel G (distort 3)
solarize 0.4
` },
  {
    name: 'scanlines', code: `\
stride 2 1 (do
  (bitcrush 2)
  (invert))
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
