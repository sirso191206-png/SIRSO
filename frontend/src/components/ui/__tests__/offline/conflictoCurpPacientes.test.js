// Error real de producción: "pacientes: duplicate key value violates
// unique constraint idx_pacientes_curp_por_clinica" en el panel de
// sincronización. La restricción es correcta y NO se toca — estas
// pruebas fijan cómo la sincronización debe tratarla: reconocer a la
// misma persona, no duplicar, y convertir un CURP realmente ajeno en
// un conflicto controlado (conservado, sin reintentos infinitos).
//
// El "servidor" de aquí tiene estado y reproduce el índice REAL
// (migración 016): único por (clinica_id, curp) solo cuando curp NO
// es nulo, y RLS: cada sesión solo ve filas de su propia clínica.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { crearQueryMock, ok, fallo } from './helpers/supabaseMock.js'

const m = vi.hoisted(() => ({
  refreshSession: vi.fn(),
  from: vi.fn(),
  crearNotaClinica: vi.fn(),
  crearReceta: vi.fn(),
  actualizarPiezaOdontograma: vi.fn(),
  actualizarPiezaPeriodontal: vi.fn(),
  actualizarSitioPeriodontal: vi.fn(),
  actualizarCita: vi.fn(),
  toastExito: vi.fn(),
  toastError: vi.fn()
}))

vi.mock('../../../../lib/supabase', () => ({ supabase: { auth: { refreshSession: m.refreshSession }, from: m.from } }))
vi.mock('../../../../services/expedientes', async (importarOriginal) => {
  const real = await importarOriginal()
  return { ...real, crearNotaClinica: m.crearNotaClinica }
})
vi.mock('../../../../services/recetas', () => ({ crearReceta: m.crearReceta }))
vi.mock('../../../../services/odontograma', () => ({ actualizarPiezaOdontograma: m.actualizarPiezaOdontograma }))
vi.mock('../../../../services/periodontograma', () => ({
  actualizarPiezaPeriodontal: m.actualizarPiezaPeriodontal,
  actualizarSitioPeriodontal: m.actualizarSitioPeriodontal
}))
vi.mock('../../../../services/citas', () => ({ actualizarCita: m.actualizarCita, crearCita: vi.fn() }))
vi.mock('../../../../store/useToastStore', () => ({ toastExito: m.toastExito, toastError: m.toastError }))

import { procesarColaOffline, MENSAJE_CONFLICTO_CURP } from '../../../../lib/procesadorColaOffline.js'
import { listarOperacionesPendientes, encolarOperacion } from '../../../../lib/colaOffline.js'
import { crearPacienteOffline, obtenerPacienteOfflineLocal } from '../../../../lib/pacientesOffline.js'
import { resolverId } from '../../../../lib/mapeoIdsOffline.js'
import { esConflictoCurp, crearPaciente, MENSAJE_CURP_DUPLICADO } from '../../../../services/pacientes.js'
import { operacionEsDescartable } from '../../../../lib/descarteOperaciones.js'
import { evaluarOperaciones } from '../../../../lib/cierreSesion.js'
import { syncClinica } from '../../../../lib/clinicDataSync.js'

const MENSAJE_INDICE = 'duplicate key value violates unique constraint "idx_pacientes_curp_por_clinica"'
const CURP_A = 'PEPJ800101HDFRRN01'

