import { defineConfig } from 'vitest/config'

// Configuración de pruebas independiente del build de Vite.
// Por ahora solo cubre el módulo de interoperabilidad SIS (lógica pura,
// sin DOM). Conforme se agreguen más pruebas, ampliar el "include".
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/features/**/*.test.ts'],
  },
})
