import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

const m = vi.hoisted(() => ({
  refreshSession: vi.fn(),
  crearNotaClinica: vi.fn(),
  crearReceta: vi.fn(),
  actualizarPiezaOdontograma: vi.fn(),
  actualizarPiezaPeriodontal: vi.fn(),
  actualizarSitioPeriodontal: vi.fn(),
  actualizarCita: vi.fn(),
  crearCita: vi.fn(),
  finalizarConsulta: vi.fn(),
  toastExito: vi.fn(),
  toastError: vi.fn()
}))

vi.mock('../../../../lib/supabase', () => ({ supabase: { auth: { refreshSession: m.refreshSession } } }))
vi.mock('../../../../services/expedientes', () => ({ crearNotaClinica: m.crearNotaClinica }))
vi.mock('../../../../services/recetas', () => ({ crearReceta: m.crearReceta }))
vi.mock('../../../../services/odontograma', () => ({ actualizarPiezaOdontograma: m.actualizarPiezaOdontograma }))
vi.mock('../../../../services/periodontograma', () => ({
  actualizarPiezaPeriodontal: m.actualizarPiezaPeriodontal,
  actualizarSitioPeriodontal: m.actualizarSitioPeriodontal
}))
vi.mock('../../../../services/citas', () => ({ actualizarCita: m.actualizarCita, crearCita: m.crearCita }))
vi.mock('../../../../services/consultas', () => ({ finalizarConsulta: m.finalizarConsulta }))
vi.mock('../../../../store/useToastStore', () => ({ toastExito: m.toastExito, toastError: m.toastError }))

import { procesarColaOffline, obtenerUltimaSincronizacionCola } from '../../../../lib/procesadorColaOffline.js'
import { encolarOperacion, listarOperacionesPendientes } from '../../../../lib/colaOffline.js'

const sesionViva = () => m.refreshSession.mockResolvedValue({ data: { session: { access_token: 'x' } }, error: null })

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  Object.values(m).forEach((f) => f.mockReset())
  sesionViva()
})

const op = (id, tipo, payload, creado_en = 1) => ({ id, tipo, payload, creado_en, entidad: 'x', entidadId: id })

