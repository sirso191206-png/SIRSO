// Fase 4 — «Mi día»: una cita se completa SOLO finalizando la consulta clínica. Acciones administrativas libres; recuperación explícita.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TestRenderer, { act } from 'react-test-renderer'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const m = vi.hoisted(() => ({
  navigate: vi.fn(), cambiarEstado: vi.fn(), actualizarCita: vi.fn(), pendientes: [], datos: null, toastExito: vi.fn(), toastError: vi.fn(),
  perfil: { id: 'u1', rol: 'dentista', clinica_id: 'c1' }
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => m.navigate, Navigate: () => null }))
vi.mock('../../../store/useAuthStore', () => { const f = (sel) => sel({ perfil: m.perfil }); f.getState = () => ({ perfil: m.perfil }); f.subscribe = () => () => {}; return { useAuthStore: f } })
vi.mock('../../../store/useToastStore', () => ({ toastExito: (...a) => m.toastExito(...a), toastError: (...a) => m.toastError(...a) }))
vi.mock('../../../hooks/useConsultasPendientes', () => ({ useConsultasPendientes: () => ({ pendientes: m.pendientes, cargando: false, error: null, recargar: vi.fn() }) }))
vi.mock('../../../hooks/useMiDia', () => ({ useMiDia: () => ({ datos: m.datos, cargando: false, error: null, iniciarConsulta: vi.fn() }) }))
vi.mock('../../../hooks/useFuncionalidad', () => ({ useDisponibilidad: () => () => true }))
vi.mock('../../../components/ColaDeEspera', () => ({ ColaDeEspera: () => null }))
vi.mock('../../../components/ModalNuevaUrgencia', () => ({ ModalNuevaUrgencia: () => null }))
vi.mock('../../../components/onboarding/OnboardingClinica', () => ({ OnboardingClinica: () => null }))
vi.mock('../../../components/layout/AvisoDatosGuardados', () => ({ AvisoDatosGuardados: () => null }))
vi.mock('../../../services/citas', () => ({ actualizarCita: (...a) => m.actualizarCita(...a) }))

import { MiDia, ConsultasPorCompletar } from '../../../pages/MiDia.jsx'
import { PanelCita } from '../../../components/agenda/PanelCita.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const botones = (r) => r.root.findAll((n) => n.type === 'button')
const textoDe = (n) => (typeof n === 'string' ? n : (n.children ?? []).map(textoDe).join(''))
const conTexto = (r, t) => botones(r).find((b) => textoDe(b).includes(t))
const montar = (el) => { let r; act(() => { r = TestRenderer.create(el) }); return r }
const CITA = (extra = {}) => ({ id: 'cita-1', paciente_id: 'p1', estado: 'en_consulta', inicio: '2031-01-01T10:00:00Z', fin: '2031-01-01T10:30:00Z', paciente: { nombre_completo: 'Ana' }, ...extra })

beforeEach(() => {
  Object.values(m).forEach((f) => typeof f?.mockReset === 'function' && f.mockReset())
  m.pendientes = []; m.perfil = { id: 'u1', rol: 'dentista', clinica_id: 'c1' }
  m.datos = { pacienteActual: CITA(), resumen: { total: 1, atendidos: 0, enEspera: 0, porConfirmar: 0, restantes: 1 }, siguientes: [], alertasPacienteActual: null, ultimaConsultaPacienteActual: null, tratamientoActivoPacienteActual: null, saldoPacienteActual: null }
})

