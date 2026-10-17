// handleFinalizar con un renderizador real de React: una sola llamada transaccional, doble clic, reintentos con los MISMOS ids,
// errores comprensibles, plan sin notas y modo sin conexión.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createElement as h } from 'react'
import TestRenderer, { act } from 'react-test-renderer'

const m = vi.hoisted(() => ({
  navigate: vi.fn(), toastExito: vi.fn(), toastError: vi.fn(), encolar: vi.fn(), obtenerCita: vi.fn(), finalizar: vi.fn(), completar: vi.fn(), avanzar: vi.fn(),
  notas: { valor: true }, perfil: { id: 'u1', clinica_id: 'c1', rol: 'dentista' }, expediente: { id: 'exp1' }
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => m.navigate }))
vi.mock('../../../services/citas', () => ({ obtenerCitaPorId: (...a) => m.obtenerCita(...a), actualizarCita: vi.fn(), avanzarSiguienteEnEspera: (...a) => m.avanzar(...a) }))
vi.mock('../../../services/consultas', () => ({ finalizarConsulta: (...a) => m.finalizar(...a), completarConsultaPendiente: (...a) => m.completar(...a) }))
vi.mock('../../../services/expedientes', () => ({ obtenerDiagnosticosFrecuentes: async () => [], crearNotaClinica: vi.fn() }))
vi.mock('../../../hooks/useExpediente', () => ({ useExpediente: () => ({ expediente: m.expediente }) }))
vi.mock('../../../hooks/useTratamientos', () => ({ useTratamientos: () => ({ tratamientos: [], agregar: vi.fn() }) }))
vi.mock('../../../hooks/useCatalogoTratamientos', () => ({ useCatalogoTratamientos: () => ({ catalogo: [] }) }))
vi.mock('../../../hooks/useSignosVitales', () => ({ useSignosVitales: () => ({ registros: [], agregar: vi.fn() }) }))
vi.mock('../../../hooks/useRecetas', () => ({ useRecetas: () => ({ recetas: [], agregar: vi.fn() }) }))
vi.mock('../../../hooks/useFuncionalidad', () => ({ useFuncionalidad: () => m.notas.valor }))
vi.mock('../../../store/useAuthStore', () => ({ useAuthStore: (sel) => sel({ perfil: m.perfil }) }))
vi.mock('../../../store/useSucursalStore', () => ({ useSucursalStore: { getState: () => ({ sucursalActualId: 's1' }) } }))
vi.mock('../../../store/useToastStore', () => ({ toastExito: (...a) => m.toastExito(...a), toastError: (...a) => m.toastError(...a) }))
vi.mock('../../../lib/colaOffline', () => ({ encolarOperacion: (...a) => m.encolar(...a) }))

import { useConsultaForm } from '../../../hooks/useConsultaForm.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const CITA = { id: 'cita-1', paciente_id: 'pac-1', dentista_id: 'u1', motivo_consulta: 'Dolor', actualizado_en: '2031-01-01T10:00:00.123456+00:00' }
const asincrono = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const diferido = () => { let ok, ko; const p = new Promise((a, b) => { ok = a; ko = b }); return { p, ok, ko } }

async function montar() {
  let ultimo
  function Sonda() { ultimo = useConsultaForm('cita-1'); return null }
  let r; act(() => { r = TestRenderer.create(h(Sonda)) }); await asincrono()
  return { get f() { return ultimo }, desmontar: () => act(() => r.unmount()) }
}

