import react from '@csl/config/eslint/react';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  react,
  {
    rules: {
      'import-x/no-unresolved': ['error', { ignore: ['^virtual:'] }],
    },
  },
]);