let servidor
let clinicaSesion
let intentosUpsert
let updatesVistos
let ocultarExistenteALaBusqueda

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  Object.values(m).forEach((f) => typeof f.mockReset === 'function' && f.mockReset())
  m.refreshSession.mockResolvedValue({ data: { session: { access_token: 'x', user: { id: 'u1' } } }, error: null })
  servidor = []
  clinicaSesion = 'clinica-A'
  intentosUpsert = 0
  updatesVistos = []
  ocultarExistenteALaBusqueda = false

  m.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, (t, ops) => {
      if (t === 'expedientes') {
        const eq = ops.find(([met, a]) => met === 'eq' && a[0] === 'paciente_id')
        return eq ? ok({ id: `exp-de-${eq[1][1]}` }) : ok([]) // sin filtro = lectura masiva de la réplica
      }
      if (t === 'citas') return ok([])
      if (t === 'usuarios') return ok([{ id: 'x' }])
      if (t !== 'pacientes' && t !== 'v_pacientes_seguro') return ok(null)

      const insert = ops.find(([met]) => met === 'insert')
      if (insert) { // creación EN LÍNEA (crearPaciente): mismo índice, sin id previo
        const fila = { ...insert[1][0] }
        if (fila.curp && servidor.some((p) => p.clinica_id === clinicaSesion && p.curp === fila.curp)) {
          return fallo(MENSAJE_INDICE, '23505')
        }
        const nueva = { id: `srv-${servidor.length + 1}`, ...fila, clinica_id: clinicaSesion }
        servidor.push(nueva)
        return ok(nueva)
      }

      const upsert = ops.find(([met]) => met === 'upsert')
      if (upsert) {
        intentosUpsert++
        const fila = { ...upsert[1][0] }
        const yaEsta = servidor.find((p) => p.id === fila.id)
        if (yaEsta) { Object.assign(yaEsta, fila); return ok(yaEsta) } // mismo id → idempotente
        // Índice único parcial por clínica (migración 016)
        if (fila.curp && servidor.some((p) => p.clinica_id === clinicaSesion && p.curp === fila.curp)) {
          return fallo(MENSAJE_INDICE, '23505')
        }
        const nueva = { ...fila, clinica_id: clinicaSesion }
        servidor.push(nueva)
        return ok(nueva)
      }

      const update = ops.find(([met]) => met === 'update')
      if (update) {
        const eqId = ops.find(([met, a]) => met === 'eq' && a[0] === 'id')
        const fila = servidor.find((p) => p.id === eqId?.[1]?.[1])
        if (!fila) return fallo('no encontrada', 'PGRST116')
        const cambios = update[1][0]
        if (cambios.curp && servidor.some((p) => p.id !== fila.id && p.clinica_id === fila.clinica_id && p.curp === cambios.curp)) {
          return fallo(MENSAJE_INDICE, '23505')
        }
        const guardaIs = ops.find(([met]) => met === 'is')
        if (guardaIs && fila[guardaIs[1][0]] != null) return ok(fila) // alguien ya lo llenó: no se pisa
        Object.assign(fila, cambios)
        updatesVistos.push({ id: fila.id, cambios })
        return ok(fila)
      }

      // SELECT por CURP, con RLS: solo la clínica de la sesión
      const eqCurp = ops.find(([met, a]) => met === 'eq' && a[0] === 'curp')
      if (eqCurp) {
        if (ocultarExistenteALaBusqueda) return ok(null) // existe, pero RLS no se lo muestra a esta sesión
        return ok(servidor.find((p) => p.clinica_id === clinicaSesion && p.curp === eqCurp[1][1]) ?? null)
      }
      // SELECT de réplica (syncPacientes): lista, nunca escribe
      return ok(servidor.filter((p) => p.clinica_id === clinicaSesion))
    }, [])
  )
})

const pacienteServidor = (extra = {}) => ({
  id: 'p-existente', clinica_id: 'clinica-A', curp: CURP_A, nombre_completo: 'Juan Pérez',
  telefono: null, correo: null, direccion: null, numero_expediente: 'E-1', fecha_nacimiento: '1980-01-01', ...extra
})
const crearOffline = (datos) => crearPacienteOffline({ nombre_completo: 'Juan Pérez', curp: CURP_A, ...datos }, { usuarioId: 'u1' })

describe('esConflictoCurp — reconoce SOLO el error de ese índice', () => {
  it('23505 del índice de CURP: sí', () => {
    expect(esConflictoCurp({ code: '23505', message: MENSAJE_INDICE })).toBe(true)
  })
  it('otro 23505 (otra restricción) o cualquier otro código: no', () => {
    expect(esConflictoCurp({ code: '23505', message: 'duplicate key value violates unique constraint "pacientes_pkey"' })).toBe(false)
    expect(esConflictoCurp({ code: '23503', message: MENSAJE_INDICE })).toBe(false)
    expect(esConflictoCurp(null)).toBe(false)
  })
})

