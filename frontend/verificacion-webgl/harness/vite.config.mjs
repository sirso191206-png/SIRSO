import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = path.dirname(fileURLToPath(import.meta.url))
export default defineConfig({
  root: aqui, publicDir: path.join(aqui, '..', '..', 'public'), plugins: [react(), { name: 'supabase-falso', enforce: 'pre', resolveId(id, importer) { if (/\/lib\/supabase(\.js)?$/.test(id) && importer && !importer.includes('verificacion-webgl')) return path.join(aqui, 'fakeSupabase.js') } }],
  server: { port: 5199, strictPort: true, fs: { allow: [path.join(aqui, '..', '..')] } }, build: { outDir: path.join(aqui, 'dist'), emptyOutDir: true }, base: './', css: { postcss: path.join(aqui, '..', '..') }
})
