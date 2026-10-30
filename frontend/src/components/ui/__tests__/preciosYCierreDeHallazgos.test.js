// Página de precios independiente (/precios), aviso de reserva no incluida en el plan, reporte SIS con columnas reales
// y RFC de recetas viejas por sus vías permitidas.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement as h } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { MemoryRouter } from 'react-router-dom'

const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), getUser: vi.fn() }))
vi.mock('../../../lib/supabase', () => ({ supabase: { rpc: m.rpc, from: m.from, auth: { getUser: m.getUser, onAuthStateChange: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn() } }))

const PLANES = [
  { plan: 'esencial', nombre: 'Esencial', precio_mensual: 599, precio_anual: 5990, permite_anual: true, moneda: 'MXN', max_usuarios: 1, max_pacientes: 500, funcionalidades: ['Agenda', 'Pacientes'] },
  { plan: 'profesional', nombre: 'Profesional', precio_mensual: 999, precio_anual: 9990, permite_anual: true, moneda: 'MXN', recomendado: true, max_usuarios: 3, funcionalidades: ['Agenda', 'Pacientes', 'Reserva en línea'] }
]
const texto = (r) => r.root.findAll((n) => typeof n.type === 'string').map((n) => n.children.filter((c) => typeof c === 'string').join('')).join(' ')

describe('página de precios (/precios)', () => {
  beforeEach(() => { m.rpc.mockReset() })

  async function montar() {
    m.rpc.mockResolvedValue({ data: PLANES, error: null })
    const { Precios } = await import('../../../pages/Precios')
    let r
    await act(async () => { r = TestRenderer.create(h(MemoryRouter, { initialEntries: ['/precios'] }, h(Precios))) })
    return r
  }

  it('muestra cada plan con su precio de la base, el recomendado marcado y su botón', async () => {
    const r = await montar()
    expect(m.rpc).toHaveBeenCalledWith('planes_publicos')
    const t = texto(r)
    expect(t).toContain('Esencial')
    expect(t).toContain('$599')
    expect(t).toContain('Recomendado')
    expect(t).toContain('Quiero el plan Profesional')
  })

  it('el cambio a «Anual» muestra el precio mensual equivalente y el ahorro real', async () => {
    const r = await montar()
    const anual = r.root.findAll((n) => n.type === 'button' && String(n.children.join('')).startsWith('Anual'))[0]
    expect(anual.props['aria-pressed']).toBe(false)
    await act(async () => { anual.props.onClick() })
    const t = texto(r)
    expect(t).toContain('$499') // 5990 / 12
    expect(t).toMatch(/ahorras 17%/)
  })

  it('la tabla compara las funcionalidades: lo que un plan no incluye se marca como no incluido', async () => {
    const r = await montar()
    const fila = r.root.findAll((n) => n.type === 'tr').find((tr) => tr.findAll((n) => n.type === 'th' && n.children.includes('Reserva en línea')).length)
    const marcas = fila.findAll((n) => n.type === 'span' && n.props['aria-label']).map((n) => n.props['aria-label'])
    expect(marcas).toEqual(['No incluida', 'Incluida'])
  })

  it('si no se pueden leer los planes, ofrece pedir cotización (no inventa precios)', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'x' } })
    const { Precios } = await import('../../../pages/Precios')
    let r
    await act(async () => { r = TestRenderer.create(h(MemoryRouter, null, h(Precios))) })
    expect(texto(r)).toContain('Pedir cotización')
    expect(texto(r)).not.toContain('$')
  })
})

describe('reporte SIS: solo columnas reales; CURP por sus vías permitidas', () => {
  it('no pide columnas inexistentes ni la CURP directa, y la agrega desde la vista segura y datos_privados_equipo', async () => {
    const selects = []
    const consulta = (datos) => {
      const q = { select: (s) => { selects.push(s); return q }, eq: () => q, gte: () => q, lt: () => q, in: () => Promise.resolve({ data: datos, error: null }), order: () => Promise.resolve({ data: datos, error: null }) }
      return q
    }
    m.from.mockImplementation((tabla) => tabla === 'citas'
      ? consulta([{ id: 'c1', paciente: { id: 'p1' }, dentista: { id: 'd1' }, notaClinica: [] }])
      : consulta([{ id: 'p1', curp: 'PACX900101HDFXXX01' }]))
    m.rpc.mockResolvedValue({ data: [{ id: 'd1', curp: 'DENX800101HDFXXX02', rfc: 'X' }], error: null })
    const { obtenerCitasCompletadasPeriodo } = await import('../../../services/sisReportes')
    const [cita] = await obtenerCitasCompletadasPeriodo(2026, 10)
    expect(selects[0]).not.toMatch(/curp|pais_nacimiento|sexo_biologico|derechohabiencia|tipo_personal_sis/)
    expect(cita.paciente.curp).toBe('PACX900101HDFXXX01')
    expect(cita.dentista.curp).toBe('DENX800101HDFXXX02')
  })
})

describe('receta vieja sin rfc_snapshot', () => {
  beforeEach(() => { m.rpc.mockReset(); m.getUser.mockReset() })
  it('el propietario la imprime con el RFC del odontólogo (datos_privados_equipo)', async () => {
    m.rpc.mockResolvedValue({ data: [{ id: 'd1', rfc: 'DENT800101AB2' }], error: null })
    const { rfcPrivadoDelProfesional } = await import('../../recetas/imprimirReceta')
    expect(await rfcPrivadoDelProfesional('d1')).toBe('DENT800101AB2')
  })
  it('el propio odontólogo, con el suyo; otro rol no obtiene RFC ajeno', async () => {
    m.rpc.mockImplementation((f) => Promise.resolve(f === 'mi_perfil_privado' ? { data: [{ rfc: 'MIRF800101AB1' }], error: null } : { data: [], error: null }))
    m.getUser.mockResolvedValue({ data: { user: { id: 'd1' } } })
    const { rfcPrivadoDelProfesional } = await import('../../recetas/imprimirReceta')
    expect(await rfcPrivadoDelProfesional('d1')).toBe('MIRF800101AB1')
    expect(await rfcPrivadoDelProfesional('otro')).toBeNull()
  })
})
