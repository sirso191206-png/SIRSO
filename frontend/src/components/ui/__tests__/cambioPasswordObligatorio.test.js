// Cambio OBLIGATORIO de la contraseña temporal (migración 103): validación, pantalla y guardia de rutas. LIMITE: prueba de interfaz sin navegador real; el bloqueo REAL
// de datos y funciones lo prueban las baterías SQL, PostgREST y las pruebas de las Edge Functions.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'

const h = vi.hoisted(() => ({ estado: {} }))
vi.mock('../../../store/useAuthStore', () => { const useAuthStore = (sel) => (typeof sel === 'function' ? sel(h.estado) : h.estado); useAuthStore.getState = () => h.estado; return { useAuthStore } })
vi.mock('../../../hooks/useEscucharCierreSesion', () => ({ useEscucharCierreSesion: () => {} }))
vi.mock('../../../hooks/useConexion', () => ({ useConexion: () => true }))
vi.mock('../../../store/useToastStore', () => ({ toastError: () => {} }))
vi.mock('../../../services/sesiones', () => ({ mensajeSesionCerrada: () => '' }))
vi.mock('../../auth/PantallaDesbloqueoPin', () => ({ PantallaDesbloqueoPin: () => React.createElement('div', null, 'PIN') }))
vi.mock('../../layout/AccesoNoAutorizado', () => ({ AccesoNoAutorizado: () => React.createElement('div', null, 'NO-AUTORIZADO') }))
vi.mock('../../planes/AvisoSuscripcion', () => ({ AvisoSuscripcion: () => React.createElement('div', null, 'AVISO') }))
vi.mock('../../planes/BloqueoPorPago', () => ({ BloqueoPorPago: () => React.createElement('div', null, 'BLOQUEO-PAGO') }))
vi.mock('../../../hooks/useSuscripcionAlDia', () => ({ useSuscripcionAlDia: () => {} }))
vi.mock('../../../hooks/useFuncionalidad', () => ({ usePlanActual: () => ({ suscripcion: h.suscripcion ?? null }) }))
vi.mock('../../layout/Sidebar', () => ({ Sidebar: () => React.createElement('nav', null, 'MENU-LATERAL') }))
vi.mock('../../../lib/accesoPorRol', () => ({ puedeEntrarARuta: () => true, rutaInicioPorRol: () => '/' }))

import { validarCambioPassword, mensajeErrorCambioPassword } from '../../../lib/cambioPasswordObligatorio.js'
import { CambioPasswordObligatorio } from '../../auth/CambioPasswordObligatorio.jsx'
import { ProtectedRoute } from '../../layout/ProtectedRoute.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const texto = (r) => JSON.stringify(r.toJSON())

