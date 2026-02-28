# glitchbuf — agent context

Keep this file and `README.md` up to date whenever you add ops, change file structure, or alter key design decisions. Future-you will thank you.

## Goals

Creative glitch art tool. Treats image pixel data as a raw byte stream and lets users manipulate it via a small Lisp (glitchsp). The emphasis is on experimentation — fast feedback, reproducible seeds, expressive ops.

glitchsp should feel like a natural fit for the domain: audio-inspired semantics (dB, echo, noise), implicit buffer so users never write boilerplate, terse syntax. Keep the language small and coherent. New ops should earn their place.

## Style

- No bundler, no framework, no build complexity. Keep it openable as `file://`.
- Prefer simple and direct over clever. If something needs a long explanation, reconsider it.
- Don't add ops, features, or configurability speculatively. Wait for a real need.
- The DSL is minimal by design — resist the urge to kitchen-sink it.
- UX matters: the canvas should never flash or break mid-edit, errors shouldn't be noisy. everything needs to look and feel snappy.

## File overview

```
index.html          — markup; loads Tone.js CDN then dist/glitchbuf.js
style.css           — dark-mode UI, CSS vars, split-pane grid, mobile layout
src/effects.ts      — IGlitchBuffer interface, GlitchBuffer class (all ops), rgbaToGlitch/glitchToRgba
src/glitchsp.ts     — PRNG, tokenizer, parser, GlitchEnv, evaluate, makeGlitchEnv, runGlitchsp
src/main.ts         — DOM wiring, runImage, fitCanvas, event listeners (UI only)
dist/glitchbuf.js   — compiled output (tsc outFile, do not edit)
README.md           — user-facing docs; keep op table in sync with effects.ts
AGENTS.md           — this file
```

## Build

```sh
npm run build   # tsc → dist/glitchbuf.js (no bundler)
```

`module: none` + `outFile` — tsc concatenates in reference order: `effects.ts` → `glitchsp.ts` → `main.ts`. Works as `file://`.

## Non-obvious design

- **`IGlitchBuffer`** is defined in `effects.ts` (not `glitchsp.ts`) — referenced by `glitchsp.ts` via triple-slash.
- **`select` is a special form** in `evaluate()`, not a builtin — its body must be evaluated lazily after `buf.val` is swapped to the sub-buffer.
- **Buffer ops close over `BufCell`** (`{ val: IGlitchBuffer }`) rather than taking a buffer arg — this is how the buffer is implicit to users.
- **`buf` is threaded through `evaluate`** so `select` can temporarily rebind it and inner calls see the new value.
- **`evaluate` is async** — all built-ins may return `Promise<GlitchVal>`. Sync ops just return values and `await` is a no-op on them.
- **`GlitchBuffer` carries `width`/`height`** — needed by `rescale` and for any future 2D-aware ops.
- **`reverb` uses a seeded IR** (from `this.rand`) via a raw `ConvolverNode` — avoids `Tone.Reverb`'s random IR which would make the pattern non-deterministic across runs.

## Layout

`#canvas-pane` lives **inside** `#controls` in the HTML (between `.seed-row` and `.script-field`). On desktop, `#controls` is a 2-column CSS grid — form items auto-place into column 1, canvas-pane is explicitly `grid-column: 2; grid-row: 1 / -1`. On mobile (≤768px) controls reverts to a flex column and canvas-pane flows naturally in DOM order.

Canvas display sizing is handled by `fitCanvas()` in `main.ts` (+ a `ResizeObserver`) — it sets CSS `width`/`height` on the canvas element to fill the pane with contain behaviour. The canvas buffer attributes (`canvas.width`/`canvas.height`) are never touched by `fitCanvas`.

## Adding a new op

1. Add method to `GlitchBuffer` in `src/effects.ts`
2. Add signature to `IGlitchBuffer` in `src/effects.ts`
3. Add to `makeGlitchEnv` in `src/glitchsp.ts`: `env.set('name', (...) => buf.val.name(...))`
4. Update the op table in `README.md`
5. Update this file if the design changes meaningfully
