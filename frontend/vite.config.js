import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { precacheManifest } from './vite-plugin-precache-manifest.js'

export default defineConfig({
  plugins: [react(), precacheManifest()],
  server: {
    port: 5173
  },
  build: {
    // Los bloques vendor-* NO se precargan: el código de entrada los importa de inmediato, y con el service worker
    // sirviendo desde el caché Chrome no puede reutilizar un <link rel="modulepreload"> («cross-world service worker
    // resource mismatch»); tampoco tiene sentido que cada pantalla perezosa los vuelva a pedir («preloaded but not used»).
    modulePreload: {
      resolveDependencies: (archivo, dependencias) => dependencias.filter((d) => !/(^|\/)vendor-/.test(d))
    },
    rollupOptions: {
      output: {
        // Las librerías cambian poco: en bloques propios el navegador las conserva en caché entre versiones de SIRO y
        // solo vuelve a descargar el código de la app.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/node_modules\/(@supabase|iceberg-js|tslib)\//.test(id)) return 'vendor-supabase'
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'vendor-react'
        }
      }
    }
  }
})
