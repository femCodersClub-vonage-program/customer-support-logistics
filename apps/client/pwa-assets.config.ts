import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

const brandBackground = { background: '#871eff' };

export default defineConfig({
  headLinkOptions: {
    preset: '2023',
  },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: brandBackground },
    apple: { ...minimal2023Preset.apple, resizeOptions: brandBackground },
  },
  images: ['public/favicon.svg'],
});
