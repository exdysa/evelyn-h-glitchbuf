# effects

## 1d
  - something to get some solid blocks of color? lots of ways to break things now but not a ton to add new color/shapes

## 2d:

## other
  - any effects i can get easily from the canvas api?
    - see: https://glitchyimage.com/
  - see https://moshpro.app/ for inspiration

### claude's ideas:
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
  - for wrapped effects, add a `...` button after the effect that lets you add another effect wrapped in a `do` block. this would make it easier to have chains of effects in a wrapped block, which is often desireable.
  - auto warning/help when rendering is slow that lets the user easily insert a rescale to make the image smaller
  - autoformat on block blur? nothing too fancy, just spaces, multiline do block, and maybe something for let / fn defs too
  - share button to copy the url with effect

## todo
  - feedback form (and perhaps donation page? if i wanna be bold)
  - add back button or something to undo/go back in browser histroy
    - currently the fact that browser history saves state before loading a preset is too opaque
    - maybe also push changes on block blur too
    - and perhaps add ctrl-z shortcut to editor that uses browser history
  - hover tooltips on params in code editor
  - tile effects editor at the bottom of editor rather than modal (keep as modal for mobile?)
  - show color layer param as radio buttons
  - move saved presets above default ones

## bugs

## ui redesign for mobile (and less confusing desktop)
 - image loading / downloading
  - show image browse button where preview is when no image is loaded
  - on desktop, have load image / download png buttons underneath preview in the right pane
  - on mobile, perhaps, have them in a modal when long-pressing the preview (too hidden though probs)
 - mobile interaction with effect is too hard. perhaps add a lil button next to a line that shows a modal with _all_ the effects contained in that line?
 - mobile bugs:
   - comment button is broken
   - cant open effect dialog
