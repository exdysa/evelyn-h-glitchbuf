export interface Preset { name: string; code: string; }

export const BUILT_IN_PRESETS: Preset[] = [
    {
        name: 'chromatic aberration', code: `\
chromashift R (randn 2) (randn 2)
chromashift B (randn 2) (randn 2)
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
  (saturate 2)
  (chorus (+ 128 45) .2)
)
` },
    {
        name: 'data mosh', code: `\
copy (rand 0 100) (rand 0 100) (rand 0 100)
select (rand 0 100) (rand 0 100) (reverse)
stutter 3 20
` },
    {
        name: 'vhs', code: `\
noise -18
smear .008 0.05
chromashift G 2 0
chromashift B -1 0
` },

    {
        name: 'xor sort', code: `\
xor 85
sort 20
` },
    {
        name: 'infrared', code: `\
channel R (invert)
channel G (saturate 3)
solarize 0.4
` },
    {
        name: 'scanlines', code: `\
stride 2 1 (do
  (bitcrush 2)
  (invert))
` },
];



export function loadUserPresets(): Preset[] {
    try { return JSON.parse(localStorage.getItem('glitchbuf_presets') ?? '[]'); }
    catch { return []; }
}

export function saveUserPresets(presets: Preset[]): void {
    localStorage.setItem('glitchbuf_presets', JSON.stringify(presets));
}
