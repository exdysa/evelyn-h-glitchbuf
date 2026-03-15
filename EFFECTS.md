# glitchbuf effects reference

all effects are available as glitchsp ops. click any effect badge in the editor to open its parameter dialog — each param has a description, a randomize toggle, and (where applicable) a disable option.

---

## byte effects

operate on each byte independently.

`bitcrush` `overdrive` `saturate` `gamma` `levels` `bitrot` `invert` `quantize` `fold` `solarize` `xor`

---

## image effects

operate on whole RGB pixels or 2D image structure.

`sort` `smear` `chromashift` `blur` `defocus` `warp` `pixelate` `polar` `flip` `mirror` `displace` `tunnel` `vignette` `resize` `maxsize` `jpeg` `bayer` `diffuse`

---

## buffer effects

rearrange or modulate data across the buffer.

`reverse` `copy` `noise` `echo` `shuffle` `stutter` `resample`

---

## audio effects

audio processing.

`tremolo` `chorus` `reverb` `pitchshift` `phaser` `freqshift` `vibrato` `chebyshev` `autowah` `feedbackdelay`

---

## filter effects

biquad filters treating the pixel buffer as an audio signal.

`lowpass` `highpass` `bandpass` `lowshelf` `highshelf` `notch`
