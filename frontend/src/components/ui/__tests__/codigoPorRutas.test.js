// División por rutas: guardia contra volver a cargar todas las pantallas de golpe, y recuperación si una no baja.
import { describe, it, expect } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { ErrorDeCarga, debeRecargarSola, CLAVE_RECARGA } from '../../layout/ErrorDeCarga.jsx'
import { INVENTARIO_COOKIES } from '../../../lib/inventarioCookies.js'

const app = readFileSync(new URL('../../../App.jsx', import.meta.url), 'utf8')

describe('App.jsx: las pantallas se cargan por ruta', () => {
  it('solo Login y Mi día se importan de golpe; todas las demás pantallas son perezosas', () => {
    const estaticos = [...app.matchAll(/^import \{ (\w+) \} from '\.\/pages\/[^']+'/gm)].map((m) => m[1])
    expect(estaticos.sort()).toEqual(['Login', 'MiDia'])
  })
  it('las pantallas perezosas son las que se rutean (no queda ninguna sin cargar de forma perezosa)', () => {
    const perezosas = [...app.matchAll(/^const (\w+) = pagina\(\(\) => import\('\.\/pages\/[^']+'\), '(\w+)'\)/gm)]
    expect(perezosas.length).toBeGreaterThanOrEqual(25)
    for (const [, constante, exportada] of perezosas) expect(constante).toBe(exportada)
    const usadas = [...app.matchAll(/<Route path="[^"]+" element=\{(.+)\} \/>/g)].map((m) => m[1]).join(' ')
    for (const [, nombre] of perezosas) expect(usadas, `${nombre} no está en ninguna ruta`).toContain(`<${nombre} `)
  })
  it('las pantallas pesadas (dashboard con gráficas) no están en el paquete inicial', () => {
    expect(app).toMatch(/const Dashboard = pagina\(/)
    expect(app).not.toMatch(/^import \{ Dashboard \}/m)
  })
  it('las rutas están envueltas en Suspense Y en la recuperación de errores de carga', () => {
    expect(app).toMatch(/<ErrorDeCarga>\s*<Suspense[\s\S]*<Routes>[\s\S]*<\/Routes>\s*<\/Suspense>\s*<\/ErrorDeCarga>/)
  })
})

describe('ErrorDeCarga: si una pantalla no se puede descargar no queda la pantalla en blanco', () => {
  it('sin falla, muestra la pantalla normal', () => {
    expect(renderToStaticMarkup(h(ErrorDeCarga, null, h('p', null, 'CONTENIDO')))).toContain('CONTENIDO')
  })
  it('una falla de carga cambia al estado de error (getDerivedStateFromError)', () => {
    expect(ErrorDeCarga.getDerivedStateFromError(new Error('Failed to fetch dynamically imported module'))).toEqual({ fallo: true })
  })
  it('en estado de error explica qué pasó, tranquiliza sobre los cambios pendientes y ofrece recargar', () => {
    const e = new ErrorDeCarga({ children: h('p', null, 'CONTENIDO') })
    e.state = { fallo: true }
    const html = renderToStaticMarkup(e.render())
    expect(html).toContain('No se pudo abrir esta pantalla')
    expect(html).toContain('versión nueva de SIRO')
    expect(html).toContain('no se pierden')
    expect(html).toContain('Recargar')
    expect(html).toContain('role="alert"')
    expect(html).not.toContain('CONTENIDO')
  })
  it('con conexión se recarga sola UNA vez (versión nueva), nunca en ciclo; sin conexión no', () => {
    const m = new Map()
    const almacen = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }
    expect(debeRecargarSola(1000000, almacen, true)).toBe(true)
    expect(debeRecargarSola(1010000, almacen, true)).toBe(false)   // 10 s después: ya se intentó, se muestra la pantalla
    expect(debeRecargarSola(1040000, almacen, true)).toBe(true)    // otra versión nueva más tarde: vuelve a valer
    expect(debeRecargarSola(2000000, new Map(), false)).toBe(false)
    expect(debeRecargarSola(1, { getItem: () => { throw new Error('bloqueado') } }, true)).toBe(false)
  })
  it('la marca de recarga está declarada en el inventario público de almacenamiento', () => {
    expect(INVENTARIO_COOKIES.some((c) => c.nombre === CLAVE_RECARGA && c.categoria === 'necesarias')).toBe(true)
  })
})
