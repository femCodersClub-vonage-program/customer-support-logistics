import eslintReact from '@eslint-react/eslint-plugin';
import { defineConfig } from 'eslint/config';
import globals from 'globals';

import base from './base.js';

export default defineConfig([
  base,
  eslintReact.configs['recommended-typescript'],
  {
    languageOptions: {
      globals: globals.browser,
    },
  },
]);
