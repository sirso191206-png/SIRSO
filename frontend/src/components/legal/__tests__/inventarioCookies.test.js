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
})
