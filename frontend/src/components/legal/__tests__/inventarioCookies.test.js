import { readFileSync, readdirSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { INVENTARIO_COOKIES, CATEGORIAS, agruparPorCategoria } from '../../../lib/inventarioCookies'

describe('inventarioCookies — solo lo que realmente existe', () => {
  it('no declara ninguna cookie/tecnología de analítica ni marketing (no existen en el proyecto)', () => {
    const analiticasOMarketing = INVENTARIO_COOKIES.filter((c) => c.categoria === 'analiticas' || c.categoria === 'marketing')
    expect(analiticasOMarketing).toHaveLength(0)
  })

  it('todas las entradas son de primera parte (SIRO no usa ningún SDK de terceros)', () => {
    expect(INVENTARIO_COOKIES.every((c) => c.tercero === false)).toBe(true)
  })

  it('la sesión de Supabase está clasificada como necesaria y no desactivable', () => {
    const sesion = INVENTARIO_COOKIES.find((c) => c.nombre.includes('auth-token'))
    expect(sesion.categoria).toBe('necesarias')
    const catNecesarias = CATEGORIAS.find((c) => c.id === 'necesarias')
    expect(catNecesarias.desactivable).toBe(false)
  })

  it('agruparPorCategoria incluye las 4 categorías, aunque analíticas/marketing queden vacías', () => {
    const grupos = agruparPorCategoria()
    expect(grupos).toHaveLength(4)
    const analiticas = grupos.find((g) => g.id === 'analiticas')
    expect(analiticas.items).toHaveLength(0)
  })

  it('GUARDIA contra la deriva: toda base IndexedDB y la caché del Service Worker que existen en el código figuran en el inventario público (no se declara menos de lo que se guarda en el dispositivo)', () => {
    const lib = new URL('../../../lib/', import.meta.url), nombresEnCodigo = new Set()
    for (const f of readdirSync(lib).filter((n) => n.endsWith('.js'))) for (const m of readFileSync(new URL(f, lib), 'utf8').matchAll(/(?:DB_NOMBRE|NOMBRE_DB) = '([a-z0-9-]+)'/g)) nombresEnCodigo.add(m[1])
    expect(nombresEnCodigo.size).toBeGreaterThanOrEqual(10)
    const declarado = INVENTARIO_COOKIES.map((e) => e.nombre).join(' ')
    for (const n of nombresEnCodigo) expect(declarado, `base IndexedDB «${n}» sin declarar`).toContain(n)
    const sw = readFileSync(new URL('../../../../public/sw.js', import.meta.url), 'utf8'); const prefijo = sw.match(/PREFIJO_CACHE = '([a-z-]+)'/)[1]
    expect(declarado).toContain(prefijo)
  })
})
