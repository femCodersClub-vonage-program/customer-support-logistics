import { defineConfig } from 'eslint/config';
import reactRefresh from 'eslint-plugin-react-refresh';

import reactCore from './react-core.js';

export default defineConfig([reactCore, reactRefresh.configs.vite]);
