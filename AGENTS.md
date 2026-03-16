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

- vite + svelte for the build, but keep complexity low. no unnecessary abstractions.
- prefer simple and direct over clever. if something needs a long explanation, reconsider it.
- don't add ops, features, or configurability speculatively. wait for a real need.
- the DSL is minimal by design — resist the urge to kitchen-sink it.
- UX matters: the canvas should never flash or break mid-edit, errors shouldn't be noisy. everything needs to look and feel snappy.

## file overview

```
index.html                          — Vite entry point; mounts App.svelte
styles/style.css                    — dark-mode CSS vars, layout, responsive breakpoints
src/App.svelte                      — root component; global state, context setup, layout
src/effects.ts                      — IGlitchBuffer interface, GlitchBuffer class (all ops), rgbaToGlitch/glitchToRgba
src/ops.ts                          — OpDef/OPS/OP_MAP: name, desc, ParamDef[], invoke binding for every effect
src/glitchsp.ts                     — PRNG, tokenizer, parser, GlitchEnv, evaluate, makeGlitchEnv, runGlitchsp, splitIntoBlocks
src/editor.ts                       — pure utility functions: tokenizeForDisplay, findExprBounds, findParamAtOffset,
                                      selectionCharOffsets, setCaretOffset, getEditText, placeCaretAtEnd/AtPoint, sLog/sExp
src/png-meta.ts                     — writePngMeta/readPngMeta: embed/extract seed, script, original image in PNG chunks
src/context.ts                      — AppCtx Svelte context (state + methods shared across components)
src/presets.ts                      — built-in preset gallery
src/utils.ts                        — b64encode/b64decode helpers
src/vite-env.d.ts                   — ambient module shims for png-chunks-* CJS packages
src/components/Preview.svelte       — canvas rendering pipeline, runImage, fitCanvas, error display
src/components/SeedRow.svelte       — seed input + randomize button
src/components/FileInput.svelte     — image upload, PNG metadata extraction
src/components/PresetsRow.svelte    — preset picker with save/load/delete
src/components/base/                — Button, Dialog, Field, Prompt primitives
src/components/dialogs/             — HelpDialog, SavePresetDialog, DeletePresetDialog, PresetConfirmDialog
src/components/editor/Editor.svelte — top-level editor; owns lines[] state, drag, raw mode; exposes EditorApi via onready
src/components/editor/EditorLine.svelte — single block row; display/edit toggle via editState enum, keyboard handling, drag handle, wrap/delete buttons
src/components/editor/LineDisplay.svelte — tokenized read-only block view; number scrubbing, effect badge clicks
src/components/editor/EffectModal.svelte — modal for adding/editing/wrapping effect expressions
src/components/editor/ParamRow.svelte   — single parameter row within EffectModal
src/components/editor/ParamSlider.svelte — scrub slider for numeric params
src/components/editor/RandPanel.svelte  — randomize panel
src/components/editor/param-math.ts    — param value math helpers
src/components/editor/types.ts         — shared editor component types (EffectModalApi, etc.)
dist/                               — build output (vite)
README.md                           — project intro, setup/build instructions, links to help docs
HELP.md                             — user guide: loading images, seed, run/new buttons, editor shortcuts
GLITCHSP.md                         — glitchsp language reference: syntax, special forms, builtins, examples
EFFECTS.md                          — effects reference: all ops with parameters and descriptions
AGENTS.md                           — this file
```

## build

```sh
npm run dev     # vite dev server with hot reload
npm run build   # svelte-check + vite build → dist/
npm run preview # serve dist/ locally
npm run lint    # eslint src
```

always run `npm run lint && npm run build` together when verifying changes. vite bundles everything via `@sveltejs/vite-plugin-svelte`. open `dist/index.html` directly or use `npm run preview`.

## adding a new op

1. add method to `GlitchBuffer` in `src/effects.ts`
2. add signature to `IGlitchBuffer` in `src/effects.ts`
3. add entry to `OPS` in `src/ops.ts` with `invoke`, `desc`, and `params` — auto-registered into the env
4. update the op table in `EFFECTS.md`
5. run `npm run build` to verify
