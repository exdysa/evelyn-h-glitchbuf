# glitchsp language reference

glitchsp is a small Lisp that operates on the image's raw byte buffer (RGB, left-to-right, top-to-bottom). there is no explicit buffer argument — every effect implicitly targets the current buffer.

## syntax

**bare lines** — a line that doesn't start with `(` is an implicit call:

```
noise -20
bitcrush 4
```

**parenthesized forms** — use `(op args...)` for nesting:

```
(echo (* 5 (rand)) -6)
```

both forms can be mixed freely. multi-line expressions are supported; parentheses are balanced across lines before evaluating.

**comments** — `#` starts a line comment:

```
# this is a comment
noise -20  # inline comment
```

## special forms

these are evaluated lazily — their bodies are not evaluated until the form needs them.

### `select start end body`

apply `body` to the byte sub-slice `[start, end)` where `start` and `end` are 0–100 percentages of the buffer.

```
select 0 50 (invert)
select 20 80 (do
  (noise -20)
  (bitcrush 4))
```

### `repeat n body`

evaluate `body` n times in sequence.

```
repeat 3 (echo 5 -12)
```

### `channel ch body`

apply `body` to a single RGB channel. `ch` is 0 (R), 1 (G), or 2 (B) — use the `R`, `G`, `B` constants.

```
channel R (invert)
channel B (bitcrush 3)
```

### `stride size skip body`

apply `body` to chunks of `size` percent, skipping `skip` chunks between each application. useful for banded effects.

```
stride 10 1 (invert)   # invert every other 10% band
```

### `mix wet body`

evaluate `body`, then blend its result with the pre-body snapshot at ratio `wet` (0–1).

```
mix 0.5 (bitcrush 2)   # 50% blend of bitcrushed with original
```

### `do form ...`

evaluate forms in sequence, return the last value. useful for grouping multiple ops.

```
select 30 70 (do
  (reverb 0.8 5000)
  (noise -30))
```

### `let [sym val ...] body?`

without a body, binds names into the current environment — they stay accessible for all subsequent top-level forms. with a body, creates a local scope and evaluates `body` inside it. multiple bindings are allowed in both forms.

```
# top-level definition — crunch is available afterwards
let [crunch (fn [] (do (bitcrush 4) (noise -30)))]
select 0 50 (crunch)
select 60 90 (crunch)

# scoped — x is only visible inside the echo call
let [x 10 g -6] (echo x g)
```

### `fn [params...] body`

create a function that closes over the current environment.

```
let [crunch (fn [] (do (bitcrush 4) (noise -30)))]
select 0 50 (crunch)
select 60 90 (crunch)
```

### `if cond then else?`

conditional. `else` branch is optional (returns null if omitted and condition is false).

```
if (> (rand) 0.5) (bitcrush 4) (noise -20)
```

## language builtins

### `rand`, `rand max`, `rand min max`

seeded random number. `(rand)` returns 0–1; `(rand max)` returns 0–max; `(rand min max)` returns min–max. uses the seed from the seed field — same seed always gives the same sequence.

```
noise (* -10 (rand 3))
if (> (rand) 0.5) (invert) (reverse)
```

### `randn`, `randn std`, `randn mean std`

normally distributed random number (gaussian) via box-muller. `(randn)` returns N(0,1); `(randn std)` returns N(0,std); `(randn mean std)` returns N(mean,std). uses the same seeded prng as `rand`.

```
noise (randn -18 4)          ; noise amount clustered around -18 dB
echo (randn 0.5 0.1) -12     ; delay clustered around 0.5
```

### `randint max`, `randint min max`

seeded random integer. `(randint max)` returns 0–max-1; `(randint min max)` returns min–max-1. useful anywhere an integer is required — channel selection, quantize steps, pixelate sizes, etc.

```
chromashift (randint 3) (randn 4 2) 0   ; random channel each run
quantize (randint 2 6)                  ; 2–5 quantize levels
```

### channel constants

`R` = 0, `G` = 1, `B` = 2. use with `channel` and `transpose`.

```
channel G (bitcrush 3)
transpose R 10 5
```

### arithmetic

`+ - * / mod` — standard numeric operations.

```
echo (* 3 (rand 10)) (- 0 6)
```

### comparison

`< > <= >= =` — return true/false.

```
if (>= (rand) 0.8) (bitcrush 2)
```

### logic

`not` — negates a boolean.

```
if (not (> (rand) 0.5)) (invert)
```

### `clamp v lo hi`

clamp a number to the range `[lo, hi]`.

```
noise (clamp (* -5 (rand 8)) -40 -6)
```

## examples

```
# simple glitch stack
noise -24
bitcrush 3
reverse

# banded distortion with wet mix
mix 0.6 (do
  (select 0 50 (distort 8))
  (select 50 100 (reverb 0.9 3000)))

# channel-split shift
transpose R 5 0
transpose B -5 0

# random effect each run
if (> (rand) 0.5)
  (sort 60)
  (shuffle 30)

# reusable function applied to two regions
let [crunch (fn [] (do (bitcrush 4) (noise -30)))]
select 0 50 (crunch)
select 60 90 (crunch)
```