describe('TEST 1 — paciente que YA existe (misma persona): se vincula, no se duplica ni da error', () => {
  it('reconoce al existente, guarda el mapeo y deja un solo paciente', async () => {
    servidor.push(pacienteServidor())
    const local = await crearOffline()

    await procesarColaOffline()

    expect(servidor).toHaveLength(1)
    expect(await resolverId(local.id)).toBe('p-existente')
    expect(await listarOperacionesPendientes()).toHaveLength(0) // sin error, sin pendiente
    expect(m.toastError).not.toHaveBeenCalled()
  })

  it('misma persona aunque el nombre difiera en mayúsculas, acentos o espacios', async () => {
    servidor.push(pacienteServidor({ nombre_completo: 'JUAN   PEREZ' }))
    const local = await crearOffline({ nombre_completo: 'juan pérez' })
    await procesarColaOffline()
    expect(await resolverId(local.id)).toBe('p-existente')
    expect(servidor).toHaveLength(1)
  })

  it('mismo CURP y mismo nombre pero DISTINTA fecha de nacimiento: no se asume que es la misma persona → conflicto', async () => {
    servidor.push(pacienteServidor({ fecha_nacimiento: '1980-01-01' }))
    const local = await crearOffline({ fecha_nacimiento: '1999-12-31' })
    await procesarColaOffline()
    expect(servidor).toHaveLength(1)
    expect(await resolverId(local.id)).toBe(local.id)
    expect((await listarOperacionesPendientes()).find((o) => o.id === local.id).estado).toBe('conflicto')
  })

  it('el trabajo clínico hecho offline se une al expediente REAL del paciente existente', async () => {
    servidor.push(pacienteServidor())
    m.crearNotaClinica.mockResolvedValue({ id: 'nota' })
    const local = await crearOffline()
    await encolarOperacion({
      id: 'nota-1', tipo: 'crear_nota_clinica', entidad: 'notas_clinicas', entidadId: 'nota-1',
      payload: { id: 'nota-1', pacienteIdOffline: local.id, contenido: 'Consulta' },
      dependeDe: [local.id], usuarioId: 'u1', creado_en: 2
    })

    await procesarColaOffline()

    expect(m.crearNotaClinica).toHaveBeenCalledTimes(1)
    expect(m.crearNotaClinica.mock.calls[0][0].expediente_id).toBe('exp-de-p-existente')
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })

  it('rellena SOLO campos de contacto vacíos del existente; nunca pisa uno que ya tiene dato', async () => {
    servidor.push(pacienteServidor({ telefono: '5551111111', correo: null }))
    await crearOffline({ telefono: '5559999999', correo: 'juan@x.com' })
    await procesarColaOffline()
    const existente = servidor[0]
    expect(existente.telefono).toBe('5551111111') // ya tenía → intacto
    expect(existente.correo).toBe('juan@x.com') // estaba vacío → se rellenó
  })
})

describe('TEST 2 / 8 — paciente nuevo: se crea una sola vez, también con sincronizaciones repetidas', () => {
  it('nuevo con CURP: una sola fila', async () => {
    const local = await crearOffline()
    await procesarColaOffline()
    expect(servidor).toHaveLength(1)
    expect(await resolverId(local.id)).toBe(servidor[0].id)
  })

  it('dos sincronizaciones consecutivas: sin duplicados', async () => {
    await crearOffline()
    await procesarColaOffline()
    await procesarColaOffline()
    expect(servidor).toHaveLength(1)
  })
})

