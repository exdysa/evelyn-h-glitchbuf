<script lang="ts">
  import { getAppContext } from '../context';
  import { readPngMeta, type PngMeta } from '../png-meta';
  import { b64decode } from '../utils';
  import Field from './base/Field.svelte';

  const ctx = getAppContext();

  async function onFileChange(e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      let meta: PngMeta = {};
      try {
        meta = readPngMeta(buf);
      } catch {
        /* not a png or no metadata */
      }

      try {
        await ctx.loadImage(meta.original ?? file);
      } catch {
        if (meta.original) {
          await ctx.loadImage(file);
        } else {
          ctx.showError('failed to load image');
          return;
        }
      }

      ctx.showError('');
      if (meta.seed !== undefined) ctx.state.seed = meta.seed;
      if (meta.script !== undefined) ctx.setScript(b64decode(meta.script));
      ctx.runImage(true);
    } catch (e) {
      ctx.showError(String(e));
    }
  }
</script>

<Field label="input image" for="file">
  <input type="file" id="file" accept="image/*" onchange={onFileChange} />
</Field>
