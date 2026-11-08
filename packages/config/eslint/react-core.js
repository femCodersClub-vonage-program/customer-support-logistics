import eslintReact from '@eslint-react/eslint-plugin';
import { defineConfig } from 'eslint/config';
import i18next from 'eslint-plugin-i18next';
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
  {
    files: ['**/*.{jsx,tsx}'],
    ignores: ['**/*.test.{jsx,tsx}', '**/test/**'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',
          'jsx-attributes': {
            include: ['alt', 'title', 'placeholder', 'label', 'aria-label', 'aria-description'],
            exclude: ['.*'],
          },
          callees: {
            exclude: [
              't',
              't\\.(rich|markup)',
              'require',
              'addEventListener',
              'removeEventListener',
              'includes',
              'startsWith',
              'endsWith',
            ],
          },
        },
      ],
    },
  },
]);
