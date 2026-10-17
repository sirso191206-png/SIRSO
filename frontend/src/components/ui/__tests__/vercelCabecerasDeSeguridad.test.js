// Fase final: vercel.json define cabeceras de seguridad. Las OBLIGATORIAS no pueden romper la app (la app no usa cámara, micrófono ni geolocalización: se comprobó en el código);
// la CSP va SOLO en modo reporte hasta validarla en un navegador real (imponerla sin probarla podría dejar la app en blanco): PENDIENTE DE EJECUCIÓN MANUAL.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const cfg = JSON.parse(readFileSync(new URL('../../../../vercel.json', import.meta.url), 'utf8'))
const de = (source) => Object.fromEntries((cfg.headers.find((h) => h.source === source)?.headers ?? []).map((h) => [h.key, h.value]))

describe('vercel.json — cabeceras de seguridad', () => {
  const todas = de('/(.*)')
  it('cabeceras obligatorias en todas las rutas', () => {
    expect(todas['X-Content-Type-Options']).toBe('nosniff'); expect(todas['X-Frame-Options']).toBe('DENY'); expect(todas['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    for (const api of ['camera', 'microphone', 'geolocation']) expect(todas['Permissions-Policy']).toContain(`${api}=()`)
  })
  it('la CSP está en modo REPORTE (no se impone sin validar), prohíbe objetos y marcos, y NO permite eval ni scripts de otros orígenes', () => {
    expect(todas['Content-Security-Policy']).toBeUndefined()
    const csp = todas['Content-Security-Policy-Report-Only']; expect(csp).toContain("object-src 'none'"); expect(csp).toContain("frame-ancestors 'none'"); expect(csp).toContain("base-uri 'self'")
    // 'wasm-unsafe-eval' solo permite compilar WebAssembly (decodificadores del modelo 3D); NO habilita eval de JavaScript, que es lo que se prohíbe.
    expect(csp).not.toMatch(/(?<!wasm-)unsafe-eval|script-src[^;]*https?:|script-src[^;]*\*/)
    expect(csp).toContain("'wasm-unsafe-eval'")
  })
  it('el Service Worker y su manifiesto no se cachean (así los navegadores detectan las actualizaciones)', () => { expect(de('/sw.js')['Cache-Control']).toBe('no-cache'); expect(de('/precache-manifest.json')['Cache-Control']).toBe('no-cache') })
  it('las reescrituras de la SPA siguen intactas (un archivo inexistente no se contesta con index.html)', () => { expect(cfg.rewrites).toHaveLength(1); expect(cfg.rewrites[0].destination).toBe('/index.html'); expect(cfg.rewrites[0].source).toContain('assets/|models/') })
})