describe('Sincronizar al recuperar internet (secciones 15 y 22 #15, #16)', () => {
  it('sube cada operación y la quita de la cola SOLO después de que el servicio confirma éxito', async () => {
    let colaDuranteSubida
    m.crearNotaClinica.mockImplementation(async () => { colaDuranteSubida = await listarOperacionesPendientes() })
    await encolarOperacion(op('n1', 'crear_nota_clinica', { id: 'n1', contenido: 'hola' }))

    await procesarColaOffline()

    // Mientras se subía, seguía en la cola (marcada como "sincronizando"):
    expect(colaDuranteSubida).toHaveLength(1)
    expect(colaDuranteSubida[0].estado).toBe('sincronizando')
    // Ya confirmado el éxito, se quitó:
    expect(await listarOperacionesPendientes()).toEqual([])
    expect(m.crearNotaClinica).toHaveBeenCalledWith({ id: 'n1', contenido: 'hola' })
    expect(m.toastExito).toHaveBeenCalled()
  })

  it('sube en orden de creación, no en el orden en que quedaron guardadas', async () => {
    const orden = []
    m.crearNotaClinica.mockImplementation(async (p) => { orden.push(p.id) })
    await encolarOperacion(op('c', 'crear_nota_clinica', { id: 'c' }, 30))
    await encolarOperacion(op('a', 'crear_nota_clinica', { id: 'a' }, 10))
    await encolarOperacion(op('b', 'crear_nota_clinica', { id: 'b' }, 20))

    await procesarColaOffline()
    expect(orden).toEqual(['a', 'b', 'c'])
  })

  it('cada tipo de operación llega al servicio correcto con su payload', async () => {
    await encolarOperacion(op('r', 'crear_receta', { id: 'r' }, 1))
    await encolarOperacion(op('o', 'actualizar_pieza_odontograma', { piezaId: 'p11', cambios: { estado: 'corona' } }, 2))
    await encolarOperacion(op('pp', 'actualizar_pieza_periodontal', { piezaId: 'p12', cambios: { movilidad: 2 } }, 3))
    await encolarOperacion(op('ps', 'actualizar_sitio_periodontal', { sitioId: 's1', cambios: { recesion: 1 } }, 4))

    await procesarColaOffline()

    expect(m.crearReceta).toHaveBeenCalledWith({ id: 'r' })
    expect(m.actualizarPiezaOdontograma).toHaveBeenCalledWith('p11', { estado: 'corona' })
    expect(m.actualizarPiezaPeriodontal).toHaveBeenCalledWith('p12', { movilidad: 2 })
    expect(m.actualizarSitioPeriodontal).toHaveBeenCalledWith('s1', { recesion: 1 })
    expect(await listarOperacionesPendientes()).toEqual([])
  })

  it('con la cola vacía no toca la red ni molesta al usuario', async () => {
    await procesarColaOffline()
    expect(m.refreshSession).not.toHaveBeenCalled()
    expect(m.toastExito).not.toHaveBeenCalled()
    expect(m.toastError).not.toHaveBeenCalled()
  })

  it('registra cuándo fue la última vez que se pudo hablar con el servidor', async () => {
    await encolarOperacion(op('n1', 'crear_nota_clinica', { id: 'n1' }))
    expect(await obtenerUltimaSincronizacionCola()).toBeNull()

    await procesarColaOffline()
    const ultima = await obtenerUltimaSincronizacionCola()
    expect(new Date(ultima.fecha).getTime()).not.toBeNaN()
  })
})

describe('Sesión expirada mientras estaba offline (sección 2)', () => {
  it('no intenta subir NADA con una sesión muerta, y la cola queda intacta', async () => {
    m.refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'refresh_token_not_found' } })
    await encolarOperacion(op('n1', 'crear_nota_clinica', { id: 'n1' }))

    await procesarColaOffline()

    expect(m.crearNotaClinica).not.toHaveBeenCalled()
    const cola = await listarOperacionesPendientes()
    expect(cola).toHaveLength(1)
    expect(cola[0].estado).toBe('pendiente') // no se marcó como fallida: no se intentó
    expect(m.toastError).toHaveBeenCalledWith(expect.stringContaining('sesión expiró'))
  })
})

describe('Reintentar después de un error (prueba #17)', () => {
  it('un fallo NO vacía la cola: queda en "error" con el mensaje real y un intento contado', async () => {
    m.crearNotaClinica.mockRejectedValueOnce(new Error('connection reset'))
    await encolarOperacion(op('n1', 'crear_nota_clinica', { id: 'n1' }))

    await procesarColaOffline()

    const [pendiente] = await listarOperacionesPendientes()
    expect(pendiente).toMatchObject({ estado: 'error', intentos: 1, ultimoError: 'connection reset' })
  })

  it('en el siguiente intento la operación fallida se reintenta y, si sale bien, desaparece', async () => {
    m.crearNotaClinica.mockRejectedValueOnce(new Error('connection reset'))
    await encolarOperacion(op('n1', 'crear_nota_clinica', { id: 'n1' }))
    await procesarColaOffline()

    m.crearNotaClinica.mockResolvedValueOnce({})
    await procesarColaOffline()

    expect(m.crearNotaClinica).toHaveBeenCalledTimes(2)
    // Ambos intentos con exactamente el mismo id — nunca uno nuevo:
    expect(m.crearNotaClinica.mock.calls[0][0].id).toBe('n1')
    expect(m.crearNotaClinica.mock.calls[1][0].id).toBe('n1')
    expect(await listarOperacionesPendientes()).toEqual([])
  })

  it('una operación que falla no bloquea a las demás', async () => {
    m.crearNotaClinica.mockRejectedValueOnce(new Error('falla'))
    m.crearReceta.mockResolvedValueOnce({})
    await encolarOperacion(op('n1', 'crear_nota_clinica', { id: 'n1' }, 1))
    await encolarOperacion(op('r1', 'crear_receta', { id: 'r1' }, 2))

    await procesarColaOffline()

    const restantes = (await listarOperacionesPendientes()).map((o) => o.id)
    expect(restantes).toEqual(['n1'])
  })

  it('un tipo de operación que esta versión no conoce se conserva, no se descarta en silencio', async () => {
    await encolarOperacion(op('x', 'tipo_de_una_version_futura', { a: 1 }))
    await procesarColaOffline()
    expect(await listarOperacionesPendientes()).toHaveLength(1)
  })
})

