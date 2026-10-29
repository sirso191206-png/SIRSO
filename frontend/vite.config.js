import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { precacheManifest } from './vite-plugin-precache-manifest.js'

export default defineConfig({
  plugins: [react(), precacheManifest()],
  server: {
    port: 5173
  },
  build: {
    // Los bloques vendor-* ya los carga index.html al abrir SIRO: que cada pantalla perezosa los vuelva a «precargar»
    // solo añade enlaces que el navegador no usa (aviso «preloaded but not used» en la consola).
    modulePreload: {
      resolveDependencies: (archivo, dependencias, { hostType }) =>
        hostType === 'js' ? dependencias.filter((d) => !/(^|\/)vendor-/.test(d)) : dependencias
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
