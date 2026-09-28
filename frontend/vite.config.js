import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { precacheManifest } from './vite-plugin-precache-manifest.js'

export default defineConfig({
  plugins: [react(), precacheManifest()],
  server: {
    port: 5173
  }
})
