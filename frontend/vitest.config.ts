import { defineConfig } from 'vitest/config'

// Configuración de pruebas independiente del build de Vite.
// Pruebas de estructura/lógica del odontograma 3D y de auditoría RLS
// (inspección estructural del SQL) — no necesitan DOM/WebGL, verifican
// datos y texto, no renderizado.
export default defineConfig({
  // Solo para pruebas: permite importar componentes .jsx (runtime automático de JSX,
  // igual que el plugin de React en el build). No afecta a `npm run build`.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['src/components/**/*.test.js'],
  },
})
