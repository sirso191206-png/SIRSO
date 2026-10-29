import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { precacheManifest } from './vite-plugin-precache-manifest.js'

export default defineConfig({
  plugins: [react(), precacheManifest()],
  server: {
    port: 5173
  },
  build: {
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
