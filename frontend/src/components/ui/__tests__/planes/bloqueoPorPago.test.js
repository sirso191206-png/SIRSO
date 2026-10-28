// Pantalla de clínica suspendida por falta de pago (migración 115). El bloqueo REAL lo prueba
// supabase/tests/bloqueo_por_falta_de_pago_test.sql; aquí solo qué ve cada quien.
import { describe, it, expect, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('../../../planes/PagoEnLinea', () => ({ PagoEnLinea: (p) => h('div', { 'data-pago': String(p.abierta) }, 'PAGO-EN-LINEA') }))
import { BloqueoPorPago } from '../../../planes/BloqueoPorPago.jsx'

describe('BloqueoPorPago', () => {
  it('el propietario ve por qué, que su información se conserva y puede pagar aquí mismo (sección abierta)', () => {
    const r = renderToStaticMarkup(h(BloqueoPorPago, { perfil: { rol: 'owner' }, fechaFin: '2026-10-01', onCerrarSesion: () => {} }))
    expect(r).toContain('Acceso suspendido por falta de pago')
    expect(r).toContain('terminó el 1 de octubre de 2026')
    expect(r).toContain('Tu información se conserva completa')
    expect(r).toContain('el acceso se reactiva en cuanto se confirma el pago')
    expect(r).toContain('data-pago="true"')
    expect(r).toContain('Cerrar sesión')
  })
  it('el resto del equipo no ve el pago: se le dice que el propietario debe pagar', () => {
    const r = renderToStaticMarkup(h(BloqueoPorPago, { perfil: { rol: 'recepcion' }, fechaFin: '2026-10-01', onCerrarSesion: () => {} }))
    expect(r).toContain('el propietario de la clínica debe pagar el plan')
    expect(r).not.toContain('PAGO-EN-LINEA')
  })
})