describe('Conflicto de concurrencia (sección 9, prueba #19)', () => {
  it('un conflicto se saca de la cola (reintentar nunca serviría) y se avisa cuál se perdió', async () => {
    m.actualizarPiezaOdontograma.mockRejectedValueOnce(new Error('CONFLICTO_CONCURRENCIA'))
    await encolarOperacion(op('o', 'actualizar_pieza_odontograma', { piezaId: 'p11', cambios: {} }))

    await procesarColaOffline()

    expect(await listarOperacionesPendientes()).toEqual([])
    expect(m.toastError).toHaveBeenCalledWith(expect.stringContaining('otra persona ya modificó'))
  })

  it('un conflicto en una operación no impide subir las siguientes', async () => {
    m.actualizarPiezaOdontograma.mockRejectedValueOnce(new Error('CONFLICTO_CONCURRENCIA'))
    await encolarOperacion(op('o', 'actualizar_pieza_odontograma', { piezaId: 'p11', cambios: {} }, 1))
    await encolarOperacion(op('n', 'crear_nota_clinica', { id: 'n' }, 2))

    await procesarColaOffline()

    expect(m.crearNotaClinica).toHaveBeenCalledTimes(1)
    expect(await listarOperacionesPendientes()).toEqual([])
  })
})

describe('Fase 8: el rechazo de integridad lanzado CRUDO por un servicio (PostgrestError con hint, sin codigo tipificado)', () => {
  const crudo = (hint, message) => Object.assign(new Error(message), { code: 'P0001', hint })   // lo que lanza `if (error) throw error` en los servicios
  it.each(['REFERENCIA_DENTISTA_INCOHERENTE', 'REFERENCIA_TRATAMIENTO_INCOHERENTE', 'ACTOR_INCOHERENTE', 'CITA_CONSULTORIO_INCOHERENTE', 'NOTA_FECHA_FUERA_DE_LIMITE'])('%s se CONSERVA como conflicto con el mensaje del servidor y NO se reintenta en cada sincronización', async (hint) => {
    m.actualizarCita.mockReset(); m.toastError.mockReset()
    m.actualizarCita.mockRejectedValue(crudo(hint, `mensaje del servidor para ${hint}`))
    await encolarOperacion(op('c1', 'actualizar_cita', { id: 'cita1', cambios: { dentista_id: 'otro' } }))
    await procesarColaOffline()
    expect((await listarOperacionesPendientes())[0].estado).toBe('conflicto')
    expect(m.toastError).toHaveBeenCalledWith(expect.stringContaining(`mensaje del servidor para ${hint}`))
    await procesarColaOffline(); expect(m.actualizarCita).toHaveBeenCalledTimes(1)
  })
  it('CONTROL: un error crudo con un hint desconocido sigue siendo TRANSITORIO (se reintenta); la cola no se vuelve más estricta de lo debido', async () => {
    m.actualizarCita.mockReset(); m.actualizarCita.mockRejectedValue(crudo('OTRA_COSA', 'algo raro'))
    await encolarOperacion(op('c1', 'actualizar_cita', { id: 'cita1', cambios: { estado: 'confirmada' } }))
    await procesarColaOffline()
    expect((await listarOperacionesPendientes())[0].estado).toBe('error')
    await procesarColaOffline(); expect(m.actualizarCita.mock.calls.length).toBeGreaterThan(1)
  })
})

