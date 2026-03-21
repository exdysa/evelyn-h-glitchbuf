<script lang="ts">
  import type { ParamDef } from '../../ops';
  import { makeParamScale } from './param-math';

  let {
    param,
    value = $bindable(),
    disabled = false,
  }: {
    param: ParamDef;
    value: number;
    disabled?: boolean;
  } = $props();

  const scale = $derived(makeParamScale(param));
</script>

<input
  type="range"
  min={scale.toSlider(param.min)}
  max={scale.toSlider(param.max)}
  step={param.step ?? 1}
  value={scale.toSlider(value)}
  {disabled}
  oninput={(e) => {
    value = scale.fromSlider(parseFloat(e.currentTarget.value));
  }}
/>
<input
  type="number"
  min={param.min}
  max={param.max}
  step={param.step ?? 1}
  value={scale.fmt(value)}
  {disabled}
  oninput={(e) => {
    const v = parseFloat(e.currentTarget.value);
    if (!isNaN(v)) value = Math.min(param.max, Math.max(param.min, v));
  }}
/>