describe('Mi día: finalizar es un acto clínico (se hace en la consulta), no un cambio de estado', () => {
  it('el botón del paciente en consulta ABRE la consulta; NO completa la cita ni llama a ningún servicio de escritura', () => {
    const r = montar(h(MiDia))
    const b = conTexto(r, 'Continuar y finalizar consulta')
    expect(b).toBeTruthy()
    act(() => { b.props.onClick() })
    expect(m.navigate).toHaveBeenCalledWith('/consulta/cita-1'); expect(m.actualizarCita).not.toHaveBeenCalled()
    expect(botones(r).some((x) => /^\s*Finalizar consulta\s*$/.test(textoDe(x)))).toBe(false) // el botón antiguo que completaba la cita ya no existe
  })
  it('no existe ya ningún botón que complete la cita directamente en Mi día', () => {
    const html = renderToStaticMarkup(h(MiDia))
    expect(html).not.toContain('Consulta finalizada'); expect(html).toContain('Continuar y finalizar consulta')
  })
  it('«Consultas por completar»: lista las citas completadas sin nota, con acción explícita; sin ninguna no muestra nada', () => {
    expect(renderToStaticMarkup(h(ConsultasPorCompletar, { pendientes: [] }))).toBe('')
    expect(renderToStaticMarkup(h(ConsultasPorCompletar, { pendientes: undefined }))).toBe('')
    const html = renderToStaticMarkup(h(ConsultasPorCompletar, { pendientes: [{ cita_id: 'c9', paciente_nombre: 'Luis', inicio: '2031-02-01T10:00:00Z', motivo_consulta: 'Dolor' }] }))
    expect(html).toContain('Consultas por completar (1)'); expect(html).toContain('Luis'); expect(html).toContain('Dolor'); expect(html).toContain('Completar consulta'); expect(html).toContain('sin guardar su nota clínica')
  })
  it('«Completar consulta» abre la consulta de ESA cita', () => {
    const r = montar(h(ConsultasPorCompletar, { pendientes: [{ cita_id: 'c9', paciente_nombre: 'Luis', inicio: '2031-02-01T10:00:00Z' }] }))
    act(() => { conTexto(r, 'Completar consulta').props.onClick() })
    expect(m.navigate).toHaveBeenCalledWith('/consulta/c9')
  })
  it('la página muestra la sección cuando el servidor reporta pendientes', () => {
    m.pendientes = [{ cita_id: 'c9', paciente_nombre: 'Luis', inicio: '2031-02-01T10:00:00Z' }]
    expect(renderToStaticMarkup(h(MiDia))).toContain('Consultas por completar (1)')
  })
})

