// Aceptación de los documentos legales (migración 106): lógica pura y pantalla. La integridad REAL (versión y fecha fijadas por el servidor) la prueba la batería SQL.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

const h = vi.hoisted(() => ({ activos: {}, mias: [], registradas: [], falla: null, consultaFalla: false, estado: { logout: () => {} } }))
vi.mock('../../../store/useAuthStore', () => { const useAuthStore = (sel) => (typeof sel === 'function' ? sel(h.estado) : h.estado); return { useAuthStore } })
vi.mock('../../../services/legal', () => ({
  obtenerDocumentoActivo: vi.fn(async (tipo) => { if (h.consultaFalla) throw new Error('red'); return h.activos[tipo] ?? null }),
  obtenerMisAceptaciones: vi.fn(async () => { if (h.consultaFalla) throw new Error('red'); return h.mias }),
  registrarAceptacion: vi.fn(async (a) => { if (h.falla) throw new Error('rls'); h.registradas.push(a); return a })
}))
import * as servicio from '../../../services/legal'
import { tiposRequeridos, calcularPendientes, construirAceptacion } from '../../../lib/aceptacionLegal.js'
import { AceptacionLegalObligatoria } from '../../legal/AceptacionLegalObligatoria.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const doc = (tipo, id, version = '1.0') => ({ id, tipo, version, titulo: tipo })
const texto = (r) => JSON.stringify(r.toJSON())

describe('lógica de aceptación', () => {
  it('todos aceptan Términos y Aviso de Privacidad; el propietario además el Acuerdo de Tratamiento de Datos; la superadministración no firma consigo misma; sin sesión nada', () => {
    expect(tiposRequeridos({ id: 'u', rol: 'dentista' })).toEqual(['terms', 'privacy_integral']); expect(tiposRequeridos({ id: 'u', rol: 'recepcion' })).toEqual(['terms', 'privacy_integral'])
    expect(tiposRequeridos({ id: 'u', rol: 'owner' })).toEqual(['terms', 'privacy_integral', 'data_processing_agreement']); expect(tiposRequeridos({ id: 'u', rol: 'owner', es_super_admin: true })).toEqual(['terms', 'privacy_integral'])
    expect(tiposRequeridos(null)).toEqual([]); expect(tiposRequeridos({ rol: 'owner' })).toEqual([])
  })
  it('pendiente = documento activo cuyo id no aparece entre las aceptaciones: una versión NUEVA (otro id) vuelve a pedirse y las anteriores no cuentan', () => {
    const v1 = doc('terms', 'a'), v2 = doc('terms', 'b', '2.0'), p = doc('privacy_integral', 'c')
    expect(calcularPendientes([v1, p], [{ documento_id: 'a' }, { documento_id: 'c' }])).toEqual([]); expect(calcularPendientes([v2, p], [{ documento_id: 'a' }, { documento_id: 'c' }])).toEqual([v2])
    expect(calcularPendientes([v1], [])).toEqual([v1]); expect(calcularPendientes(null, null)).toEqual([]); expect(calcularPendientes([{ tipo: 'terms' }], [])).toEqual([])
  })
  it('la aceptación se construye a nombre de la propia persona, con su clínica y el método, y recorta el agente de usuario; el servidor fija la versión y la fecha', () => {
    const a = construirAceptacion({ perfil: { id: 'u1', clinica_id: 'c1' }, documento: doc('terms', 'd1', '1.0'), agenteUsuario: 'x'.repeat(500) })
    expect(a).toMatchObject({ usuario_id: 'u1', clinica_id: 'c1', documento_id: 'd1', documento_version: '1.0', metodo: 'aceptacion_en_pantalla' }); expect(a.user_agent).toHaveLength(300); expect(a).not.toHaveProperty('aceptado_en')
    expect(construirAceptacion({ perfil: { id: 'u1' }, documento: doc('terms', 'd1') }).clinica_id).toBeNull()
  })
})

