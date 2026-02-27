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

### Buffer ops

```
bitcrush n          # quantise to 2^n discrete levels  (n = 1–8)
noise db            # add gaussian noise               (e.g. -30 = subtle, -6 = heavy)
echo delay gain     # single echo at delay fraction    (delay = 0–1, gain in dB)
reverb time wet     # convolve with decaying noise IR  (time = 0–1, wet = 0–1)
tremolo rate depth  # LFO amplitude modulation         (rate = oscillations, depth = 0–1)
distortion drive    # tanh soft-clip saturation        (drive ~1 = clean, ~10 = heavy)
chorus rate depth wet  # LFO time-shift mix            (rate = oscillations, depth = 0–1, wet = 0–1)
rescale w h         # resize image to w×h pixels
reverse             # reverse the byte stream
copy s e dst        # copy slice [s,e) to dst          (all fractions 0–1)
select s e body     # run body on sub-slice [s,e)
```

### Language

```
# comment

# let binding
let [x 0.25] (echo x -6)

# conditional
if (> (rand) 0.5) (bitcrush 4) (noise -20)

# sequencing (useful inside select)
select 0.2 0.5 (do
  (echo 0.1 -6)
  (bitcrush 4))

# fn for reuse
let [crunch (fn [] (do (bitcrush 4) (noise -30)))]
select 0.0 0.5 (crunch)
select 0.6 0.9 (crunch)

# rand: (rand) → 0–1, (rand n) → 0–n
noise (* -10 (rand 3))
```

### Available functions

| | |
|---|---|
| `+ - * / mod` | arithmetic |
| `< > <= >= = not` | comparison / logic |
| `clamp v lo hi` | numeric clamp |
| `rand`, `rand n` | seeded random |
