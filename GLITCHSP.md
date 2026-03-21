# glitchbuf — language reference

glitchsp is the scripting language built into glitchbuf. a script is a list of effects applied to your image one after another, top to bottom. you don't need to know anything about programming to get started — just write effect names and numbers.

## getting started

the simplest scripts are just an effect name followed by its values:

```
noise -20
bitcrush 4
reverse
```

that applies three effects in sequence. see [EFFECTS.md](EFFECTS.md) for everything available.

## syntax

**one effect per line** is the most common style:

```
noise -20
bitcrush 4
```

**parentheses for nesting** — use `(op args...)` when you want to pass the result of one thing into another, or to use wrappers:

```
echo (* 5 (rand)) -6
(select 0 50 (invert))
```

both styles can be mixed freely. expressions can span multiple lines as long as parentheses balance.

**comments** — `#` makes the rest of the line a comment (ignored by the interpreter):

```
# this does nothing
noise -20  # heavy noise
```

## wrappers

wrappers apply an inner effect to a subset of the image or modify how it's applied. they all take the form `(wrapper params... body)` where `body` is the effect (or group of effects) you want to wrap.

see [EFFECTS.md](EFFECTS.md) for a full reference on each wrapper.

```
(select 0 50 (invert))          ; invert just the first half
(repeat 3 (echo 5 -12))         ; echo three times
(mix 0.5 (bitcrush 2))          ; 50% crushed, 50% original
(channel R (invert))            ; invert only the red channel
```

### do form ...

group multiple effects inside a wrapper:

```
(select 30 70 (do
  (reverb 0.8 5000)
  (noise -30)))
```

## randomness

### rand, rand max, rand min max

returns a random number. `(rand)` gives 0–1; `(rand max)` gives 0–max; `(rand min max)` gives a value in that range.

randomness is seeded — the same seed always produces the same result. click **randomise** in the app to try variations.

```
noise (* -10 (rand 3))
if (> (rand) 0.5) (invert) (reverse)
```

### randn, randn std, randn mean std

random number from a bell-curve (normal) distribution. `(randn)` is centred at 0 with standard deviation 1. provide a standard deviation and optional mean to control spread and centre.

```
noise (randn -18 4)     ; noise amount usually near -18 dB
```

### randint max, randint min max

random whole number. `(randint max)` gives 0 up to max-1; `(randint min max)` gives min up to max-1.

```
quantize (randint 2 6)  ; random quantize level between 2 and 5
```

## variables and functions

### let [name value ...] body?

bind a name to a value. with a body, the binding is local to it; without one, the name stays available for everything that follows.

```
let [x 10] (echo x -6)   ; x only exists inside the echo call

let [x 10]                ; x is available to subsequent lines
echo x -6
```

multiple bindings can go in the same `let`:

```
let [x 10  g -6] (echo x g)
```

### letfn name [params] body

shorthand for defining a named function. call it later with `(name args...)`.

```
letfn crunch [] (do (bitcrush 4) (noise -30))
(select 0 50 (crunch))
(select 60 90 (crunch))
```

functions can also take parameters:

```
letfn loud [db] (noise db)
(loud -6)
```

### fn [params...] body

create an anonymous function — usually paired with `let`:

```
let [crunch (fn [] (do (bitcrush 4) (noise -30)))]
(select 0 50 (crunch))
```

### if cond then else?

run `then` if `cond` is true, `else` otherwise (`else` is optional):

```
if (> (rand) 0.5) (bitcrush 4) (noise -20)
```

## arithmetic and comparisons

`+ - * / mod` — standard math. `< > <= >= =` — comparisons. `not` — negates a boolean.

```
echo (* 3 (rand 10)) -6
if (>= (rand) 0.8) (bitcrush 2)
if (not (> (rand) 0.5)) (invert)
```

### clamp v lo hi

clamp a number to the range `[lo, hi]`:

```
noise (clamp (* -5 (rand 8)) -40 -6)
```

## channel constants

`R` = 0, `G` = 1, `B` = 2 — use wherever a channel index is expected:

```
(channel G (bitcrush 3))
```

## examples

```
# simple glitch stack
noise -24
bitcrush 3
reverse

# banded distortion with wet mix
(mix 0.6 (do
  (select 0 50 (overdrive 8))
  (select 50 100 (reverb 0.9 3000))))

# channel-split colour shift
(channel R (transpose (echo 5 -6)))
(channel B (transpose (echo -5 -6)))

# random effect each run
if (> (rand) 0.5)
  (sort 60)
  (shuffle 30)

# reusable function applied to two regions
letfn crunch [] (do (bitcrush 4) (noise -30))
(select 0 50 (crunch))
(select 60 90 (crunch))
```