describe('pantalla AceptacionLegalObligatoria', () => {
  beforeEach(() => { h.activos = { terms: doc('terms', 't1'), privacy_integral: doc('privacy_integral', 'p1'), data_processing_agreement: doc('data_processing_agreement', 'd1') }; h.mias = []; h.registradas = []; h.falla = null; h.consultaFalla = false; vi.clearAllMocks() })
  const montar = async (perfil, props = {}) => { let r; await act(async () => { r = TestRenderer.create(React.createElement(AceptacionLegalObligatoria, { perfil, ...props }, React.createElement('div', null, 'CONTENIDO'))) }); return r }
  const marcarYAceptar = async (r) => { await act(async () => { r.root.findByType('input').props.onChange({ target: { checked: true } }) }); await act(async () => { await r.root.findAllByType('button').find((b) => /Aceptar/.test(JSON.stringify(b.props.children))).props.onClick() }) }

  it('con documentos pendientes bloquea el contenido y lista cada uno con su enlace y versión; el botón exige marcar la casilla', async () => {
    const r = await montar({ id: 'u1', rol: 'dentista', clinica_id: 'c1' }); const t = texto(r)
    expect(t).toContain('aceptacion-legal-obligatoria'); expect(t).not.toContain('CONTENIDO'); expect(t).toContain('/legal/terminos'); expect(t).toContain('/legal/privacidad'); expect(t).not.toContain('acuerdo-tratamiento-datos')
    await act(async () => { await r.root.findAllByType('button').find((b) => /Aceptar/.test(JSON.stringify(b.props.children))).props.onClick() }); expect(servicio.registrarAceptacion).not.toHaveBeenCalled()
  })
  it('el propietario ve además el Acuerdo de Tratamiento de Datos', async () => { expect(texto(await montar({ id: 'u1', rol: 'owner', clinica_id: 'c1' }))).toContain('acuerdo-tratamiento-datos') })
  it('aceptar registra UNA aceptación por documento pendiente, a nombre de la persona, y luego deja ver el contenido', async () => {
    const r = await montar({ id: 'u1', rol: 'owner', clinica_id: 'c1' }); await marcarYAceptar(r)
    expect(h.registradas.map((a) => a.documento_id).sort()).toEqual(['d1', 'p1', 't1']); expect(h.registradas.every((a) => a.usuario_id === 'u1' && a.clinica_id === 'c1' && a.metodo === 'aceptacion_en_pantalla')).toBe(true); expect(texto(r)).toContain('CONTENIDO')
  })
  it('solo se piden los documentos que faltan: quien ya aceptó los términos vigentes solo ve el aviso de privacidad', async () => {
    h.mias = [{ documento_id: 't1' }]; const r = await montar({ id: 'u1', rol: 'dentista', clinica_id: 'c1' }); const t = texto(r); expect(t).toContain('/legal/privacidad'); expect(t).not.toContain('/legal/terminos')
  })
  it('quien ya aceptó todo entra directo; con una VERSIÓN NUEVA se le vuelve a pedir', async () => {
    h.mias = [{ documento_id: 't1' }, { documento_id: 'p1' }]; expect(texto(await montar({ id: 'u1', rol: 'dentista' }))).toContain('CONTENIDO')
    h.activos.terms = doc('terms', 't2', '2.0'); const r = await montar({ id: 'u1', rol: 'dentista' }); expect(texto(r)).toContain('aceptacion-legal-obligatoria'); expect(texto(r)).toContain('"2.0"')
  })
  it('si el servidor rechaza la aceptación, la persona sigue en la pantalla con un mensaje claro y puede reintentar', async () => {
    h.falla = true; const r = await montar({ id: 'u1', rol: 'dentista' }); await marcarYAceptar(r); expect(texto(r)).toContain('No se pudo registrar tu aceptación'); expect(texto(r)).not.toContain('CONTENIDO'); expect(texto(r)).not.toContain('rls')
    h.falla = null; await act(async () => { await r.root.findAllByType('button').find((b) => /Aceptar/.test(JSON.stringify(b.props.children))).props.onClick() }); expect(texto(r)).toContain('CONTENIDO')
  })
  it('NO bloquea el trabajo clínico: sin conexión no consulta ni pregunta, y un error al consultar tampoco bloquea', async () => {
    expect(texto(await montar({ id: 'u1', rol: 'dentista' }, { sinConexion: true }))).toContain('CONTENIDO'); expect(servicio.obtenerDocumentoActivo).not.toHaveBeenCalled()
    h.consultaFalla = true; expect(texto(await montar({ id: 'u1', rol: 'dentista' }))).toContain('CONTENIDO')
  })
})
