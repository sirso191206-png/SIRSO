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
    // OJO con este include: lo que no está aquí NO se ejecuta y nadie se entera. Hasta el 25-ago (cierre-v1) también incluía
    // las pruebas de TypeScript de src/features (SIS: mapper, validador, exportador, catálogos — 101 pruebas); al reescribir
    // la lista se perdieron y llevaron semanas sin correr. La prueba `inventarioDePruebas` falla si vuelve a ocurrir.
    include: ['src/features/**/*.test.ts', 'src/components/**/*.test.js'],
    // Las pruebas NO dependen del .env local ni pueden llegar a un Supabase real: algunas importan el cliente tal cual
    // (createClient lanza "supabaseUrl is required" sin estas variables, y un clon limpio o un sistema de integración
    // continua no tiene .env). Valores ficticios en un dominio .test, que nunca resuelve: una petición sin simular
    // falla de inmediato en vez de salir a un servidor de verdad.
    env: {
      VITE_SUPABASE_URL: 'https://pruebas-sirso.supabase.test',
      VITE_SUPABASE_ANON_KEY: 'llave-anonima-solo-para-pruebas',
    },
  },
})
