// Decisión 3 (migración 094): corregir o reabrir una consulta YA completada — matriz por rol, motivo obligatorio y sin acciones duplicadas.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TestRenderer, { act } from 'react-test-renderer'

const m = vi.hoisted(() => ({ perfil: { id: 'u1', rol: 'owner' }, corregir: vi.fn(), exito: vi.fn(), error: vi.fn(), navigate: vi.fn(), rpc: vi.fn() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => m.navigate }))
vi.mock('../../../store/useAuthStore', () => { const f = (sel) => sel({ perfil: m.perfil }); f.getState = () => ({ perfil: m.perfil }); f.subscribe = () => () => {}; return { useAuthStore: f } })
vi.mock('../../../store/useToastStore', () => ({ toastExito: (...a) => m.exito(...a), toastError: (...a) => m.error(...a) }))
vi.mock('../../../services/citas', () => ({ corregirEstadoCita: (...a) => m.corregir(...a) }))
vi.mock('../../../hooks/useConsultasPendientes', () => ({ useConsultasPendientes: () => ({ pendientes: [], cargando: false, error: null, recargar: vi.fn() }) }))

import { CorregirCitaCompletada, opcionesDeCorreccion, MOTIVO_MINIMO } from '../../../components/agenda/CorregirCitaCompletada.jsx'
import { PanelCita } from '../../../components/agenda/PanelCita.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const textoDe = (n) => (typeof n === 'string' ? n : (n.children ?? []).map(textoDe).join(''))
const botones = (r) => r.root.findAll((n) => n.type === 'button')
const conTexto = (r, t) => botones(r).find((b) => textoDe(b).includes(t))
const montar = (el) => { let r; act(() => { r = TestRenderer.create(el) }); return r }
const CITA = (extra = {}) => ({ id: 'cita-1', paciente_id: 'p1', dentista_id: 'u1', estado: 'completada', inicio: '2031-01-01T10:00:00Z', fin: '2031-01-01T10:30:00Z', paciente: { nombre_completo: 'Ana' }, ...extra })
const MOTIVO = 'Se finalizó por error: era otro paciente'
beforeEach(() => { Object.values(m).forEach((f) => typeof f?.mockReset === 'function' && f.mockReset()); m.perfil = { id: 'u1', rol: 'owner' } })

describe('matriz de opciones por rol (la base de datos es quien la hace cumplir; aquí no se ofrece lo que sería rechazado)', () => {
  it('propietario: reabrir, cancelar o marcar inasistencia', () => { expect(opcionesDeCorreccion('owner', false).map((o) => o.valor)).toEqual(['agendada', 'cancelada', 'no_asistio']) })
  it('odontólogo RESPONSABLE: solo reabrir; un odontólogo que no es el responsable, recepción, asistente o sin rol: nada', () => {
    expect(opcionesDeCorreccion('dentista', true).map((o) => o.valor)).toEqual(['agendada'])
    for (const [rol, resp] of [['dentista', false], ['recepcion', true], ['asistente', true], [undefined, true], [null, false]]) expect(opcionesDeCorreccion(rol, resp), String(rol)).toEqual([])
  })
})

