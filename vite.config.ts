import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Base relatif ('./') pour que l'app fonctionne quel que soit le sous-chemin
// où elle est servie (ouverture locale via `preview`, hébergement futur, etc.).
//
// CAP_BUILD=1 : build destiné au wrapper natif Capacitor (iOS).
// Dans un wrapper natif les assets sont déjà embarqués localement dans le
// bundle de l'app -> le service worker de la PWA est inutile ET nuisible
// (il sert des assets périmés depuis son propre cache après une mise à jour de
// build). On désactive donc vite-plugin-pwa pour ce mode.
const isCapacitor = process.env.CAP_BUILD === '1'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    ...(isCapacitor
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            workbox: {
              // Précache tout le shell applicatif -> fonctionne hors ligne dès la 1re visite.
              globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
            },
            manifest: {
              name: 'Suivi des contractions',
              short_name: 'Contractions',
              description: 'Suivi personnel des contractions — 100% local, hors ligne.',
              theme_color: '#0b0d12',
              background_color: '#0b0d12',
              display: 'standalone',
              orientation: 'portrait',
              lang: 'fr',
              start_url: './',
              scope: './',
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
          }),
        ]),
  ],
})
