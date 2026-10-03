import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'bunny-icon.svg'],
      manifest: {
        name: 'Study Bunny — Study Companion',
        short_name: 'Study Bunny',
        description: 'Offline-first study companion for Filipino college students',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'bunny-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Only cache static assets — never cache API responses or user content
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [],
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
});
