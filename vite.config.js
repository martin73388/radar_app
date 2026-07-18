import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Deployed on GitHub Pages under https://<user>.github.io/radar_app/
export default defineConfig({
  base: '/radar_app/',
  plugins: [
    react(),
    tailwindcss(),
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
        background_color: '#0f172a',
        theme_color: '#0f172a',
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