describe('CorregirCitaCompletada', () => {
  it('solo aparece en una cita COMPLETADA y solo para quien puede; recepción, asistente y el dentista ajeno no ven nada', () => {
    expect(renderToStaticMarkup(h(CorregirCitaCompletada, { cita: CITA() }))).toContain('Corregir consulta')
    expect(renderToStaticMarkup(h(CorregirCitaCompletada, { cita: CITA({ estado: 'en_consulta' }) }))).toBe('')
    expect(renderToStaticMarkup(h(CorregirCitaCompletada, { cita: CITA({ estado: 'cancelada' }) }))).toBe('')
    for (const [rol, extra] of [['recepcion', {}], ['asistente', {}], ['dentista', { dentista_id: 'otro' }]]) { m.perfil = { id: 'u1', rol }; expect(renderToStaticMarkup(h(CorregirCitaCompletada, { cita: CITA(extra) })), rol).toBe('') }
    m.perfil = { id: 'u1', rol: 'dentista' }; expect(renderToStaticMarkup(h(CorregirCitaCompletada, { cita: CITA() }))).toContain('Corregir consulta')
  })
  it('el motivo es OBLIGATORIO: con menos de 10 caracteres el botón de registrar está deshabilitado y no se llama a nada', async () => {
    const r = montar(h(CorregirCitaCompletada, { cita: CITA() })); act(() => { conTexto(r, 'Corregir consulta').props.onClick() })
    const registrar = () => conTexto(r, 'Registrar corrección')
    expect(registrar().props.disabled).toBe(true)
    act(() => { r.root.findByType('textarea').props.onChange({ target: { value: '   corto   ' } }) }); expect(registrar().props.disabled).toBe(true)
    await act(async () => { await registrar().props.onClick() }); expect(m.corregir).not.toHaveBeenCalled()
    act(() => { r.root.findByType('textarea').props.onChange({ target: { value: MOTIVO } }) }); expect(registrar().props.disabled).toBe(false)
  })
  it('registra con el estado elegido y el motivo SIN espacios sobrantes; avisa y recarga; un DOBLE CLIC envía una sola solicitud', async () => {
    let resolver; m.corregir.mockReturnValue(new Promise((ok) => { resolver = ok }))
    const onCorregida = vi.fn(); const r = montar(h(CorregirCitaCompletada, { cita: CITA(), onCorregida })); act(() => { conTexto(r, 'Corregir consulta').props.onClick() })
    act(() => { r.root.findByType('select').props.onChange({ target: { value: 'cancelada' } }) }); act(() => { r.root.findByType('textarea').props.onChange({ target: { value: `  ${MOTIVO}  ` } }) })
    let p1, p2; await act(async () => { p1 = conTexto(r, 'Registrar corrección').props.onClick(); p2 = conTexto(r, 'Registrar corrección')?.props.onClick?.(); resolver({ ok: true }); await Promise.all([p1, p2]) })
    expect(m.corregir).toHaveBeenCalledTimes(1); expect(m.corregir).toHaveBeenCalledWith({ citaId: 'cita-1', estado: 'cancelada', motivo: MOTIVO })
    expect(m.exito).toHaveBeenCalledWith('Corrección registrada.'); expect(onCorregida).toHaveBeenCalledTimes(1)
  })
  it('un rechazo del servidor se muestra con SU mensaje, el formulario se conserva (con el motivo escrito) y no se avisa de éxito', async () => {
    m.corregir.mockRejectedValue(Object.assign(new Error('Solo el odontólogo responsable de esta consulta (o el propietario) puede corregirla.'), { codigo: 'CITA_DE_OTRO_DENTISTA' }))
    const onCorregida = vi.fn(); const r = montar(h(CorregirCitaCompletada, { cita: CITA(), onCorregida })); act(() => { conTexto(r, 'Corregir consulta').props.onClick() })
    act(() => { r.root.findByType('textarea').props.onChange({ target: { value: MOTIVO } }) }); await act(async () => { await conTexto(r, 'Registrar corrección').props.onClick() })
    expect(m.error).toHaveBeenCalledWith('Solo el odontólogo responsable de esta consulta (o el propietario) puede corregirla.'); expect(m.exito).not.toHaveBeenCalled(); expect(onCorregida).not.toHaveBeenCalled()
    expect(r.root.findByType('textarea').props.value).toBe(MOTIVO); expect(conTexto(r, 'Registrar corrección').props.disabled).toBe(false)
  })
})

describe('integración en el panel de la cita', () => {
  const panel = (cita, extra = {}) => { const props = { cita, onCerrar: vi.fn(), onCambiarEstado: vi.fn(), onReagendar: vi.fn(), onDesagendar: vi.fn(), onCorregida: vi.fn().mockResolvedValue(undefined), ...extra }; return { r: montar(h(PanelCita, props)), props } }
  it('en una cita completada el propietario ve «Corregir consulta»; en una que NO está completada no', () => {
    expect(conTexto(panel(CITA()).r, 'Corregir consulta')).toBeTruthy(); expect(conTexto(panel(CITA({ estado: 'en_consulta' })).r, 'Corregir consulta')).toBeUndefined()
  })
  it('recepción no ve «Corregir consulta» aunque la cita esté completada', () => { m.perfil = { id: 'u1', rol: 'recepcion' }; expect(conTexto(panel(CITA()).r, 'Corregir consulta')).toBeUndefined() })
  it('tras corregir, el panel recarga la agenda y se cierra', async () => {
    m.corregir.mockResolvedValue({ ok: true }); const { r, props } = panel(CITA()); act(() => { conTexto(r, 'Corregir consulta').props.onClick() })
    act(() => { r.root.findByType('textarea').props.onChange({ target: { value: MOTIVO } }) }); await act(async () => { await conTexto(r, 'Registrar corrección').props.onClick() })
    expect(props.onCorregida).toHaveBeenCalledTimes(1); expect(props.onCerrar).toHaveBeenCalledTimes(1)
  })
  it('NINGÚN botón del panel de una cita completada cambia el estado directamente (todo pasa por la corrección con motivo)', async () => {
    const { r, props } = panel(CITA()); for (const b of botones(r)) { try { await act(async () => { await b.props.onClick?.() }) } catch { /* abre el formulario */ } }
    expect(props.onCambiarEstado).not.toHaveBeenCalled(); expect(props.onReagendar).not.toHaveBeenCalled(); expect(MOTIVO_MINIMO).toBe(10)
  })
})