describe('Panel de la cita en la agenda', () => {
  const panel = (cita, extra = {}) => { const onCambiarEstado = vi.fn().mockResolvedValue(undefined); const r = montar(h(PanelCita, { cita, onCerrar: vi.fn(), onCambiarEstado, onReagendar: vi.fn(), onDesagendar: vi.fn(), ...extra })); return { r, onCambiarEstado } }
  it('en consulta: ya NO hay «Completar»; «Finalizar consulta» abre la consulta y NO cambia el estado', () => {
    const { r, onCambiarEstado } = panel(CITA())
    expect(conTexto(r, 'Completar')).toBeUndefined()
    act(() => { conTexto(r, 'Finalizar consulta').props.onClick() })
    expect(m.navigate).toHaveBeenCalledWith('/consulta/cita-1'); expect(onCambiarEstado).not.toHaveBeenCalled()
  })
  it('NINGUNA acción del panel pide el estado «completada», en ningún estado de la cita', async () => {
    for (const estado of ['pendiente_confirmar', 'agendada', 'confirmada', 'en_espera', 'en_consulta']) {
      const { r, onCambiarEstado } = panel(CITA({ estado }))
      for (const b of botones(r)) { try { await act(async () => { await b.props.onClick?.() }) } catch { /* acciones que abren formularios */ } }
      for (const llamada of onCambiarEstado.mock.calls) expect(llamada[1], `estado ${estado}`).not.toBe('completada')
    }
  })
  it('inasistencia: «No asistió» es una acción administrativa (no genera notas) disponible cuando ya llegó la hora y la cita no está en consulta ni finalizada', async () => {
    const PASADA = { inicio: '2020-01-01T10:00:00Z', fin: '2020-01-01T10:30:00Z' }
    for (const estado of ['pendiente_confirmar', 'agendada', 'confirmada', 'en_espera']) {
      const { r, onCambiarEstado } = panel(CITA({ estado, ...PASADA }))
      const b = conTexto(r, 'No asistió'); expect(b, estado).toBeTruthy()
      await act(async () => { await b.props.onClick() })
      expect(onCambiarEstado).toHaveBeenCalledWith('cita-1', 'no_asistio')
    }
    // Una cita futura todavía no puede marcarse como inasistencia.
    expect(conTexto(panel(CITA({ estado: 'agendada' })).r, 'No asistió')).toBeUndefined()
    expect(conTexto(panel(CITA({ estado: 'en_consulta' })).r, 'No asistió')).toBeUndefined()
    expect(conTexto(panel(CITA({ estado: 'cancelada' })).r, 'No asistió')).toBeUndefined()
  })
  it('las demás acciones administrativas siguen: confirmar, en espera, iniciar consulta y cancelar', async () => {
    const a = panel(CITA({ estado: 'pendiente_confirmar' })); await act(async () => { await conTexto(a.r, 'Confirmar').props.onClick() }); expect(a.onCambiarEstado).toHaveBeenCalledWith('cita-1', 'confirmada')
    const b = panel(CITA({ estado: 'agendada' })); await act(async () => { await conTexto(b.r, 'En espera').props.onClick() }); expect(b.onCambiarEstado).toHaveBeenCalledWith('cita-1', 'en_espera')
    await act(async () => { await conTexto(b.r, 'Iniciar consulta').props.onClick() }); expect(b.onCambiarEstado).toHaveBeenCalledWith('cita-1', 'en_consulta')
    // Cancelar pide confirmación: el primer clic solo abre el aviso.
    const c = panel(CITA({ estado: 'agendada' }))
    await act(async () => { await conTexto(c.r, 'Cancelar cita').props.onClick() }); expect(c.onCambiarEstado).not.toHaveBeenCalled()
    await act(async () => { await conTexto(c.r, 'Sí, cancelar la cita').props.onClick() }); expect(c.onCambiarEstado).toHaveBeenCalledWith('cita-1', 'cancelada')
  })
  it('una cita COMPLETADA SIN NOTA (según el servidor) muestra un estado recuperable y «Completar consulta»', () => {
    m.pendientes = [{ cita_id: 'cita-1' }]
    const { r } = panel(CITA({ estado: 'completada' }))
    expect(textoDe(r.root)).toContain('Consulta sin nota clínica')
    act(() => { conTexto(r, 'Completar consulta').props.onClick() })
    expect(m.navigate).toHaveBeenCalledWith('/consulta/cita-1')
  })
  it('una cita completada que NO está en la lista de pendientes no muestra el aviso (ya tiene nota, o el rol/plan no aplica)', () => {
    m.pendientes = [{ cita_id: 'otra' }]
    expect(textoDe(panel(CITA({ estado: 'completada' })).r.root)).not.toContain('Consulta sin nota clínica')
  })
})

describe('guardia de arquitectura: ningún código del frontend completa una cita por fuera de la consulta', () => {
  const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../../..')
  const fuentes = (dir) => readdirSync(dir).flatMap((n) => { const ruta = join(dir, n); if (statSync(ruta).isDirectory()) return n === '__tests__' ? [] : fuentes(ruta); return /\.(js|jsx)$/.test(n) && !/\.test\./.test(n) ? [ruta] : [] })
  const FUENTES = fuentes(RAIZ).map((ruta) => ({ ruta: ruta.replace(RAIZ, 'src'), texto: readFileSync(ruta, 'utf8') }))
  it('la guardia revisa archivos (no es vacía)', () => { expect(FUENTES.length).toBeGreaterThan(100) })
  it('no hay `estado: "completada"` escrito en una actualización, ni `cambiarEstado/onCambiarEstado/encolarCambioEstadoCita(…, "completada")`', () => {
    const escrituras = /estado\s*:\s*['"]completada['"]|(?:cambiarEstado|onCambiarEstado|encolarCambioEstadoCita)\s*\(\s*[\w.]+\s*,\s*['"]completada['"]/
    const malos = FUENTES.filter((f) => escrituras.test(f.texto)).map((f) => f.ruta)
    expect(malos).toEqual([])
  })
  it('el único camino que completa es la RPC fn_finalizar_consulta (servicios/consultas.js)', () => {
    expect(FUENTES.find((f) => f.ruta.replace(/\\/g, '/').endsWith('services/consultas.js')).texto).toContain("rpc('fn_finalizar_consulta'")
  })
})