describe('TEST 4 — reintentar la misma operación es idempotente', () => {
  it('si la primera subida SÍ se aplicó pero la cola no alcanzó a quitarla, reintentar no duplica ni da conflicto', async () => {
    const local = await crearOffline()
    const [operacion] = await listarOperacionesPendientes()
    await procesarColaOffline()
    expect(servidor).toHaveLength(1)

    await encolarOperacion(operacion) // la misma operación "regresa" a la cola
    await procesarColaOffline()

    expect(servidor).toHaveLength(1) // mismo id → se reconoce a sí mismo, no choca con su propio CURP
    expect(await listarOperacionesPendientes()).toHaveLength(0)
    expect(await resolverId(local.id)).toBe(servidor[0].id)
  })
})

describe('TEST 3 — paciente existente MODIFICADO offline', () => {
  it('actualiza al mismo paciente (conserva su id) sin crear otro', async () => {
    servidor.push(pacienteServidor())
    await encolarOperacion({
      id: 'actualizar_paciente_datos_p-existente', tipo: 'actualizar_paciente', entidad: 'pacientes', entidadId: 'p-existente',
      payload: { id: 'p-existente', cambios: { telefono: '5557777777', direccion: 'Calle 1' }, actualizadoEnEsperado: undefined },
      dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    expect(servidor).toHaveLength(1)
    expect(servidor[0].id).toBe('p-existente')
    expect(servidor[0].telefono).toBe('5557777777')
    expect(servidor[0].curp).toBe(CURP_A)
  })

  it('cambiar su CURP a uno que ya es de OTRO paciente de la clínica → conflicto controlado, no error crudo', async () => {
    servidor.push(pacienteServidor())
    servidor.push(pacienteServidor({ id: 'p-otro', curp: 'OTRO800101HDFRRN09', nombre_completo: 'Otra Persona' }))
    await encolarOperacion({
      id: 'actualizar_paciente_datos_p-otro', tipo: 'actualizar_paciente', entidad: 'pacientes', entidadId: 'p-otro',
      payload: { id: 'p-otro', cambios: { curp: CURP_A } }, dependeDe: [], usuarioId: 'u1', creado_en: 1
    })
    await procesarColaOffline()
    const [op] = await listarOperacionesPendientes()
    expect(op.estado).toBe('conflicto')
    expect(op.ultimoError).toBe(MENSAJE_CONFLICTO_CURP)
    expect(servidor.find((p) => p.id === 'p-otro').curp).toBe('OTRO800101HDFRRN09') // no se cambió nada
  })
})

describe('TEST 5 — CURP duplicado REAL (otra persona): conflicto controlado', () => {
  async function prepararConflicto() {
    servidor.push(pacienteServidor({ nombre_completo: 'María García' })) // mismo CURP, OTRO nombre
    const local = await crearOffline({ nombre_completo: 'Juan Pérez' })
    m.crearNotaClinica.mockResolvedValue({ id: 'nota' })
    await encolarOperacion({
      id: 'nota-dep', tipo: 'crear_nota_clinica', entidad: 'notas_clinicas', entidadId: 'nota-dep',
      payload: { id: 'nota-dep', pacienteIdOffline: local.id, contenido: 'Trabajo clínico offline' },
      dependeDe: [local.id], usuarioId: 'u1', creado_en: 2
    })
    return local
  }

  it('NO crea duplicado y NO se vincula a una persona distinta', async () => {
    const local = await prepararConflicto()
    await procesarColaOffline()
    expect(servidor).toHaveLength(1)
    expect(servidor[0].nombre_completo).toBe('María García')
    expect(await resolverId(local.id)).toBe(local.id) // sin mapeo: no se unió al expediente de otra persona
  })

  it('la operación queda en estado `conflicto` con un mensaje entendible — nunca el error crudo de PostgreSQL', async () => {
    const local = await prepararConflicto()
    await procesarColaOffline()
    const op = (await listarOperacionesPendientes()).find((o) => o.id === local.id)
    expect(op.estado).toBe('conflicto')
    expect(op.ultimoError).toBe(MENSAJE_CONFLICTO_CURP)
    expect(op.ultimoError).not.toMatch(/duplicate key|idx_pacientes|unique constraint/i)
    expect(m.toastError).toHaveBeenCalledWith(MENSAJE_CONFLICTO_CURP)
  })

  it('se CONSERVA la información local: el paciente y el trabajo clínico dependiente siguen ahí', async () => {
    const local = await prepararConflicto()
    await procesarColaOffline()
    expect(await obtenerPacienteOfflineLocal(local.id)).not.toBeNull()
    const ids = (await listarOperacionesPendientes()).map((o) => o.id).sort()
    expect(ids).toEqual(['nota-dep', local.id].sort())
    expect(m.crearNotaClinica).not.toHaveBeenCalled() // la nota espera a su padre, no se pierde ni se manda sola
  })

  it('NO se reintenta infinitamente: las corridas automáticas ya no lo intentan; el botón manual sí', async () => {
    await prepararConflicto()
    await procesarColaOffline()
    expect(intentosUpsert).toBe(1)

    await procesarColaOffline()
    await procesarColaOffline()
    expect(intentosUpsert).toBe(1) // automáticas: cero intentos nuevos

    await procesarColaOffline({ reintentarConflictos: true }) // botón "Reintentar sincronización"
    expect(intentosUpsert).toBe(2)
    expect((await listarOperacionesPendientes()).find((o) => o.estado === 'conflicto')).toBeTruthy() // sigue en conflicto, no se perdió
  })

  it('lo que depende del conflicto espera en silencio (no cuenta como "falla transitoria" ni repite avisos)', async () => {
    await prepararConflicto()
    await procesarColaOffline()
    m.toastError.mockClear()
    await procesarColaOffline()
    expect(m.toastError).not.toHaveBeenCalled()
  })

  it('el manual reintenta y, si el duplicado desapareció, se resuelve solo', async () => {
    const local = await prepararConflicto()
    await procesarColaOffline()
    servidor.length = 0 // alguien corrigió/eliminó el registro ajeno
    await procesarColaOffline({ reintentarConflictos: true })
    expect(servidor).toHaveLength(1)
    expect(await resolverId(local.id)).toBe(servidor[0].id)
    expect(await listarOperacionesPendientes()).toHaveLength(0)
    expect(m.crearNotaClinica).toHaveBeenCalledTimes(1) // y su nota por fin se sube
  })

  it('cuenta como "con error" (banner y bloqueo de cierre de sesión) y se puede descartar de inmediato', async () => {
    const local = await prepararConflicto()
    await procesarColaOffline()
    const operaciones = await listarOperacionesPendientes()
    const op = operaciones.find((o) => o.id === local.id)
    expect(operacionEsDescartable(op)).toBe(true) // no espera a 3 intentos
    const eval_ = evaluarOperaciones({ operaciones, userId: 'u1', conectado: true })
    expect(eval_.errores).toBe(1)
    expect(eval_.permitido).toBe(false) // el cierre de sesión sigue bloqueado
  })

  it('si el existente NO es visible para esta sesión (RLS) tampoco se asume que es la misma persona → conflicto', async () => {
    servidor.push(pacienteServidor()) // mismo nombre y CURP que el local...
    ocultarExistenteALaBusqueda = true // ...pero esta sesión no puede verlo, así que no puede comprobarlo
    const local = await crearOffline()

    await procesarColaOffline()

    expect(servidor).toHaveLength(1)
    expect(await resolverId(local.id)).toBe(local.id) // no se vinculó a ciegas
    const op = (await listarOperacionesPendientes()).find((o) => o.id === local.id)
    expect(op.estado).toBe('conflicto')
  })
})

describe('TEST 6 — mismo CURP en dos clínicas: permitido, y nunca se mezclan', () => {
  it('un paciente de la clínica A con ese CURP no cuenta como "existente" para la clínica B', async () => {
    servidor.push(pacienteServidor({ clinica_id: 'clinica-A' }))
    clinicaSesion = 'clinica-B'
    const local = await crearOffline({ nombre_completo: 'Otro Juan Pérez' })

    await procesarColaOffline()

    expect(servidor).toHaveLength(2)
    const deB = servidor.find((p) => p.clinica_id === 'clinica-B')
    expect(deB.curp).toBe(CURP_A)
    expect(await resolverId(local.id)).toBe(deB.id) // su propio paciente, no el de la clínica A
    expect(await listarOperacionesPendientes()).toHaveLength(0)
    expect(m.toastError).not.toHaveBeenCalled()
  })
})

describe('TEST 7 — paciente SIN CURP: el índice parcial no aplica', () => {
  it('dos pacientes sin CURP (aun con el mismo nombre) se crean sin conflicto', async () => {
    await crearPacienteOffline({ nombre_completo: 'Sin Curp', curp: null }, { usuarioId: 'u1' })
    await crearPacienteOffline({ nombre_completo: 'Sin Curp' }, { usuarioId: 'u1' })
    await procesarColaOffline()
    expect(servidor).toHaveLength(2)
    expect(await listarOperacionesPendientes()).toHaveLength(0)
  })
})

describe('TEST 9 / 10 — desconectar → reconectar, y cerrar el navegador con un conflicto pendiente', () => {
  it('un paciente creado sin conexión se sube al reconectar', async () => {
    const local = await crearOffline({ curp: 'NUEV800101HDFRRN02', nombre_completo: 'Nuevo Paciente' })
    expect(servidor).toHaveLength(0) // sin conexión: nada llegó al servidor
    await procesarColaOffline() // "reconecta"
    expect(servidor).toHaveLength(1)
    expect(await resolverId(local.id)).toBe(servidor[0].id)
  })

  it('el conflicto sobrevive al cierre del navegador: tras recargar los módulos sigue ahí, sin reintento automático', async () => {
    servidor.push(pacienteServidor({ nombre_completo: 'María García' }))
    const local = await crearOffline({ nombre_completo: 'Juan Pérez' })
    await procesarColaOffline()
    const intentosAntes = intentosUpsert

    vi.resetModules() // "cerrar y volver a abrir": se pierde la memoria, no IndexedDB
    const cola = await import('../../../../lib/colaOffline.js')
    const procesador = await import('../../../../lib/procesadorColaOffline.js')

    const op = (await cola.listarOperacionesPendientes()).find((o) => o.id === local.id)
    expect(op.estado).toBe('conflicto')
    await procesador.procesarColaOffline()
    expect(intentosUpsert).toBe(intentosAntes) // la corrida automática tras reabrir no reintenta
  })
})

describe('Creación EN LÍNEA con un CURP que otra persona acaba de registrar', () => {
  beforeEach(() => Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true }))

  it('rechaza con un mensaje entendible — no con el error crudo del índice — y no crea duplicado', async () => {
    servidor.push(pacienteServidor())
    await expect(crearPaciente({ nombre_completo: 'Otro', curp: CURP_A })).rejects.toThrow(MENSAJE_CURP_DUPLICADO)
    expect(servidor).toHaveLength(1)
  })

  it('un error que NO es del CURP se propaga tal cual (no se disfraza)', async () => {
    m.from.mockImplementation((tabla) => crearQueryMock(tabla, (t) => (t === 'usuarios' ? ok([{ id: 'x' }]) : fallo('otra falla', '500')), []))
    await expect(crearPaciente({ nombre_completo: 'X', curp: CURP_A })).rejects.toThrow('otra falla')
  })

  it('sin CURP no hay conflicto posible aunque el nombre se repita', async () => {
    servidor.push(pacienteServidor({ curp: null }))
    await expect(crearPaciente({ nombre_completo: 'Juan Pérez' })).resolves.toBeTruthy()
    expect(servidor).toHaveLength(2)
  })
})

describe('Hallazgo (15): el error NO viene de la réplica de lectura', () => {
  it('syncClinica/syncPacientes solo LEEN — nunca escriben en `pacientes`', async () => {
    servidor.push(pacienteServidor())
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true })
    await syncClinica()
    expect(intentosUpsert).toBe(0)
    expect(updatesVistos).toHaveLength(0)
    expect(servidor).toHaveLength(1)
  })
})
