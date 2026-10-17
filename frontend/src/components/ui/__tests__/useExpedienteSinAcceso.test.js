// H27 — ficha del paciente abierta por RECEPCIÓN. RLS le oculta el expediente clínico a propósito (expedientes_select exige
// auth_paciente_asignado), así que obtenerExpediente() recibe «0 filas» (406 PGRST116). Antes, useExpediente.recargar() no
// capturaba ese rechazo: «Uncaught (in promise) PGRST116» en la consola (reproducido en el navegador real, v10) y `cargando` se
// quedaba en true para siempre. Ahora: «0 filas» = sin expediente visible (no es un fallo); cualquier OTRO error se expone en
// `error` (no se oculta) y la carga termina igual.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

const h = vi.hoisted(() => ({ exp: null, notas: [] }))
vi.mock('../../../services/expedientes', () => ({
  obtenerExpediente: vi.fn(() => (h.exp instanceof Error || h.exp?.code ? Promise.reject(h.exp) : Promise.resolve(h.exp))),
  obtenerNotasClinicas: vi.fn(() => Promise.resolve(h.notas)),
  crearNotaClinica: vi.fn(),
  actualizarExpediente: vi.fn()
}))
vi.mock('../../../lib/colaOffline', () => ({ encolarOperacion: vi.fn(), listarOperacionesPendientes: vi.fn(() => Promise.resolve([])) }))
vi.mock('../../../lib/mapeoIdsOffline', () => ({ esIdOffline: () => false }))
vi.mock('../../../store/useAuthStore', () => { const e = { perfil: { id: 'u1', rol: 'recepcion' } }; const f = (s) => s(e); f.getState = () => e; f.subscribe = () => () => {}; return { useAuthStore: f } })
vi.mock('../../../store/useSucursalStore', () => { const e = { sucursalActualId: null }; const f = (s) => s(e); f.getState = () => e; f.subscribe = () => () => {}; return { useSucursalStore: f } })

import { useExpediente } from '../../../hooks/useExpediente'

const CERO = { code: 'PGRST116', details: 'The result contains 0 rows', message: 'Cannot coerce the result to a single JSON object' }
let ultimo
function Sonda({ id }) { ultimo = useExpediente(id); return null }
const montar = async () => { await act(async () => { TestRenderer.create(React.createElement(Sonda, { id: 'pa1' })) }); await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }

const rechazos = []
const alRechazo = (e) => rechazos.push(e)
beforeEach(() => { ultimo = null; rechazos.length = 0; process.removeListener('unhandledRejection', alRechazo); process.on('unhandledRejection', alRechazo); vi.spyOn(console, 'error').mockImplementation(() => {}) })

describe('H27 — useExpediente cuando el expediente no es visible para el rol', () => {
  it('«0 filas» (recepción): termina de cargar, sin expediente, SIN error y sin rechazo sin capturar', async () => {
    h.exp = CERO
    await montar()
    expect(ultimo.cargando).toBe(false); expect(ultimo.expediente).toBe(null); expect(ultimo.notas).toEqual([]); expect(ultimo.error).toBe(null)
    expect(rechazos).toEqual([])
  })
  it('un error INESPERADO (servidor, red) NO se oculta: queda en `error`, la carga termina y no hay rechazo sin capturar', async () => {
    const e = Object.assign(new Error('Service Unavailable'), { status: 503 })
    h.exp = e
    await montar()
    expect(ultimo.cargando).toBe(false); expect(ultimo.error).toBe(e); expect(ultimo.expediente).toBe(null)
    expect(rechazos).toEqual([])
  })
  it('caso normal (dentista o owner): expediente y notas cargados, sin error', async () => {
    h.exp = { id: 'e1', paciente_id: 'pa1', alergias: ['penicilina'] }; h.notas = [{ id: 'n1' }]
    await montar()
    expect(ultimo.cargando).toBe(false); expect(ultimo.expediente).toMatchObject({ id: 'e1' }); expect(ultimo.notas).toEqual([{ id: 'n1' }]); expect(ultimo.error).toBe(null)
  })
})
