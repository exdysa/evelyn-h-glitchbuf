# effects

## 1d
  - something to get some solid blocks of color? lots of ways to break things now but not a ton to add new color/shapes

## 2d:

## other
  - any effects i can get easily from the canvas api?
    - see: https://glitchyimage.com/
  - see https://moshpro.app/ for inspiration

### claude's ideas:
byte
  - gamma(g) — power curve per byte. g<1 brightens, g>1 darkens. One line of math, very useful
  - threshold(level) — hard binarize: above → 255, below → 0. Brutal
  - levels(black, white) — remap input range to 0–255, like Photoshop levels
  - abs — fold negative (centered) byte values upward, like a half-wave rectifier

buffer
  - ringmod(freq) — multiply each byte by a sine wave at given frequency. Creates metallic, bell-like interference
  patterns. Pure math, no Tone.js
  - stutter(size, repeats) — grab small chunks and repeat them in place, like a CD skip or buffer freeze
  - palindrome — replace second half of buffer with mirror of first half, creating symmetric artifacts

image
  - rowshift(amount) — shift each scanline row horizontally by a random offset. The classic glitch art look. Very
  easy to implement
  - mirror — flip image horizontally, vertically, or both
  - pixelate(size) — average NxN blocks into flat colour. Classic mosaic
  - scanlines(gap, darkness) — dim every nth row
  - tile(n) — shrink image to 1/n and tile it n² times
  - drift(amount) — shift rows by progressively increasing offsets, creating a cascading slide

audio/filter
  - bitreverse — reverse bits within each byte before/after audio processing. Weird aliasing
  - allpass(freq) — Tone.js allpass filter, shifts phase without changing amplitude. Subtle but stacks interestingly

wrappers
  - scale(factor, body) — downscale, apply body, upscale back. Produces pixelated lo-fi artifacts then restores
  size. Very cool
  - checker(size, body) — apply body to alternating NxN blocks in a checkerboard pattern
  - even(body) / odd(body) — apply to alternating rows only. Great for scanline-style effects
  - luma(body) — extract luminance, apply body, recompose. Keeps colour intact while glitching brightness

  totally out there
  - huerotate(degrees) — rotate hue in HSV space. Requires RGB↔HSV conversion but very visually distinct from
  everything else
  - vortex(amount) — rotate each row by an amount proportional to distance from centre, creating a whirlpool
  - kaleidoscope(sectors) — mirror into N radial sectors



## language constructs?
  - easy way to build your own effect (1d and 2d), taking in raw byte/pixel data and doing whatever you want with it


# UI / features
  - better error handling in the parsing
  - perhaps an op that allows the user to do infix mathametical operations? (like (calc 6 - (rand)\*3), instead of (- 6 (\* (rand) 3)))
  - scramble function - randomizes the current script layers
  - toggle layer function - switches the layer effect on/off by double-clicking the handle, maybe also a global on-off so that one can admire their destruction
  - for wrapped effects, add a `...` button after the effect that lets you add another effect wrapped in a `do` block. this would make it easier to have chains of effects in a wrapped block, which is often desireable.

## todo
  - feedback form (and perhaps donation page? if i wanna be bold)
  - add back button or something to undo/go back in browser histroy
    - currently the fact that browser history saves state before loading a preset is too opaque
    - maybe also push changes on block blur too
    - and perhaps add ctrl-z shortcut to editor that uses browser history
  - add more optional params (default to null) for audio effects where appropriate
  - hover tooltips on params in code editor
  - tile effects editor at the bottom of editor rather than modal (keep as modal for mobile?)


## ui redesign for mobile (and less confusing desktop)
 - image loading / downloading
  - show image browse button where preview is when no image is loaded
  - on desktop, have load image / download png buttons underneath preview in the right pane
  - on mobile, perhaps, have them in a modal when long-pressing the preview (too hidden though probs)
 - mobile interaction with effect is too hard. perhaps add a lil button next to a line that shows a modal with _all_ the effects contained in that line?
