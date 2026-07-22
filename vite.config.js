import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages project site is served from /<repo>/. The repo is `radar_app`.
// Override with VITE_BASE at build time if deployed elsewhere.
const base = process.env.VITE_BASE || '/radar_app/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // 'prompt': updates surface a French toast; never a silent mid-session
      // reload (it would destroy unsaved bottom-sheet form input).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Radar — prospection',
        short_name: 'Radar',
        description: 'CRM de prospection personnel — données 100 % locales',
        lang: 'fr',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#12161F',
        theme_color: '#12161F',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
})