describe('validarCambioPassword', () => {
  it('acepta una contraseña válida y rechaza corta, larga, distinta y no textual', () => {
    expect(validarCambioPassword({ nueva: 'una-clave-larga', confirmar: 'una-clave-larga' })).toBeNull()
    expect(validarCambioPassword({ nueva: 'corta', confirmar: 'corta' })).toMatch(/al menos 8/); expect(validarCambioPassword({ nueva: 'x'.repeat(129), confirmar: 'x'.repeat(129) })).toMatch(/más de 128/)
    expect(validarCambioPassword({ nueva: 'una-clave-larga', confirmar: 'otra-clave-larga' })).toMatch(/no coinciden/); expect(validarCambioPassword({ nueva: ['a'], confirmar: ['a'] })).toMatch(/no válida/); expect(validarCambioPassword()).toMatch(/al menos 8/)
  })
})
describe('mensajeErrorCambioPassword — nunca detalles técnicos', () => {
  it.each([['La nueva contraseña debe ser distinta de la contraseña temporal.', /distinta de la contraseña temporal/], ['Token inválido', /sesión expiró/], ['Falta autenticación', /sesión expiró/],
    ['Tu clínica está suspendida. No puedes cambiar tu contraseña en este momento.', /suspendida/], ['Failed to fetch', /conexión/], ['Tu contraseña se cambió, pero no se pudo confirmar. Vuelve a intentarlo', /misma contraseña nueva/],
    ['relation "usuarios" does not exist', /No se pudo cambiar/]])('%s', (m, esperado) => { const t = mensajeErrorCambioPassword(new Error(m)); expect(t).toMatch(esperado); expect(t).not.toMatch(/relation|usuarios"|stack/i) })
})

describe('pantalla CambioPasswordObligatorio', () => {
  let cambiar, recargar, logout
  beforeEach(() => { cambiar = vi.fn(async () => {}); recargar = vi.fn(async () => { h.estado.perfil = { ...h.estado.perfil, debe_cambiar_password: false } }); logout = vi.fn(); h.estado = { cambiarPassword: cambiar, recargarPerfil: recargar, logout, perfil: { debe_cambiar_password: true } } })
  const montar = () => { let r; act(() => { r = TestRenderer.create(React.createElement(CambioPasswordObligatorio)) }); return r }
  const escribir = (r, id, valor) => act(() => { r.root.findByProps({ id }).props.onChange({ target: { value: valor } }) })
  const enviar = async (r) => { await act(async () => { await r.root.findByType('form').props.onSubmit({ preventDefault() {} }) }) }
  it('contraseñas distintas o cortas: no se llama al servidor y se muestra el motivo', async () => {
    const r = montar(); escribir(r, 'pw-nueva', 'una-clave-larga'); escribir(r, 'pw-confirmar', 'otra-distinta-1'); await enviar(r); expect(cambiar).not.toHaveBeenCalled(); expect(texto(r)).toContain('no coinciden')
    escribir(r, 'pw-nueva', 'corta'); escribir(r, 'pw-confirmar', 'corta'); await enviar(r); expect(cambiar).not.toHaveBeenCalled(); expect(texto(r)).toContain('al menos 8')
  })
  it('cambio exitoso: llama al servidor con la nueva contraseña, VUELVE A LEER el perfil y solo entonces termina', async () => {
    const r = montar(); escribir(r, 'pw-nueva', 'una-clave-larga'); escribir(r, 'pw-confirmar', 'una-clave-larga'); await enviar(r)
    expect(cambiar).toHaveBeenCalledTimes(1); expect(cambiar).toHaveBeenCalledWith('una-clave-larga'); expect(recargar).toHaveBeenCalledTimes(1); expect(h.estado.perfil.debe_cambiar_password).toBe(false); expect(texto(r)).not.toContain('role":"alert')
  })
  it('si el servidor FALLA, sigue restringido: muestra un mensaje legible, no recarga el perfil como éxito y se puede reintentar', async () => {
    cambiar.mockRejectedValueOnce(new Error('relation "usuarios" does not exist')); const r = montar(); escribir(r, 'pw-nueva', 'una-clave-larga'); escribir(r, 'pw-confirmar', 'una-clave-larga'); await enviar(r)
    expect(texto(r)).toContain('No se pudo cambiar la contraseña'); expect(texto(r)).not.toContain('relation'); expect(recargar).not.toHaveBeenCalled(); expect(h.estado.perfil.debe_cambiar_password).toBe(true)
    await enviar(r); expect(cambiar).toHaveBeenCalledTimes(2)   // reintento
  })
  it('si el servidor responde bien pero el indicador SIGUE pendiente, NO se da por cambiada: error y sigue restringido', async () => {
    recargar.mockImplementation(async () => {}); const r = montar(); escribir(r, 'pw-nueva', 'una-clave-larga'); escribir(r, 'pw-confirmar', 'una-clave-larga'); await enviar(r)
    expect(h.estado.perfil.debe_cambiar_password).toBe(true); expect(texto(r)).toContain('No se pudo cambiar la contraseña')
  })
  it('permite cerrar sesión en cualquier momento', () => { const r = montar(); act(() => { r.root.findAllByType('button').find((b) => b.props.onClick === logout).props.onClick() }); expect(logout).toHaveBeenCalledTimes(1) })
})

describe('ProtectedRoute con el cambio de contraseña pendiente', () => {
  const base = (perfil) => ({ session: { user: { id: 'u1' } }, perfil, clinicaEstado: 'activa', cargando: false, logout: vi.fn(), refrescarEstadoClinica: vi.fn(), sesionActualId: null, modoOffline: false, desbloqueoOffline: null, reanudarSesionOnline: vi.fn(async () => ({})), cambiarPassword: vi.fn(), recargarPerfil: vi.fn() })
  const montar = (ruta) => { let r; act(() => { r = TestRenderer.create(React.createElement(MemoryRouter, { initialEntries: [ruta] }, React.createElement(ProtectedRoute, null, React.createElement('div', null, 'CONTENIDO-PROTEGIDO')))) }); return r }
  it.each(['/', '/pacientes', '/agenda', '/pacientes/123/expediente', '/admin'])('con el cambio pendiente, la URL %s muestra SOLO la pantalla de cambio (sin menú ni contenido)', (ruta) => {
    h.estado = base({ id: 'u1', rol: 'owner', debe_cambiar_password: true }); const t = texto(montar(ruta)); expect(t).toContain('cambio-password-obligatorio'); expect(t).not.toContain('CONTENIDO-PROTEGIDO'); expect(t).not.toContain('MENU-LATERAL')
  })
  it('CONTROL: un usuario SIN el cambio pendiente (o un perfil anterior sin la columna) entra normalmente y no queda bloqueado', () => {
    for (const perfil of [{ id: 'u1', rol: 'dentista', debe_cambiar_password: false }, { id: 'u1', rol: 'dentista' }, { id: 'u1', rol: 'owner', es_super_admin: true, debe_cambiar_password: false }]) {
      h.estado = base(perfil); const t = texto(montar('/pacientes')); expect(t).toContain('CONTENIDO-PROTEGIDO'); expect(t).toContain('MENU-LATERAL'); expect(t).not.toContain('cambio-password-obligatorio')
    }
  })
  it('una clínica suspendida sigue mostrando su aviso (no se altera ese flujo); sin sesión no hay pantalla de cambio', () => {
    h.estado = base({ id: 'u1', rol: 'owner', debe_cambiar_password: true }); h.estado.clinicaEstado = 'suspendida'; expect(texto(montar('/'))).toContain('Clínica suspendida')
    h.estado = { ...base(null), session: null }; expect(texto(montar('/'))).not.toContain('cambio-password-obligatorio')
  })
  it('115: clínica bloqueada por falta de pago → solo la pantalla de pago (sin menú ni contenido); el superadmin entra normal', () => {
    h.suscripcion = { bloqueada_por_pago: true, fecha_fin: '2026-10-01' }
    h.estado = base({ id: 'u1', rol: 'owner' }); let t = texto(montar('/pacientes'))
    expect(t).toContain('BLOQUEO-PAGO'); expect(t).not.toContain('CONTENIDO-PROTEGIDO'); expect(t).not.toContain('MENU-LATERAL')
    h.estado = base({ id: 'u1', rol: 'owner', es_super_admin: true }); t = texto(montar('/pacientes'))
    expect(t).toContain('CONTENIDO-PROTEGIDO'); expect(t).not.toContain('BLOQUEO-PAGO')
    h.suscripcion = null
  })
  it('la guardia está colocada ANTES de renderizar el menú y el contenido en el código fuente', () => {
    const src = readFileSync(new URL('../../layout/ProtectedRoute.jsx', import.meta.url), 'utf8'); expect(src.indexOf('debe_cambiar_password')).toBeGreaterThan(-1)
    expect(src.indexOf('debe_cambiar_password')).toBeLessThan(src.indexOf('<Sidebar ')); expect(src.indexOf('debe_cambiar_password')).toBeLessThan(src.indexOf('{autorizado ? children'))
  })
})
