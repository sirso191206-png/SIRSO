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

describe('Finalizar consulta sin conexión (prueba #12)', () => {
  const payload = (extra = {}) => ({
    citaId: 'cita1', motivo: 'Dolor', actualizadoEnEsperado: 'T0',
    notaClinica: { id: 'nota1', contenido: 'Se atendió' },
    seguimientoPayload: null, ...extra
  })

  it('ejecuta la secuencia completa EN ORDEN: motivo → nota → completar cita → seguimiento', async () => {
    m.actualizarCita.mockResolvedValueOnce({ actualizado_en: 'T1' }).mockResolvedValueOnce({ actualizado_en: 'T2' })
    const seguimiento = { id: 'seg1', motivo_consulta: 'Revisión' }
    await encolarOperacion(op('finalizar_consulta_cita1', 'finalizar_consulta', payload({ seguimientoPayload: seguimiento })))

    await procesarColaOffline()

    const [motivo, completar] = m.actualizarCita.mock.calls
    expect(motivo).toEqual(['cita1', { motivo_consulta: 'Dolor' }, 'T0'])
    // El candado del 2º paso usa el valor que devolvió el 1º, no el original:
    expect(completar).toEqual(['cita1', { estado: 'completada' }, 'T1'])
    expect(m.crearCita).toHaveBeenCalledWith(seguimiento)

    const orden = [
      m.actualizarCita.mock.invocationCallOrder[0],
      m.crearNotaClinica.mock.invocationCallOrder[0],
      m.actualizarCita.mock.invocationCallOrder[1],
      m.crearCita.mock.invocationCallOrder[0]
    ]
    expect(orden).toEqual([...orden].sort((a, b) => a - b))
    expect(await listarOperacionesPendientes()).toEqual([])
  })

  it('sin seguimiento programado, no crea ninguna cita nueva', async () => {
    m.actualizarCita.mockResolvedValue({ actualizado_en: 'T1' })
    await encolarOperacion(op('f', 'finalizar_consulta', payload()))
    await procesarColaOffline()
    expect(m.crearCita).not.toHaveBeenCalled()
  })

  it('si la cita cambió mientras estaba offline, NO queda una nota huérfana ni un seguimiento suelto', async () => {
    m.actualizarCita.mockRejectedValueOnce(new Error('CONFLICTO_CONCURRENCIA'))
    await encolarOperacion(op('f', 'finalizar_consulta', payload({ seguimientoPayload: { id: 'seg1' } })))

    await procesarColaOffline()

    expect(m.crearNotaClinica).not.toHaveBeenCalled()
    expect(m.crearCita).not.toHaveBeenCalled()
    expect(m.actualizarCita).toHaveBeenCalledTimes(1)
  })

  it('si falla a la mitad (tras crear la nota), el reintento reutiliza el MISMO id de nota — no duplica', async () => {
    m.actualizarCita.mockResolvedValue({ actualizado_en: 'T1' })
    m.crearNotaClinica.mockResolvedValueOnce({})
    m.actualizarCita
      .mockResolvedValueOnce({ actualizado_en: 'T1' })         // 1er intento: motivo ok
      .mockRejectedValueOnce(new Error('red caída'))           // 1er intento: completar falla
    await encolarOperacion(op('f', 'finalizar_consulta', payload()))

    await procesarColaOffline()
    expect((await listarOperacionesPendientes())[0].estado).toBe('error')

    m.actualizarCita.mockResolvedValue({ actualizado_en: 'T2' })
    await procesarColaOffline()

    const idsDeNota = m.crearNotaClinica.mock.calls.map(([n]) => n.id)
    expect(idsDeNota).toEqual(['nota1', 'nota1']) // mismo id ⇒ el upsert no duplica
    expect(await listarOperacionesPendientes()).toEqual([])
  })
})
