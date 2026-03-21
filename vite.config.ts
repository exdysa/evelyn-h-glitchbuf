import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { marked } from 'marked';

export default defineConfig({
  plugins: [
    {
      // so we can have build-time markdown transformation
      // instead of pulling in the dependency to the client
      name: 'markdown',
      transform(src, id) {
        if (id.endsWith('.md')) {
          const html = marked(src) as string;
          return { code: `export default ${JSON.stringify(html)}`, map: null };
        }
      },
    },
    svelte(),
  ],
  base: './',
});
