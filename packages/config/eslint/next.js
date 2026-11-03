import nextPlugin from '@next/eslint-plugin-next';
import { defineConfig } from 'eslint/config';

import reactCore from './react-core.js';

export default defineConfig([
  reactCore,
  nextPlugin.configs.recommended,
  nextPlugin.configs['core-web-vitals'],
]);