describe('Fase 5: una operación sin dueño que la base rechaza por incoherente (autor distinto de la sesión)', () => {
  it('se CONSERVA como conflicto con el mensaje del servidor y NO se reintenta para siempre', async () => {
    m.actualizarCita.mockRejectedValue(Object.assign(new Error('El odontólogo indicado no pertenece a la clínica del paciente.'), { codigo: 'INTEGRIDAD_DATOS' }))
    await encolarOperacion(op('c1', 'actualizar_cita', { id: 'cita1', cambios: { dentista_id: 'otro' } }))
    await procesarColaOffline()
    expect((await listarOperacionesPendientes())[0].estado).toBe('conflicto')
    expect(m.toastError).toHaveBeenCalledWith(expect.stringContaining('no pertenece a la clínica'))
    await procesarColaOffline(); expect(m.actualizarCita).toHaveBeenCalledTimes(1)
  })
})

describe('Fase 4: una operación ANTIGUA que intenta completar una cita sin consulta', () => {
  it('la base la rechaza (COMPLETAR_SOLO_VIA_CONSULTA): se CONSERVA como conflicto con instrucciones y NO se reintenta para siempre', async () => {
    m.actualizarCita.mockRejectedValue(Object.assign(new Error('Esa cita se intentó marcar como completada sin guardar la consulta clínica. Ábrela y finalízala desde la consulta.'), { codigo: 'COMPLETAR_SOLO_VIA_CONSULTA' }))
    await encolarOperacion(op('c1', 'actualizar_cita', { id: 'cita1', cambios: { estado: 'completada' } }))
    await procesarColaOffline()
    expect((await listarOperacionesPendientes())[0].estado).toBe('conflicto')
    expect(m.toastError).toHaveBeenCalledWith(expect.stringContaining('Ábrela y finalízala desde la consulta'))
    await procesarColaOffline()
    expect(m.actualizarCita).toHaveBeenCalledTimes(1)
  })
})

describe('Errores de datos al sincronizar (fase 2): definitivos se conservan, transitorios se reintentan', () => {
  const dato = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo })
  it.each([['SIN_PERMISO', 'Tu usuario no tiene permiso para esta operación.'], ['NOTA_CONFLICTO', 'Ya existe una nota con ese identificador y contenido distinto.'], ['NOTA_NO_VERIFICABLE', 'No se pudo confirmar que la nota se guardó.']])(
    '%s: la nota se CONSERVA como conflicto con su motivo y no se reintenta sola', async (codigo, mensaje) => {
      m.crearNotaClinica.mockRejectedValue(dato(codigo, mensaje))
      await encolarOperacion(op('n1', 'crear_nota_clinica', { id: 'n1', contenido: 'x' }))
      await procesarColaOffline()
      expect((await listarOperacionesPendientes())[0].estado).toBe('conflicto')
      expect(m.toastError).toHaveBeenCalledWith(expect.stringContaining(mensaje))
      await procesarColaOffline()
      expect(m.crearNotaClinica).toHaveBeenCalledTimes(1)
    })
  it.each(['SESION_INVALIDA', 'SIN_CONEXION', 'SERVIDOR_NO_DISPONIBLE'])('%s: es transitorio, se reintenta (no se descarta ni se marca conflicto)', async (codigo) => {
    m.crearNotaClinica.mockRejectedValueOnce(dato(codigo, 'x')).mockResolvedValue({ id: 'n1' })
    await encolarOperacion(op('n1', 'crear_nota_clinica', { id: 'n1', contenido: 'x' }))
    await procesarColaOffline()
    expect((await listarOperacionesPendientes())[0].estado).toBe('error')
    await procesarColaOffline()
    expect(m.crearNotaClinica).toHaveBeenCalledTimes(2); expect(await listarOperacionesPendientes()).toEqual([])
  })
})

