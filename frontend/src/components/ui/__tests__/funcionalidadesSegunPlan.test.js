// Inventario y reserva en línea: solo se muestran si el PLAN de la clínica los incluye, también para el superadmin.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement as h } from 'react'
import TestRenderer, { act } from 'react-test-renderer'

vi.mock('../../../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), auth: { onAuthStateChange: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn() } }))
import { usePlanStore } from '../../../store/usePlanStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { identidadSuscripcion } from '../../../lib/planes'
import { useDisponibilidad, useFuncionalidad } from '../../../hooks/useFuncionalidad'

function preparar({ superadmin, inventario, reserva }) {
  const perfil = { id: 'u1', clinica_id: 'c1', rol: 'owner', es_super_admin: superadmin }
  useAuthStore.setState({ perfil })
  usePlanStore.setState({
    claveSuscripcion: identidadSuscripcion(perfil),
    suscripcion: { funcionalidades: [
      { codigo: 'inventario', habilitada: inventario }, { codigo: 'reserva_en_linea', habilitada: reserva }, { codigo: 'auditoria', habilitada: false }
    ] }
  })
}
function evaluar() {
  let r
  const Sonda = () => { const d = useDisponibilidad(); r = { inv: d('inventario'), aud: d('auditoria'), res: useFuncionalidad('reserva_en_linea'), sinCodigo: d(undefined) }; return null }
  act(() => { TestRenderer.create(h(Sonda)) })
  return r
}

describe('funcionalidades nuevas según el plan de la clínica', () => {
  beforeEach(() => { useAuthStore.setState({ perfil: null }) })
  it('superadmin en una clínica sin inventario ni reserva: NO las ve (las demás sí, por su pase)', () => {
    preparar({ superadmin: true, inventario: false, reserva: false })
    expect(evaluar()).toEqual({ inv: false, aud: true, res: false, sinCodigo: true })
  })
  it('si el plan las incluye, aparecen', () => {
    preparar({ superadmin: true, inventario: true, reserva: true })
    expect(evaluar()).toMatchObject({ inv: true, res: true })
  })
  it('propietario sin ellas en el plan: ocultas', () => {
    preparar({ superadmin: false, inventario: false, reserva: false })
    expect(evaluar()).toEqual({ inv: false, aud: false, res: false, sinCodigo: true })
  })
})
