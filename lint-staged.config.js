export default {
  '*.{ts,svelte}': (files) => [
    `eslint --fix ${files.join(' ')}`,
    `prettier --write ${files.join(' ')}`,
    'svelte-check --tsconfig ./tsconfig.json',
  ],
};
