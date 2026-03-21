# glitchbuf — effects reference

all effects are available as glitchsp ops. click any effect badge in the editor to open its parameter dialog — each param has a description, a scrub slider, and (where applicable) a disable toggle.

---

## effect types

**byte effects** operate on individual byte values independently of their neighbours. they tend to produce harsh, mathematical-looking distortions: banding, clipping, value inversion. examples include `bitcrush`, `overdrive`, `gamma`, `quantize`, `fold`, `solarize`, `xor`.

**buffer effects** rearrange or modulate data across the buffer as a whole — treating the pixel stream as a raw sequence of bytes rather than a 2D image. good for glitchy repetitions, smearing, and noise. examples include `echo`, `reverse`, `copy`, `shuffle`, `stutter`, `resample`.

**image effects** work with 2D structure — pixels, rows, columns, spatial position. they can shift colours, blur regions, warp geometry, or manipulate pixel order. examples include `sort`, `chromashift`, `blur`, `warp`, `pixelate`, `flip`, `displace`, `vignette`, `jpeg`, `bayer`, `diffuse`.

**audio effects** treat the pixel buffer as an audio waveform and apply digital signal processing to it — reverb, chorus, pitch shifting, tremolo, and more. because the buffer is raw pixel data rather than audio, the results are unpredictable and often heavily glitched. examples include `reverb`, `chorus`, `pitchshift`, `tremolo`, `phaser`, `vibrato`, `chebyshev`.

**filter effects** apply biquad filters (lowpass, highpass, bandpass, etc.) to the pixel buffer, treating it as an audio signal. they attenuate or boost different "frequency" components of the byte stream, which translates to smooth gradients, loss of sharp transitions, or the opposite. examples include `lowpass`, `highpass`, `bandpass`, `lowshelf`, `highshelf`, `notch`.

---

## wrappers

wrappers modify *how* an effect (or group of effects) is applied — targeting a region, a channel, or blending the result back in. they all take the form `(wrapper params... body)` in your script. use the **`()`** button in the editor to wrap an existing block without typing.

### select start end body

apply `body` to only a portion of the pixel buffer. `start` and `end` are percentages (0–100) of the total buffer length.

since the buffer is raw RGB bytes laid out left-to-right, top-to-bottom, selecting 0–50 targets roughly the top half of the image, and so on — though channel interleaving means boundaries don't land exactly on pixel rows.

```
(select 0 50 (invert))
(select 20 80 (do
  (noise -20)
  (bitcrush 4)))
```

### repeat n body

run `body` n times in sequence. useful for intensifying subtle effects or building up accumulative damage.

```
(repeat 4 (echo 5 -12))
```

### mix wet body

run `body`, then blend its output back with the state before `body` ran. `wet` is 0 (fully original) to 1 (fully processed). values in between give a ghost-like overlay effect.

```
(mix 0.3 (reverb 0.9 4000))  ; subtle reverb trail
(mix 0.5 (bitcrush 2))       ; half-crushed
```

### channel ch body

apply `body` to a single RGB channel, leaving the other two untouched. `ch` is 0 (R), 1 (G), or 2 (B) — use the constants `R`, `G`, `B`.

great for colour-split effects and applying different amounts of distortion per channel.

```
(channel R (invert))
(channel B (bitcrush 3))
(channel G (echo 8 -10))
```

### stride len skip body

apply `body` to evenly-spaced chunks of the buffer. `len` is the chunk size as a percentage; `skip` is how many chunks to leave between each processed one.

`skip 0` processes every chunk. `skip 1` processes every other chunk (creating bands). higher skip values produce sparser patterns.

```
(stride 10 1 (invert))    ; invert every other 10% band
(stride 5 3 (bitcrush 2)) ; hit every 4th band
```

### scale factor body

downscale the image, apply `body`, then upscale back to original size. lower values produce blockier, more pixelated results before the effect runs — the upscale step then re-interpolates and smears things back out.

useful for lo-fi looks and making effects "chunkier".

```
(scale 0.25 (blur 3))
(scale 0.1 (noise -6))
```

### luma body

apply `body` to the luminance (brightness) channel only, leaving hue and saturation untouched. useful for effects that you want to affect perceived brightness without shifting colour.

```
(luma (bitcrush 3))
(luma (fold 1.5))
```

### transpose body

flip the pixel grid so that the buffer runs top-to-bottom rather than left-to-right, apply `body`, then flip back. any effect that operates on the buffer as a horizontal sequence will now operate on vertical columns instead.

```
(transpose (echo 5 -12))    ; vertical echo instead of horizontal
(transpose (sort 80))        ; sort columns instead of rows
```
