# glitchbuf — agent context

## Goals

Creative glitch art tool. Treats image pixel data as a raw byte stream and lets users manipulate it via a small Lisp (glitchsp). The emphasis is on experimentation — fast feedback, reproducible seeds, expressive ops.

glitchsp should feel like a natural fit for the domain: audio-inspired semantics (dB, echo, noise), implicit buffer so users never write boilerplate, terse syntax. Keep the language small and coherent. New ops should earn their place.

## Style

- No bundler, no framework, no build complexity. Keep it openable as `file://`.
- Prefer simple and direct over clever. If something needs a long explanation, reconsider it.
- Don't add ops, features, or configurability speculatively. Wait for a real need.
- The DSL is minimal by design — resist the urge to kitchen-sink it.
- UX matters: the canvas should never flash or break mid-edit, errors shouldn't be noisy. everything needs to look and feel snappy.

## Build

```sh
npm run build   # tsc → dist/glitchbuf.js (no bundler)
```

`module: none` + `outFile` — tsc concatenates sources. `glitchsp.ts` emits first via triple-slash reference in `main.ts`. Works as `file://`.

## Non-obvious design

- **`IGlitchBuffer`** is defined in `glitchsp.ts` (not `main.ts`) so the interpreter has no dependency on the file emitted after it.
- **`select` is a special form** in `evaluate()`, not a builtin — its body must be evaluated lazily after `buf.val` is swapped to the sub-buffer.
- **Buffer ops close over `BufCell`** (`{ val: IGlitchBuffer }`) rather than taking a buffer arg — this is how the buffer is implicit to users.
- **`buf` is threaded through `evaluate`** so `select` can temporarily rebind it and inner calls see the new value.

## Adding a new op

1. Add method to `GlitchBuffer` in `main.ts`
2. Add to `IGlitchBuffer` in `glitchsp.ts`
3. Add to `makeGlitchEnv`: `env.set('name', (...) => buf.val.name(...))`
4. Update `README.md`
