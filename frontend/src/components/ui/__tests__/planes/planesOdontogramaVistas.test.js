// Vistas del odontograma según el plan. Se renderiza el componente REAL (los hijos pesados
// se reemplazan por marcadores). Solo decide qué mostrar; la BD bloquea los datos.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('../../../../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), auth: { onAuthStateChange: vi.fn() } } }))
vi.mock('zustand', async (importarOriginal) => {
  const real = await importarOriginal()
  return {
    ...real,
    create: (inicial) => {
      const api = real.createStore(inicial)
      api.getServerState = api.getState
      const hook = (selector, igualdad) => real.useStore(api, selector, igualdad)
      Object.assign(hook, api)
      return hook
    }
  }
})
vi.mock('../../../odontograma/Odontograma2D', () => ({ Odontograma2D: () => h('p', null, 'MARCADOR-2D') }))
vi.mock('../../../odontograma/OdontogramaHojaClinica', () => ({ OdontogramaHojaClinica: () => h('p', null, 'MARCADOR-HOJA') }))
vi.mock('../../../odontograma/CargandoModelo3D', () => ({ CargandoModelo3D: () => h('p', null, 'MARCADOR-CARGANDO-3D') }))
vi.mock('../../../odontograma/Odontograma3D', () => ({ Odontograma3D: () => h('p', null, 'MARCADOR-3D') }))
vi.mock('../../../periodontograma/Periodontograma', () => ({ Periodontograma: () => h('p', null, 'MARCADOR-PERIO') }))

import { Odontograma } from '../../../odontograma/Odontograma.jsx'
import { usePlanStore } from '../../../../store/usePlanStore.js'
import { useAuthStore } from '../../../../store/useAuthStore.js'

const f = (codigo, habilitada) => ({ codigo, nombre: codigo, categoria: 'clinico', habilitada })
function conPlan(funcs, vistaGuardada) {
  useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol: 'dentista' } })
  usePlanStore.setState({ suscripcion: { sin_suscripcion: false, plan: { nombre: 'P' }, funcionalidades: funcs }, claveSuscripcion: 'u1:c1', cargada: true })
  globalThis.window = globalThis
  globalThis.localStorage = { getItem: () => vistaGuardada, setItem: () => {} }
}
const render = () => renderToStaticMarkup(h(Odontograma, { pacienteId: 'p1' }))

beforeEach(() => {
  useAuthStore.setState({ perfil: null })
  usePlanStore.getState().limpiar()
})

describe('Odontograma: vistas disponibles según el plan', () => {
  it('con 2D, 3D, periodontograma y hoja: muestra las cuatro opciones', () => {
    conPlan([f('odontograma_2d', true), f('odontograma_3d', true), f('periodontograma', true)], '2d')
    const html = render()
    for (const t of ['Vista clínica 2D', 'Vista anatómica 3D', 'Periodontograma', 'Hoja clínica']) expect(html).toContain(t)
    expect(html).toContain('MARCADOR-2D')
  })

  it('con 2D y 3D y la 3D guardada: se respeta y queda activa', () => {
    conPlan([f('odontograma_2d', true), f('odontograma_3d', true), f('periodontograma', false)], '3d')
    const html = render()
    expect(html).toContain('Vista anatómica 3D')
    expect(html).not.toContain('>Periodontograma<')
    expect(html).toMatch(/aria-pressed="true"[^>]*>Vista anatómica 3D/)
  })

  it('SOLO 2D: la 3D se oculta; y si el usuario TENÍA guardada la 3D, cae automáticamente a 2D (no queda en blanco)', () => {
    conPlan([f('odontograma_2d', true), f('odontograma_3d', false), f('periodontograma', false)], '3d')
    const html = render()
    expect(html).not.toContain('Vista anatómica 3D')
    expect(html).not.toContain('MARCADOR-3D')
    expect(html).not.toContain('MARCADOR-CARGANDO-3D')
    expect(html).toContain('MARCADOR-2D')
    expect(html).toMatch(/aria-pressed="true"[^>]*>Vista clínica 2D/)
  })

  it('periodontograma guardado pero no incluido: cae a una vista disponible', () => {
    conPlan([f('odontograma_2d', true), f('odontograma_3d', true), f('periodontograma', false)], 'perio')
    const html = render()
    expect(html).not.toContain('MARCADOR-PERIO')
    expect(html).toContain('MARCADOR-2D')
  })

  it('NINGUNA vista incluida: estado claro, nunca pantalla en blanco', () => {
    conPlan([f('odontograma_2d', false), f('odontograma_3d', false), f('periodontograma', false)], '2d')
    const html = render()
    expect(html).toContain('Esta funcionalidad no está disponible en tu plan.')
    expect(html).not.toContain('MARCADOR-')
  })

  it('al cambiar de plan la 3D vuelve a ofrecerse', () => {
    conPlan([f('odontograma_2d', true), f('odontograma_3d', false)], '2d')
    expect(render()).not.toContain('Vista anatómica 3D')
    conPlan([f('odontograma_2d', true), f('odontograma_3d', true)], '2d')
    expect(render()).toContain('Vista anatómica 3D')
  })

  it('sin suscripción cargada (o clínica heredada) NO oculta ninguna vista', () => {
    useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol: 'dentista' } })
    globalThis.window = globalThis
    globalThis.localStorage = { getItem: () => '2d', setItem: () => {} }
    const html = render()
    for (const t of ['Vista clínica 2D', 'Vista anatómica 3D', 'Periodontograma', 'Hoja clínica']) expect(html).toContain(t)
  })

  it('el superadmin conserva todas las vistas', () => {
    useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol: 'dentista', es_super_admin: true } })
    usePlanStore.setState({ suscripcion: { funcionalidades: [f('odontograma_3d', false)] }, claveSuscripcion: 'u1:c1' })
    globalThis.window = globalThis
    globalThis.localStorage = { getItem: () => '2d', setItem: () => {} }
    expect(render()).toContain('Vista anatómica 3D')
  })
})
