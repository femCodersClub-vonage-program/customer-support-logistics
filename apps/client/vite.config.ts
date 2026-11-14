import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
        workbox: {
          navigateFallbackDenylist: [/^\/api\//],
        },
        manifest: {
          id: '/',
          name: 'Customer Support Logistics',
          short_name: 'CSL',
          description: 'Sigue tus pedidos, reporta incidencias y únete a la llamada de mediación.',
          lang: 'es',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#871eff',
          background_color: '#f2f2f2',
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          screenshots: [
            {
              src: 'screenshots/orders-narrow.png',
              sizes: '1080x1920',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Tus pedidos en el móvil',
            },
            {
              src: 'screenshots/orders-wide.png',
              sizes: '1920x1080',
              type: 'image/png',
              form_factor: 'wide',
              label: 'Tus pedidos en una pantalla grande',
            },
          ],
        },
        devOptions: {
          enabled: true,
        },
      }),
    ],
    server: {
      allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.dev'],
      proxy: {
        '/api': {
          target: env.API_URL ?? 'http://localhost:3000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
