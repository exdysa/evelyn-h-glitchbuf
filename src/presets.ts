export interface Preset {
  name: string;
  code: string;
}

export const BUILT_IN_PRESETS: Preset[] = [
  {
    name: 'chromatic aberration',
    code: `\
chromashift R (randn 2) (randn 2)
chromashift B (randn 2) (randn 2)
`,
  },
  {
    name: 'data mosh',
    code: `\
copy (rand 0 100) (rand 0 100) (rand 0 100)
select (rand 0 100) (rand 0 100) (reverse)
stutter 3 20
`,
  },
  {
    name: 'crt',
    code: `\
maxsize 1024
noise -18
luma (mix 0.5 (do (gamma 0.5) (blur 16)))
levels 0 192
tremolo (/ height 16) 0.8
chromashift R 1 0
chromashift B -1 0
warp 0.1
vignette 1 1
blur 3
`,
  },
  {
    name: 'phaser',
    code: `\
maxsize 1024
mix .7 (do
  (noise -18)
  (phaser (randn 0.4 0.1) 3 (randn 30 5))
  (saturate 2)
  (chorus (+ 128 45) .2)
)
`,
  },
  {
    // vision: degraded magnetic tape — feedback delay smears the signal,
    // horizontal drag simulates magnetic dropout, stutters
    // freeze random chunks like a cd skip
    name: 'tape shred',
    code: `\
maxsize 1024
noise -22
stutter 0.8 12
(mix 0.8 (feedbackdelay (randn 20 3) (randn 0.5 0.1)))
channel (randint 3) (smear (randn 0.03 0.01) 0.5)
(mix 0.5 (channel (randint 3) (reverb 0.1 250)))
`,
  },
  {
    name: 'aliased',
    code: `\
maxsize 512
pixelate 12
resample 15
chromashift R (randn 0 1) (randn 0 1)
chromashift B (randn 0 1) (randn 0 1)
chorus (randn 500 200) (randn 24 6)
`,
  },
  {
    // vision: jpeg compression run twice at low quality
    name: 'jpeg compressed',
    code: `\
maxsize 512
noise -18
luma (jpeg (rand 5 15))
jpeg (rand 5 15)
`,
  },
  {
    // vision: photocopied too many times — lowpass and overdrive+levels on luma
    // crushes midtones and sharpens edges to harsh ink
    name: 'xerox',
    code: `\
maxsize 1024
lowpass (randn 500 200) 1
noise -24
luma (do
  (overdrive 1.5)
  (levels (rand 64 16) (randn 192 16))
)
`,
  },
  {
    name: 'xor sort',
    code: `\
xor (rand 64 192)
sort (rand 0 100)
`,
  },
  {
    name: 'bitcrush',
    code: `\
bitrot 0.05
bitcrush 3
pixelate 8
`,
  },
  {
    // vision: let/fn defines a reusable per-channel treatment; calling it on R, G, B
    // independently means each channel gets different random params — channels drift
    // apart structurally, blur stitches them back into a coherent image
    name: 'channel drift',
    code: `\
letfn treat [] (do
  (echo (rand 5 35) (randn -12 4))
  (sort (rand 20 80))
  (noise -28))
channel R (treat)
channel G (treat)
channel B (treat)
defocus 3
`,
  },
  {
    // vision: the buffer is treated as audio and passed through a resonant filter
    // stack — let pins the cutoff so lowpass and bandpass are always in tune with each other
    name: 'resonance',
    code: `\
let [f (rand 300 1800)]
maxsize 1024
luma (lowpass f 16)
mix 0.5 (luma (do
  (noise -18)
  (bandpass (* 1.5 f) 28)
  (gamma 2)
))
`,
  },
  {
    name: 'overtones',
    code: `\
maxsize 1024
noise -18
repeat 4 (mix 0.45 (pitchshift (randn 0 1) 0.05))
`,
  },
  {
    // vision: image remapped to polar space so horizontal pixel-sort lines
    // become radial streaks; transpose+smear then drags them outward; strong
    // colour fringing completes the vortex
    name: 'polar vortex',
    code: `\
chromashift R (randn 0 12) 0
polar
chromashift B (randn 0 12) (randn 0 12)
sort 45
transpose (smear 0.01 0.5)
`,
  },
  {
    name: 'vhs',
    code: `\
noise -18
smear (randn 0.02 0.005) (randn 0.05 0.02)
let [c (randint 3)]
chromashift c (rand 0 3) (rand 0 3)
chromashift (mod (+ 1 c)) (rand 0 3) (rand 0 3)
`,
  },
  {
    name: 'infrared',
    code: `\
channel R (invert)
channel G (saturate 3)
solarize 0.4
`,
  },
  {
    // vision: over-exposed dreamlike photograph — luma bloom, wide defocus
    // fog, warm golden cast, subtle ethereal highlight haze
    name: 'dreamscape',
    code: `\
maxsize 1024
saturate 2
luma (mix 0.7 (do (gamma 0.35) (defocus 18)))
mix 0.3 (defocus 25)
channel R (gamma 0.8)
channel B (gamma 1.2)
`,
  },
  {
    name: 'echo cascade',
    code: `\
repeat 3 (echo 20 -12)
`,
  },
  {
    // vision: self-composited zoom tunnel with per-layer rotation giving a
    // spiral pull; luma glow makes it feel like light pours from the centre
    name: 'infinite corridor',
    code: `\
luma (mix 0.5 (do (gamma 2) (defocus 10)))
vignette 1 1.5
tunnel 10 0.85 0.8 12
`,
  },
  {
    // vision: risograph / screen-print — highly limited palette with colour
    // layers that don't quite align, dithered luma for ink grain
    name: 'riso print',
    code: `\
quantize 4
chromashift R 5 1
chromashift B -4 -1
luma (diffuse 2)
`,
  },
  {
    // vision: each channel processed independently with different structure —
    // R has echo+smear, G is vertically sorted (transpose flips orientation),
    // B is reversed and echoed; blur knits them back together slightly
    name: 'bandwidth',
    code: `\
channel R (do (echo (randn 20 5) -8) (smear 0.02 0.3))
channel G (transpose (sort (randn 50 20)))
channel B (do (reverse) (echo (randn 20 20) -9))
defocus 4
`,
  },
  {
    // vision: waveshaping overload — chebyshev piles on harmonics, fold
    // recursively inverts peaks, lowpass barely reins it back; solarize
    // creates the half-inverted look typical of overexposed film
    name: 'signal fold',
    code: `\
maxsize 1024
mix 0.75 (do
  (chebyshev 4)
  (fold (rand 1.2 3))
)
solarize (randn 0.5 0.2)
luma (levels (randn 64 16) (randn 192 16))
`,
  },
  {
    // vision: freqshift on luma in two orthogonal directions at incommensurate
    // frequencies — horizontal and vertical combs interfere to produce a 2D
    // moiré grid, like crossed diffraction gratings; colour is untouched
    name: 'doppler',
    code: `\
maxsize 1024
let [f (rand 300 1200)]
luma (do
  (mix 0.6 (freqshift f))
  (mix 0.5 (transpose (freqshift (* f (randn 1.5 0.3)))))
)
`,
  },
  {
    name: 'lava lamp',
    code: `\
maxsize 1024
channel R (echo (randn 0 30) -12)
channel B (do (reverse) (echo (randn 0 30) -12))
channel G (transpose (echo (randn 20 20) -12))
fold 4
defocus 48
xor 223
saturate 2
bandpass 3000 0.1
`,
  },
];
export function loadUserPresets(): Preset[] {
  try {
    return JSON.parse(localStorage.getItem('glitchbuf_presets') ?? '[]');
  } catch {
    return [];
  }
}
export function saveUserPresets(presets: Preset[]): void {
  localStorage.setItem('glitchbuf_presets', JSON.stringify(presets));
}
