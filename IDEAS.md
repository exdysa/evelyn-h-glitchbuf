# effects

## 1d
  - something to get some solid blocks of color? lots of ways to break things now but not a ton to add new color/shapes

## 2d:
  - dithering

## other
  - any effects i can get easily from the canvas api?
    - see: https://glitchyimage.com/
  - see https://moshpro.app/ for inspiration

## language constructs?
  - easy way to build your own effect (1d and 2d), taking in raw byte/pixel data and doing whatever you want with it


# UI / features
  - script in PNG metadata?
    - neat but potentially a security issue
  - better error handling in the parsing
  - perhaps an op that allows the user to do infix mathametical operations? (like (calc 6 - (rand)\*3), instead of (- 6 (\* (rand) 3)))
  - scramble function - randomizes the current script layers
  - toggle layer function - switches the layer effect on/off by double-clicking the handle, maybe also a global on-off so that one can admire their destruction

## todo
 - feedback form (and perhaps donation page? if i wanna be bold)
 - plus button to add a line with a new effect (prefill defaults and have effect dropdown to avoid typing)
   - also let this insert a a whole preset perhaps
 - add support for leaving out a parameter in an effect dialog (e.g. for leaving the second field blank for a `resize` effect)


## ui redesign for mobile (and less confusing desktop)
 - image loading / downloading
  - show image browse button where preview is when no image is loaded
  - on desktop, have load image / download png buttons underneath preview in the right pane
  - on mobile, perhaps, have them in a modal when long-pressing the preview (too hidden though probs)
 - mobile interaction with effect is too hard. perhaps add a lil button next to a line that shows a modal with _all_ the effects contained in that line?
