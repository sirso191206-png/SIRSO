import { defineConfig } from 'vitest/config'

// Configuración de pruebas independiente del build de Vite.
// Cubre el módulo de interoperabilidad SIS (lógica pura, sin DOM) y las
// pruebas de estructura/lógica anatómica del odontograma 3D (tampoco
// necesitan DOM/WebGL — verifican datos, no renderizado).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/features/**/*.test.ts', 'src/components/**/*.test.js'],
  },
})
