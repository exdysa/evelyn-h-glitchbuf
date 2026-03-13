# guiding principles
 - every line of code is a liability. aggressively clean up and factor out reusable parts of code.
 - use the type system! enforce invariants whenever possible and always be specific.
 - always be on the lookout for refactoring opportunities and make sure to update and re-consider old code when changing or adding things.
 - when factoring out behavior, aim for general purpose reusable code rather than specific and situational.
 - lowercase is best case. remember this <3

# glitchbuf — agent context

keep `AGENTS.md` (`CLAUDE.md` is a symlink), `README.md`, and the help docs (`HELP.md`, `GLITCHSP.md`, `EFFECTS.md`) up to date whenever you add ops, change file structure, or alter key design decisions. future-you will thank you.

## goals

creative glitch art tool. treats image pixel data as a raw byte stream and lets users manipulate it via a small lisp (glitchsp). emphasis on experimentation — fast feedback, reproducible seeds, expressive ops.

glitchsp should feel like a natural fit for the domain: audio-inspired semantics (dB, echo, noise), implicit buffer so users never write boilerplate, terse syntax. keep the language small and coherent. new ops should earn their place.

## style

- no bundler, no framework, no build complexity. keep it openable as `file://`.
- prefer simple and direct over clever. if something needs a long explanation, reconsider it.
- don't add ops, features, or configurability speculatively. wait for a real need.
- the DSL is minimal by design — resist the urge to kitchen-sink it.
- UX matters: the canvas should never flash or break mid-edit, errors shouldn't be noisy. everything needs to look and feel snappy.

## file overview

```
index.html          — markup; loads Tone.js CDN then glitchbuf.js (copied to dist/ on build)
style.css           — dark-mode UI, CSS vars, split-pane grid, mobile layout (copied to dist/ on build)
src/effects.ts      — IGlitchBuffer interface, GlitchBuffer class (all ops), rgbaToGlitch/glitchToRgba
src/ops.ts          — OpDef/OPS/OP_MAP: name, desc, ParamDef[], invoke binding for every effect
src/glitchsp.ts     — PRNG, tokenizer, parser, GlitchEnv, evaluate, makeGlitchEnv, runGlitchsp, splitIntoBlocks
src/editor.ts       — renderEditor, drag-and-drop, effect modal, getScript/setScript/initEditor
src/main.ts         — DOM wiring, runImage, fitCanvas, event listeners (UI only)
dist/               — build output: glitchbuf.js + copies of index.html and style.css
README.md           — project intro, setup/build instructions, links to help docs
HELP.md             — user guide: loading images, seed, run/new buttons, editor shortcuts
GLITCHSP.md         — glitchsp language reference: syntax, special forms, builtins, examples
EFFECTS.md          — effects reference: all ops with parameters and descriptions
AGENTS.md           — this file
```

## build

```sh
npm run build   # tsc → dist/glitchbuf.js, then copies index.html + style.css to dist/
```

`module: none` + `outFile` — tsc concatenates in reference order: `effects.ts` → `ops.ts` → `glitchsp.ts` → `presets.ts` → `editor.ts` → `main.ts`. works as `file://`.

## adding a new op

1. add method to `GlitchBuffer` in `src/effects.ts`
2. add signature to `IGlitchBuffer` in `src/effects.ts`
3. add entry to `OPS` in `src/ops.ts` with `invoke`, `desc`, and `params` — auto-registered into the env
4. update the op table in `EFFECTS.md`
5. run `npm run build` to verify
