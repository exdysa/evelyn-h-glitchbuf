# glitchbuf

In-browser image glitching tool. Load an image, write glitchsp code, watch it break.

## Setup

```sh
npm install
npm run build   # or: npm run watch
```

Open `index.html` directly in a browser (`file://` URL, no server needed).

## Usage

Load an image with the file picker. The canvas on the right updates automatically as you type valid code. Use **Run** to force a re-run or show errors immediately. **New** randomises the seed and re-runs.

The seed field is editable — pin a seed to get reproducible results across runs.

## glitchsp

A small Lisp that operates on the image's raw byte buffer (RGB, left-to-right, top-to-bottom). Each top-level line is an implicit call on the current buffer.

### Audio effects

```
bitcrush n             # quantise to 2^n discrete levels  (n = 1–8)
noise db               # add gaussian noise               (e.g. -30 = subtle, -6 = heavy)
echo delay gain        # single echo                      (delay = 0–100, gain in dB)
reverb roomSize damp wet  # Freeverb plate reverb          (roomSize = 0–1, damp = Hz, wet = 0–1)
tremolo rate depth     # LFO amplitude modulation         (rate = oscillations, depth = 0–1)
distort drive          # tanh soft-clip saturation        (drive ~1 = clean, ~10 = heavy)
chorus rate depth wet  # LFO time-shift mix               (rate = oscillations, depth = 0–1, wet = 0–1)
pitchshift semitones   # Tone.js time-preserving pitch shift (semitones, e.g. -12 to 12)
phaser freq oct base wet  # Tone.js all-pass phaser          (freq Hz, octaves, base Hz, wet 0–1)
freqshift freq wet     # Tone.js frequency shifter           (freq Hz shift ±, wet 0–1)
vibrato freq depth wet # Tone.js LFO pitch wobble            (freq Hz, depth 0–1, wet 0–1)
chebyshev order wet    # Tone.js harmonic waveshaper         (order 1–100, wet 0–1)
autowah base oct sens wet  # Tone.js envelope-follower wah   (base Hz, octaves, sensitivity dB, wet 0–1)
feedbackdelay delay fb wet  # Tone.js recirculating delay    (delay 0–100, feedback 0–1, wet 0–1)
```

### Byte effects & transforms

```
invert                 # invert every byte (255 - x)
reverse                # reverse the byte stream
copy s e dst           # copy slice [s,e) to dst          (all 0–100)
quantize n             # quantise to n discrete levels     (evenly spaced, any n)
fold drive             # wavefold: reflect values at boundaries (drive ≤ 0.5 = subtle, ~1 = one fold, higher = chaotic)
solarize threshold     # invert bytes above threshold      (threshold 0–1)
```

### Pixel effects & transforms

```
sort thresh            # sort pixels by luma within rows         (thresh ≥0 = bright runs, <0 = dark runs)
sortvertical thresh    # sort pixels by luma within columns      (same threshold sign convention)
smear amount decay     # propagate peak value forward with decay (amount 0–100, decay 0–1)
xor value              # XOR every byte against value            (0–255; try 85 or 170)
shuffle amount         # randomly swap amount% of pixels (seeded, whole RGB pixels, 0–100)
transpose ch dx dy     # shift one channel layer by dx/dy (0–100% of width/height, wraps)
rescale w h            # resize image to w×h pixels (h optional — omit to preserve aspect ratio)
resize w h             # alias for rescale
```

### Special forms

```
repeat n body          # apply body n times
stride len skip body   # apply body to chunks of len (0–100), skipping skip chunks between each
channel ch body        # apply body to one RGB channel    (ch: R, G, or B)
mix wet body           # blend body's result with original (wet = 0–1)
select s e body        # apply body to sub-slice [s,e)    (0–100)
```

### Language

```
# comment

# let binding
let [x 25] (echo x -6)

# conditional
if (> (rand) 0.5) (bitcrush 4) (noise -20)

# sequencing (useful inside select)
select 20 50 (do
  (echo 10 -6)
  (bitcrush 4))

# fn for reuse
let [crunch (fn [] (do (bitcrush 4) (noise -30)))]
select 0 50 (crunch)
select 60 90 (crunch)

# rand: (rand) → 0–1, (rand n) → 0–n
noise (* -10 (rand 3))
```

### Available functions

| | |
|---|---|
| `+ - * / mod` | arithmetic |
| `< > <= >= = not` | comparison / logic |
| `clamp v lo hi` | numeric clamp |
| `rand`, `rand n` | seeded random (0–1, or 0–n) |
| `R`, `G`, `B` | channel constants (0, 1, 2) |
