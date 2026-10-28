// Navegación: ninguna pantalla queda sin salida. Cada ruta de la app está en el menú lateral, tiene «Volver a …»
// (lib/navegacion.js) o es una pantalla de entrada pública; los enlaces internos apuntan a rutas que existen; y una
// dirección inexistente muestra la página 404 en vez de una pantalla en blanco.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

const est = vi.hoisted(() => ({ session: null }))
vi.mock('../../../store/useAuthStore', () => ({ useAuthStore: (sel) => sel(est) }))
import { rutaPadre } from '../../../lib/navegacion.js'
import { BarraRegreso, BarraRegresoPublica } from '../../layout/BarraRegreso.jsx'
import { PaginaNoEncontrada } from '../../../pages/PaginaNoEncontrada.jsx'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const leer = (rel) => readFileSync(join(SRC, rel), 'utf8')
const RUTAS = [...leer('App.jsx').matchAll(/path="([^"]+)"/g)].map((m) => m[1])
const MENU = [...leer('components/layout/Sidebar.jsx').matchAll(/to[=:] ?["']([^"']+)["']/g)].map((m) => m[1])
// Pantallas de entrada (no se llega a ellas «desde» otra) o con regreso propio.
const ENTRADA = ['/login', '/restablecer-password', '/contacto', '/legal', '/consulta/:citaId', '*']
const ejemplo = (r) => r.replace(/:[^/]+/g, 'x1')
const render = (el, ruta) => renderToStaticMarkup(h(MemoryRouter, { initialEntries: [ruta] }, el))

describe('toda pantalla tiene salida', () => {
  it('hay rutas y menú que revisar', () => {
    expect(RUTAS.length).toBeGreaterThan(30)
    expect(MENU.length).toBeGreaterThan(10)
  })
  it('cada ruta está en el menú, tiene «Volver a …» o es de entrada', () => {
    const sinSalida = RUTAS.filter((r) => !MENU.includes(r) && !ENTRADA.includes(r) && !rutaPadre(ejemplo(r)))
    expect(sinSalida).toEqual([])
  })
  it('el regreso siempre lleva a una ruta que existe', () => {
    const destinos = RUTAS.map((r) => rutaPadre(ejemplo(r))).filter(Boolean).map((p) => p.to)
    expect(destinos.filter((d) => !RUTAS.includes(d))).toEqual([])
  })
  it('reglas concretas', () => {
    expect(rutaPadre('/pacientes/abc')).toEqual({ to: '/pacientes', etiqueta: 'Pacientes' })
    expect(rutaPadre('/configuracion/seguridad')).toEqual({ to: '/configuracion', etiqueta: 'Configuración' })
    expect(rutaPadre('/administracion/arco').to).toBe('/administracion')
    expect(rutaPadre('/superadmin/planes').to).toBe('/administracion')
    expect(rutaPadre('/legal/cookies/preferencias').to).toBe('/legal/cookies')
    expect(rutaPadre('/legal/terminos').to).toBe('/legal')
    expect([rutaPadre('/'), rutaPadre('/pacientes'), rutaPadre('/consulta/1')]).toEqual([null, null, null])
  })
})

describe('enlaces internos', () => {
  const archivos = []
  ;(function recorrer(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) { if (n !== '__tests__') recorrer(p) } else if (/\.jsx?$/.test(n) && !/\.test\./.test(n)) archivos.push(p)
    }
  })(SRC)
  it('todo to=/href=/navigate() interno apunta a una ruta existente', () => {
    const patrones = RUTAS.filter((r) => r !== '*').map((r) => new RegExp('^' + r.replace(/:[^/]+/g, '[^/]+') + '$'))
    const malos = []
    for (const f of archivos) {
      const s = readFileSync(f, 'utf8')
      for (const m of s.matchAll(/(?:to|href)=["'](\/[^"'?#\s]*)["']|navigate\(\s*["'](\/[^"'?#]*)["']/g)) {
        const d = (m[1] ?? m[2]).replace(/\/$/, '') || '/'
        if (/^\/(assets|models)\b|\.(png|svg|json|js|pdf)$/.test(d)) continue
        if (!patrones.some((p) => p.test(d))) malos.push(`${d} ← ${f.replace(SRC, 'src')}`)
      }
    }
    expect(malos).toEqual([])
  })
})

describe('componentes', () => {
  it('BarraRegreso: «Volver a Pacientes» en el detalle; nada en una pantalla del menú', () => {
    expect(render(h(BarraRegreso), '/pacientes/123')).toMatch(/href="\/pacientes"[^>]*>.*Volver a Pacientes/)
    expect(render(h(BarraRegreso), '/agenda')).toBe('')
  })
  it('BarraRegresoPublica: con sesión ofrece volver a SIRO y al centro legal; sin sesión, solo el centro legal', () => {
    est.session = { user: {} }
    const con = render(h(BarraRegresoPublica), '/legal/terminos')
    expect(con).toContain('Volver a SIRO')
    expect(con).toContain('href="/legal"')
    est.session = null
    const sin = render(h(BarraRegresoPublica), '/legal/terminos')
    expect(sin).not.toContain('Volver a SIRO')
    expect(sin).toContain('Centro legal')
    expect(render(h(BarraRegresoPublica), '/legal')).toBe('')
  })
  it('404: mensaje claro y salida (inicio con sesión, iniciar sesión sin ella); App la registra como comodín', () => {
    est.session = null
    expect(render(h(PaginaNoEncontrada), '/no-existe')).toContain('href="/login"')
    est.session = { user: {} }
    expect(render(h(PaginaNoEncontrada), '/no-existe')).toContain('Ir al inicio')
    expect(RUTAS).toContain('*')
  })
})
