# glitchbuf — using the app

## loading an image

click **choose file** and pick any image. the canvas updates immediately after loading.

## seed

the seed drives every random decision in your script — `rand`, `shuffle`, `noise`, etc. the same seed and the same script always produce identical output.

- edit the seed manually to pin a value for reproducible results.
- click **randomise** to roll a new seed and re-run — great for exploring variations.

## the editor

the editor shows your script as a list of **blocks** — each top-level expression or effect is its own row. you can interact with blocks visually or edit them as text.

### editing a block

click anywhere on a block to edit it. while editing:

- **Enter** (at the end of a line) — commit the block and create a new one below
- **Tab** / **Shift+Tab** — move focus to the next / previous block
- **Backspace** on an empty block — delete it and move focus up
- **Ctrl+/** — toggle the block as a comment (disabling it without deleting it)
- **Ctrl+A** twice — first selects all text in the block; pressing again exits to raw mode (see below)

multi-line blocks are supported — use **Shift+Enter** to insert a newline within a block.

### effect badges

effect names are highlighted in each block. click a badge to open a parameter dialog — adjust values with sliders, enable/disable optional params, then click **apply**.

### adding effects

click **+** at the bottom of the editor to open the add-effect dialog and pick from the full list.

### wrapping a block

the **`()`** button on the left of each row opens a wrap dialog. use it to add a modifier around an existing effect — `select` to target a region, `mix` to blend the result, `repeat` to run it multiple times, etc. see [EFFECTS.md](EFFECTS.md) for all available wrappers.

### reordering blocks

drag the handle (the dotted grip on the far left) to reorder blocks.

### commenting out

click the dot button on any row to toggle the block as a comment. a hollow dot means the block is currently commented out (disabled).

### deleting a block

click **×** on the right of any row to remove it.

### raw mode

press **Ctrl+A** twice while editing a block to switch the whole script into a plain textarea. blur the textarea or press **Escape** to return to block view.

## canvas

the canvas on the right shows the processed image. it scales to fill the available space — the underlying pixel data is unaffected by display size.