describe('Finalizar consulta sin conexión (prueba #12)', () => {
  const payload = (extra = {}) => ({
    citaId: 'cita1', motivo: 'Dolor', actualizadoEnEsperado: 'T0',
    notaClinica: { id: 'nota1', contenido: 'Se atendió' },
    seguimientoPayload: null, ...extra
  })
  const rechazo = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo })

  it('delega TODA la secuencia (motivo → nota → completar cita → seguimiento) en UNA sola operación transaccional, con los datos y el candado de concurrencia', async () => {
    m.finalizarConsulta.mockResolvedValue({ ok: true })
    const seguimiento = { id: 'seg1', motivo_consulta: 'Revisión' }
    await encolarOperacion(op('finalizar_consulta_cita1', 'finalizar_consulta', payload({ seguimientoPayload: seguimiento })))

    await procesarColaOffline()

    expect(m.finalizarConsulta).toHaveBeenCalledTimes(1)
    expect(m.finalizarConsulta).toHaveBeenCalledWith({
      citaId: 'cita1', motivo: 'Dolor', nota: { id: 'nota1', contenido: 'Se atendió' }, seguimiento, actualizadoEnEsperado: 'T0'
    })
    // Ya no se ejecuta por pasos sueltos desde el navegador (esa cadena podía quedar a medias):
    expect(m.actualizarCita).not.toHaveBeenCalled()
    expect(m.crearNotaClinica).not.toHaveBeenCalled()
    expect(m.crearCita).not.toHaveBeenCalled()
    expect(await listarOperacionesPendientes()).toEqual([])
  })

  it('sin seguimiento programado, no se manda ninguno', async () => {
    m.finalizarConsulta.mockResolvedValue({ ok: true })
    await encolarOperacion(op('f', 'finalizar_consulta', payload()))
    await procesarColaOffline()
    expect(m.finalizarConsulta.mock.calls[0][0].seguimiento).toBeNull()
  })

  it('si la cita cambió mientras estaba offline: UN solo intento, no se reintenta para siempre y se avisa (nada queda a medias: lo garantiza la transacción)', async () => {
    m.finalizarConsulta.mockRejectedValueOnce(new Error('CONFLICTO_CONCURRENCIA'))
    await encolarOperacion(op('f', 'finalizar_consulta', payload({ seguimientoPayload: { id: 'seg1' } })))

    await procesarColaOffline()

    expect(m.finalizarConsulta).toHaveBeenCalledTimes(1)
    expect(await listarOperacionesPendientes()).toEqual([])
    expect(m.toastError).toHaveBeenCalled()
    await procesarColaOffline()
    expect(m.finalizarConsulta).toHaveBeenCalledTimes(1)
  })

  it('si falla por la red, el reintento manda los MISMOS ids de nota y de seguimiento — no duplica', async () => {
    m.finalizarConsulta.mockRejectedValueOnce(new Error('red caída')).mockResolvedValue({ ok: true })
    await encolarOperacion(op('f', 'finalizar_consulta', payload({ seguimientoPayload: { id: 'seg1' } })))

    await procesarColaOffline()
    expect((await listarOperacionesPendientes())[0].estado).toBe('error')

    await procesarColaOffline()

    const llamadas = m.finalizarConsulta.mock.calls.map(([a]) => [a.nota.id, a.seguimiento.id])
    expect(llamadas).toEqual([['nota1', 'seg1'], ['nota1', 'seg1']]) // mismos ids ⇒ el servidor no duplica
    expect(await listarOperacionesPendientes()).toEqual([])
  })

  it('un RECHAZO DEFINITIVO del servidor (p. ej. el paciente no está asignado) se conserva como CONFLICTO con su motivo y NO se reintenta solo — no es una caída de red', async () => {
    m.finalizarConsulta.mockRejectedValue(rechazo('PACIENTE_NO_ASIGNADO', 'Este paciente no está asignado a ti.'))
    await encolarOperacion(op('f', 'finalizar_consulta', payload()))

    await procesarColaOffline()

    const [pendiente] = await listarOperacionesPendientes()
    expect(pendiente.estado).toBe('conflicto')
    expect(m.toastError).toHaveBeenCalledWith(expect.stringContaining('Este paciente no está asignado a ti.'))
    await procesarColaOffline()
    expect(m.finalizarConsulta).toHaveBeenCalledTimes(1) // el conflicto no se reintenta por su cuenta
  })

  it.each([
    ['SEGUIMIENTO_CONFLICTO', 'El identificador del seguimiento ya pertenece a otra cita.'],
    ['NOTA_CONFLICTO', 'Ya existe una nota con ese identificador y contenido clínico distinto.'],
    ['FINALIZACION_INCOMPLETA', 'La cita ya estaba completada, pero esta operación no tiene confirmado: la nota clínica.'],
    ['CONSULTA_CON_DATOS_DISTINTOS', 'La consulta ya estaba finalizada con un motivo distinto.'],
    ['ID_REQUERIDO_PARA_REINTENTO', 'Se necesita el identificador de la nota.']
  ])('fase 3: %s se CONSERVA como conflicto con su motivo y NO se reintenta sola (el trabajo clínico no se pierde ni se repite a ciegas)', async (codigo, mensaje) => {
    m.finalizarConsulta.mockRejectedValue(rechazo(codigo, mensaje))
    await encolarOperacion(op('f', 'finalizar_consulta', payload()))

    await procesarColaOffline()

    expect((await listarOperacionesPendientes())[0].estado).toBe('conflicto')
    expect(m.toastError).toHaveBeenCalledWith(expect.stringContaining(mensaje))
    await procesarColaOffline()
    expect(m.finalizarConsulta).toHaveBeenCalledTimes(1)
  })

  it('RESPUESTA PERDIDA: el servidor confirmó pero el navegador no lo supo; el reintento (mismos ids, candado ya obsoleto) recibe ya_finalizada y la operación SALE de la cola, sin duplicar', async () => {
    m.finalizarConsulta.mockRejectedValueOnce(new Error('TypeError: Failed to fetch')).mockResolvedValue({ ok: true, ya_finalizada: true, verificado: { nota: true, seguimiento: true } })
    await encolarOperacion(op('f', 'finalizar_consulta', payload({ seguimientoPayload: { id: 'seg1' } })))

    await procesarColaOffline()
    expect((await listarOperacionesPendientes())[0].estado).toBe('error')
    await procesarColaOffline()

    expect(m.finalizarConsulta).toHaveBeenCalledTimes(2)
    expect(m.finalizarConsulta.mock.calls.map(([a]) => [a.nota.id, a.seguimiento.id, a.actualizadoEnEsperado])).toEqual([['nota1', 'seg1', 'T0'], ['nota1', 'seg1', 'T0']])
    expect(await listarOperacionesPendientes()).toEqual([])
  })

  it('una sesión cerrada NO es un rechazo definitivo: se trata como transitoria y se reintenta al volver a iniciar sesión', async () => {
    m.finalizarConsulta.mockRejectedValueOnce(rechazo('SESION_CERRADA', 'Tu sesión fue cerrada desde otro dispositivo.')).mockResolvedValue({ ok: true })
    await encolarOperacion(op('f', 'finalizar_consulta', payload()))

    await procesarColaOffline()
    expect((await listarOperacionesPendientes())[0].estado).toBe('error')

    await procesarColaOffline()
    expect(m.finalizarConsulta).toHaveBeenCalledTimes(2)
    expect(await listarOperacionesPendientes()).toEqual([])
  })
})