describe('useConsultaForm.handleFinalizar', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => typeof f?.mockReset === 'function' && f.mockReset())
    m.notas.valor = true; m.expediente = { id: 'exp1' }
    m.obtenerCita.mockResolvedValue({ ...CITA })
    vi.stubGlobal('navigator', { onLine: true })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('EN LÍNEA: UNA sola llamada transaccional con la cita, el motivo y la nota (sin tocar tablas sueltas), y navega al terminar', async () => {
    m.finalizar.mockResolvedValue({ ok: true })
    const s = await montar()
    act(() => { s.f.setNotaContenido('Se atendió'); s.f.setDiagnostico('Caries') })
    await act(async () => { await s.f.handleFinalizar() })
    expect(m.finalizar).toHaveBeenCalledTimes(1)
    const arg = m.finalizar.mock.calls[0][0]
    expect(arg).toMatchObject({ citaId: 'cita-1', motivo: 'Dolor', seguimiento: null })
    expect(arg.nota).toMatchObject({ contenido: 'Se atendió', diagnostico: 'Caries', tipo: 'consulta' })
    expect(arg.nota.id).toMatch(/^[0-9a-f-]{36}$/)
    // El cliente NO decide de quién ni de dónde es la nota: no manda expediente_id, usuario_id ni cita_id.
    expect(arg.nota).not.toHaveProperty('expediente_id'); expect(arg.nota).not.toHaveProperty('usuario_id'); expect(arg.nota).not.toHaveProperty('cita_id')
    expect(m.toastExito).toHaveBeenCalledWith('Consulta guardada correctamente.'); expect(m.navigate).toHaveBeenCalledWith('/')
    expect(s.f.finalizada).toBe(true)
  })

  it('si el servidor responde `ya_finalizada` (doble clic o respuesta perdida, YA verificada contra lo enviado) se dice tal cual, sin anunciar un guardado nuevo', async () => {
    m.finalizar.mockResolvedValue({ ok: true, ya_finalizada: true, verificado: { nota: true, seguimiento: false } })
    const s = await montar()
    await act(async () => { await s.f.handleFinalizar() })
    expect(m.toastExito).toHaveBeenCalledWith('La consulta ya estaba guardada correctamente.'); expect(m.toastExito).not.toHaveBeenCalledWith('Consulta guardada correctamente.'); expect(s.f.finalizada).toBe(true)
  })

  it('un FINALIZACION_INCOMPLETA del servidor se muestra tal cual (qué falta) y NO se marca como finalizada ni se navega', async () => {
    m.finalizar.mockRejectedValue(Object.assign(new Error('La cita ya estaba completada, pero esta operación no tiene confirmado: la nota clínica. No se escribió nada.'), { codigo: 'FINALIZACION_INCOMPLETA' }))
    const s = await montar()
    await act(async () => { await s.f.handleFinalizar() })
    expect(m.toastError).toHaveBeenCalledWith(expect.stringMatching(/no tiene confirmado: la nota clínica/)); expect(s.f.finalizada).toBe(false); expect(m.navigate).not.toHaveBeenCalled()
  })

  it('DOBLE CLIC: dos pulsaciones seguidas (antes de que React refleje "guardando") hacen UNA sola llamada', async () => {
    const d = diferido(); m.finalizar.mockReturnValue(d.p)
    const s = await montar()
    let p1, p2
    await act(async () => { p1 = s.f.handleFinalizar(); p2 = s.f.handleFinalizar(); d.ok({ ok: true }); await Promise.all([p1, p2]) })
    expect(m.finalizar).toHaveBeenCalledTimes(1)
    expect(m.toastExito).toHaveBeenCalledTimes(1)
  })

  it('una vez finalizada, volver a pulsar no hace nada (ni llamada, ni segunda navegación)', async () => {
    m.finalizar.mockResolvedValue({ ok: true })
    const s = await montar()
    await act(async () => { await s.f.handleFinalizar() })
    await act(async () => { await s.f.handleFinalizar() })
    expect(m.finalizar).toHaveBeenCalledTimes(1); expect(m.navigate).toHaveBeenCalledTimes(1)
  })

  it('REINTENTO tras un error: manda los MISMOS ids de nota y de seguimiento — un reintento nunca duplica — y el error se explica con el mensaje claro', async () => {
    const errorHorario = Object.assign(new Error('El horario del seguimiento ya está ocupado para este odontólogo. Elige otra fecha u hora.'), { codigo: 'HORARIO_OCUPADO' })
    m.finalizar.mockRejectedValueOnce(errorHorario).mockResolvedValueOnce({ ok: true })
    const s = await montar()
    act(() => { s.f.setProgramarSeguimiento(true); s.f.setSeguimiento({ fecha: '2031-02-01', hora: '10:00', duracion: 30, motivo: 'Control' }) })
    await act(async () => { await s.f.handleFinalizar() })
    expect(m.toastError).toHaveBeenCalledWith('El horario del seguimiento ya está ocupado para este odontólogo. Elige otra fecha u hora.')
    expect(s.f.finalizada).toBe(false); expect(m.navigate).not.toHaveBeenCalled(); expect(s.f.guardando).toBe(false)

    act(() => { s.f.setSeguimiento({ fecha: '2031-02-02', hora: '11:00', duracion: 30, motivo: 'Control' }) }) // corrige el horario
    await act(async () => { await s.f.handleFinalizar() })
    const [primero, segundo] = m.finalizar.mock.calls.map(([a]) => a)
    expect(segundo.nota.id).toBe(primero.nota.id); expect(segundo.seguimiento.id).toBe(primero.seguimiento.id)
    expect(segundo.seguimiento.inicio).not.toBe(primero.seguimiento.inicio) // el nuevo horario sí viaja
    expect(s.f.finalizada).toBe(true)
  })

  it('un error desconocido se muestra sin texto técnico, y los datos capturados siguen en el formulario', async () => {
    m.finalizar.mockRejectedValue(new Error('new row violates row-level security policy for table "notas_clinicas"')) // técnico: NO debe llegar a la pantalla
    const s = await montar()
    act(() => { s.f.setNotaContenido('Nota larga que no se debe perder') })
    await act(async () => { await s.f.handleFinalizar() })
    expect(m.toastError.mock.calls[0][0]).toMatch(/Tus datos siguen en pantalla/)
    expect(m.toastError.mock.calls[0][0]).not.toMatch(/row-level|notas_clinicas|policy/i)
    expect(s.f.notaContenido).toBe('Nota larga que no se debe perder')
  })

  it('un seguimiento incompleto se rechaza ANTES de llamar a nada', async () => {
    const s = await montar()
    act(() => { s.f.setProgramarSeguimiento(true) })
    await act(async () => { await s.f.handleFinalizar() })
    expect(m.toastError).toHaveBeenCalledWith('Falta la fecha u hora del seguimiento.'); expect(m.finalizar).not.toHaveBeenCalled(); expect(m.encolar).not.toHaveBeenCalled()
  })

  it('PLAN SIN NOTAS CLÍNICAS: la consulta se cierra igual, con nota null', async () => {
    m.notas.valor = false; m.finalizar.mockResolvedValue({ ok: true })
    const s = await montar()
    await act(async () => { await s.f.handleFinalizar() })
    expect(m.finalizar.mock.calls[0][0].nota).toBeNull(); expect(s.f.finalizada).toBe(true)
  })

  it('SIN CONEXIÓN: no llama al servidor; encola UNA operación con los mismos ids, el candado de concurrencia y el expediente', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const s = await montar()
    act(() => { s.f.setNotaContenido('offline'); s.f.setProgramarSeguimiento(true); s.f.setSeguimiento({ fecha: '2031-03-01', hora: '09:00', duracion: 30, motivo: '' }) })
    await act(async () => { await s.f.handleFinalizar() })
    expect(m.finalizar).not.toHaveBeenCalled()
    expect(m.encolar).toHaveBeenCalledTimes(1)
    const op = m.encolar.mock.calls[0][0]
    expect(op).toMatchObject({ id: 'finalizar_consulta_cita-1', tipo: 'finalizar_consulta', entidadId: 'cita-1', claveIdempotencia: 'finalizar_consulta_cita-1', sucursalId: 's1' })
    expect(op.payload).toMatchObject({ citaId: 'cita-1', motivo: 'Dolor', actualizadoEnEsperado: CITA.actualizado_en })
    expect(op.payload.notaClinica).toMatchObject({ contenido: 'offline', expediente_id: 'exp1', cita_id: 'cita-1', usuario_id: 'u1' })
    expect(op.payload.seguimientoPayload).toMatchObject({ paciente_id: 'pac-1', dentista_id: 'u1', estado: 'agendada', motivo_consulta: 'Seguimiento' })
    expect(op.payload.notaClinica.id).toBeTruthy(); expect(op.payload.seguimientoPayload.id).toBeTruthy()
    expect(s.f.finalizada).toBe(true); expect(m.navigate).toHaveBeenCalledWith('/')
  })

  it('SIN CONEXIÓN con el expediente aún cargando: avisa en vez de encolar una nota sin expediente', async () => {
    vi.stubGlobal('navigator', { onLine: false }); m.expediente = null
    const s = await montar()
    await act(async () => { await s.f.handleFinalizar() })
    expect(m.encolar).not.toHaveBeenCalled(); expect(s.f.finalizada).toBe(false)
    // El mensaje ESPECÍFICO (no el genérico): le dice a la persona qué hacer.
    expect(m.toastError).toHaveBeenCalledWith('El expediente todavía está cargando, espera un momento e intenta de nuevo.')
  })

  it('si la cita NO carga: expone la causa real, no hay cita, y finalizar no llama a nada ni declara guardado', async () => {
    m.obtenerCita.mockRejectedValue(Object.assign(new Error('La cita no existe o tu usuario no tiene acceso a ella.'), { codigo: 'NO_DISPONIBLE' }))
    const s = await montar()
    expect(s.f.cita).toBeNull(); expect(s.f.cargandoCita).toBe(false)
    expect(s.f.errorCita).toEqual({ codigo: 'NO_DISPONIBLE', mensaje: 'La cita no existe o tu usuario no tiene acceso a ella.' })
    await act(async () => { await s.f.handleFinalizar() })
    expect(m.finalizar).not.toHaveBeenCalled(); expect(m.encolar).not.toHaveBeenCalled(); expect(s.f.finalizada).toBe(false); expect(m.navigate).not.toHaveBeenCalled()
    expect(m.toastError).toHaveBeenCalledWith(expect.stringMatching(/no se ha cargado/))
  })

  it('reintentarCarga vuelve a pedir la cita y, si ahora sí está, limpia el error', async () => {
    m.obtenerCita.mockRejectedValueOnce(Object.assign(new Error('sin conexión'), { codigo: 'SIN_CONEXION' })).mockResolvedValue({ ...CITA })
    const s = await montar()
    expect(s.f.errorCita?.codigo).toBe('SIN_CONEXION')
    act(() => { s.f.reintentarCarga() }); await asincrono()
    expect(m.obtenerCita).toHaveBeenCalledTimes(2); expect(s.f.errorCita).toBeNull(); expect(s.f.cita?.id).toBe('cita-1')
  })

  it('AVANCE DE LA FILA: al finalizar en línea, el siguiente EN ESPERA de hoy con este odontólogo pasa a consulta (administrativo); un fallo ahí no afecta a la consulta ya guardada', async () => {
    m.finalizar.mockResolvedValue({ ok: true }); m.avanzar.mockRejectedValue(new Error('sin red'))
    const s = await montar()
    await act(async () => { await s.f.handleFinalizar() })
    expect(m.avanzar).toHaveBeenCalledWith({ dentistaId: 'u1', excluirCitaId: 'cita-1' })
    expect(m.toastExito).toHaveBeenCalledWith('Consulta guardada correctamente.'); expect(m.navigate).toHaveBeenCalledWith('/'); expect(m.toastError).not.toHaveBeenCalled()
  })
  it('el avance de la fila recibe la SUCURSAL y el SILLÓN de la consulta que termina (para no asignar al paciente siguiente al lugar equivocado)', async () => {
    m.finalizar.mockResolvedValue({ ok: true }); m.obtenerCita.mockResolvedValue({ ...CITA, sucursal_id: 'suc-9', sillon_id: 'sillon-9' })
    const s = await montar(); await act(async () => { await s.f.handleFinalizar() })
    expect(m.avanzar).toHaveBeenCalledTimes(1); expect(m.avanzar.mock.calls[0][0]).toEqual({ dentistaId: 'u1', excluirCitaId: 'cita-1', sucursalId: 'suc-9', sillonId: 'sillon-9' })
  })
  it('el avance de la fila NO ocurre si la finalización falla, ni sin conexión (la consulta solo queda en cola)', async () => {
    m.finalizar.mockRejectedValueOnce(new Error('x'))
    const s = await montar()
    await act(async () => { await s.f.handleFinalizar() })
    expect(m.avanzar).not.toHaveBeenCalled()
    vi.stubGlobal('navigator', { onLine: false })
    await act(async () => { await s.f.handleFinalizar() })
    expect(m.avanzar).not.toHaveBeenCalled()
  })

  describe('modo RECUPERACIÓN: la cita ya estaba completada', () => {
    beforeEach(() => { m.obtenerCita.mockResolvedValue({ ...CITA, estado: 'completada' }) })
    it('se reconoce (modoRecuperacion) y una cita en consulta NO lo está', async () => {
      expect((await montar()).f.modoRecuperacion).toBe(true)
      m.obtenerCita.mockResolvedValue({ ...CITA }); expect((await montar()).f.modoRecuperacion).toBe(false)
    })
    it('guardar completa la consulta con la función de recuperación (NO con la de finalizar), con ids estables, sin avanzar la fila', async () => {
      m.completar.mockResolvedValue({ ok: true, ya_existia: false })
      const s = await montar()
      act(() => { s.f.setNotaContenido('Nota que faltaba') })
      await act(async () => { await s.f.handleFinalizar() })
      expect(m.completar).toHaveBeenCalledTimes(1); expect(m.finalizar).not.toHaveBeenCalled(); expect(m.avanzar).not.toHaveBeenCalled()
      const arg = m.completar.mock.calls[0][0]
      expect(arg).toMatchObject({ citaId: 'cita-1', seguimiento: null }); expect(arg.nota).toMatchObject({ contenido: 'Nota que faltaba', tipo: 'consulta' }); expect(arg.nota.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(m.toastExito).toHaveBeenCalledWith('Consulta completada: la nota quedó guardada.'); expect(m.navigate).toHaveBeenCalledWith('/'); expect(s.f.finalizada).toBe(true)
    })
    it('el reintento tras un error usa el MISMO id de nota (no duplica); doble clic = una sola llamada', async () => {
      const d = diferido(); m.completar.mockRejectedValueOnce(Object.assign(new Error('Sin conexión'), { codigo: 'SIN_CONEXION' })).mockReturnValueOnce(d.p)
      const s = await montar()
      await act(async () => { await s.f.handleFinalizar() })
      let p1, p2; await act(async () => { p1 = s.f.handleFinalizar(); p2 = s.f.handleFinalizar(); d.ok({ ok: true, ya_existia: false }); await Promise.all([p1, p2]) })
      expect(m.completar).toHaveBeenCalledTimes(2); expect(m.completar.mock.calls[1][0].nota.id).toBe(m.completar.mock.calls[0][0].nota.id)
    })
    it('si el servidor responde que ya estaba completa, lo dice así', async () => {
      m.completar.mockResolvedValue({ ok: true, ya_existia: true })
      const s = await montar(); await act(async () => { await s.f.handleFinalizar() })
      expect(m.toastExito).toHaveBeenCalledWith('La consulta ya estaba completa.')
    })
    it('si la cita YA tiene otra nota, el servidor lo rechaza y se muestra su mensaje (no se crea una segunda ni se declara guardada)', async () => {
      m.completar.mockRejectedValue(Object.assign(new Error('La cita ya tiene una nota clínica; no se creó otra.'), { codigo: 'CONSULTA_YA_TIENE_NOTA' }))
      const s = await montar(); await act(async () => { await s.f.handleFinalizar() })
      expect(m.toastError).toHaveBeenCalledWith('La cita ya tiene una nota clínica; no se creó otra.'); expect(s.f.finalizada).toBe(false); expect(m.navigate).not.toHaveBeenCalled()
    })
    it('SIN CONEXIÓN no se encola nada a ciegas: se explica que la verificación es del servidor', async () => {
      vi.stubGlobal('navigator', { onLine: false })
      const s = await montar(); await act(async () => { await s.f.handleFinalizar() })
      expect(m.completar).not.toHaveBeenCalled(); expect(m.encolar).not.toHaveBeenCalled(); expect(m.toastError).toHaveBeenCalledWith(expect.stringMatching(/requiere conexión/)); expect(s.f.finalizada).toBe(false)
    })
    it('plan SIN notas y sin seguimiento: no hay nada que completar (aviso, sin llamar); con seguimiento se completa solo eso', async () => {
      m.notas.valor = false
      const s = await montar(); await act(async () => { await s.f.handleFinalizar() })
      expect(m.completar).not.toHaveBeenCalled(); expect(m.toastError).toHaveBeenCalledWith(expect.stringMatching(/no hay nada que completar/))
      m.completar.mockResolvedValue({ ok: true, ya_existia: false })
      act(() => { s.f.setProgramarSeguimiento(true); s.f.setSeguimiento({ fecha: '2031-03-01', hora: '09:00', duracion: 30, motivo: '' }) })
      await act(async () => { await s.f.handleFinalizar() })
      expect(m.completar.mock.calls[0][0]).toMatchObject({ nota: null }); expect(m.completar.mock.calls[0][0].seguimiento.id).toBeTruthy()
    })
  })

  it('el candado se libera tras un error: se puede volver a intentar', async () => {
    m.finalizar.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ ok: true })
    const s = await montar()
    await act(async () => { await s.f.handleFinalizar() })
    await act(async () => { await s.f.handleFinalizar() })
    expect(m.finalizar).toHaveBeenCalledTimes(2); expect(s.f.finalizada).toBe(true)
  })
})
