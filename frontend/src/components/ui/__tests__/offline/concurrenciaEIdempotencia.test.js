import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { crearQueryMock, ok, fallo, llamada } from './helpers/supabaseMock.js'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: supabaseMock }))

import { actualizarPiezaOdontograma, actualizarCara } from '../../../../services/odontograma.js'
import { actualizarPiezaPeriodontal, actualizarSitioPeriodontal } from '../../../../services/periodontograma.js'
import { actualizarExpediente, crearNotaClinica } from '../../../../services/expedientes.js'
import { actualizarPaciente } from '../../../../services/pacientes.js'
import { actualizarCita, crearCita } from '../../../../services/citas.js'
import { crearReceta } from '../../../../services/recetas.js'

let registro
let respuesta
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  registro = []
  respuesta = ok({ id: 'x' })
  supabaseMock.from.mockReset()
  supabaseMock.from.mockImplementation((t) => crearQueryMock(t, () => respuesta, registro))
})

// PGRST116 = "0 filas coinciden" — lo que devuelve PostgREST cuando el
// UPDATE no encontró la fila con el actualizado_en esperado, es decir,
// cuando alguien más la modificó mientras se trabajaba.
const conflictoDePostgrest = () => fallo('JSON object requested, multiple (or no) rows returned', 'PGRST116')

const ESPERADO = '2026-09-27T10:00:00.000Z'

// Todos los servicios que actualizan un registro clínico editable.
const ACTUALIZADORES = [
  ['pieza de odontograma', (lock) => actualizarPiezaOdontograma('p1', { estado: 'corona', usuarioId: 'u1', actualizadoEnEsperado: lock }), 'odontograma_piezas'],
  ['cara de odontograma',  (lock) => actualizarCara('c1', { estado: 'caries', usuarioId: 'u1', actualizadoEnEsperado: lock }), 'odontograma_caras'],
  ['pieza periodontal',    (lock) => actualizarPiezaPeriodontal('p1', { movilidad: 1, furcacion: 0, usuarioId: 'u1', actualizadoEnEsperado: lock }), 'periodontograma_piezas'],
  ['sitio periodontal',    (lock) => actualizarSitioPeriodontal('s1', { recesion: 2, usuarioId: 'u1', actualizadoEnEsperado: lock }), 'periodontograma_sitios'],
  ['expediente',           (lock) => actualizarExpediente('e1', { alergias: [] }, lock), 'expedientes'],
  ['paciente',             (lock) => actualizarPaciente('p1', { telefono: '555' }, lock), 'pacientes'],
  ['cita',                 (lock) => actualizarCita('c1', { estado: 'completada' }, lock), 'citas']
]

describe('Control de concurrencia (sección 9, prueba #19)', () => {
  describe.each(ACTUALIZADORES)('%s', (_nombre, actualizar, tabla) => {
    it('el UPDATE lleva la condición actualizado_en = <valor visto al abrir>', async () => {
      await actualizar(ESPERADO)

      const { operaciones } = registro.find((r) => r.tabla === tabla)
      const condiciones = operaciones.filter(([m]) => m === 'eq').map(([, args]) => args)
      expect(condiciones).toContainEqual(['actualizado_en', ESPERADO])
    })

    it('si alguien más la cambió (0 filas coinciden), lanza CONFLICTO_CONCURRENCIA — no sobrescribe en silencio', async () => {
      respuesta = conflictoDePostgrest()
      await expect(actualizar(ESPERADO)).rejects.toThrow('CONFLICTO_CONCURRENCIA')
    })

    it('el frontend ya NO fija actualizado_en a mano: lo decide el servidor (trigger)', async () => {
      await actualizar(ESPERADO)
      const { operaciones } = registro.find((r) => r.tabla === tabla)
      const [, [cambios]] = llamada(operaciones, 'update')
      expect(cambios).not.toHaveProperty('actualizado_en')
    })

    it('sin candado (no se pasó valor esperado) no agrega la condición ni disfraza otros errores', async () => {
      await actualizar(undefined)
      const { operaciones } = registro.find((r) => r.tabla === tabla)
      const condiciones = operaciones.filter(([m]) => m === 'eq').map(([, a]) => a[0])
      expect(condiciones).not.toContain('actualizado_en')

      respuesta = conflictoDePostgrest()
      const error = await actualizar(undefined).catch((e) => e)
      expect(String(error.message ?? error)).not.toContain('CONFLICTO_CONCURRENCIA')
    })
  })

  it('citas: el conflicto se detecta ANTES de que mensajeError() envuelva el error y pierda su código', async () => {
    respuesta = conflictoDePostgrest()
    await expect(actualizarCita('c1', {}, ESPERADO)).rejects.toThrow('CONFLICTO_CONCURRENCIA')
  })

  it('citas: un choque de horario real sigue diciendo lo que decía (no lo confunde con concurrencia)', async () => {
    respuesta = fallo('conflicting key value violates exclusion constraint', '23P01')
    await expect(actualizarCita('c1', {}, ESPERADO)).rejects.toThrow('Ese horario ya está ocupado para este dentista.')
  })
})

describe('Sin duplicados al reintentar (sección 8, prueba #18)', () => {
  // Crear con upsert sobre un id generado en el navegador: si la
  // primera subida sí llegó pero la respuesta se perdió, el reintento
  // pisa la misma fila en vez de crear una segunda.
  it.each([
    ['nota clínica', () => crearNotaClinica({ id: 'n1', contenido: 'x' }), 'notas_clinicas'],
    ['receta',       () => crearReceta({ id: 'r1', medicamentos: [] }),    'recetas'],
    ['cita (seguimiento)', () => crearCita({ id: 'c9', inicio: 'a', fin: 'b' }), 'citas']
  ])('%s: se crea con upsert (nunca insert) para que reintentar no duplique', async (_n, crear, tabla) => {
    await crear()
    const { operaciones } = registro.find((r) => r.tabla === tabla)
    const metodos = operaciones.map(([m]) => m)

    expect(metodos).toContain('upsert')
    expect(metodos).not.toContain('insert')
  })

  it('reintentar la misma nota manda el MISMO id las dos veces', async () => {
    await crearNotaClinica({ id: 'n1', contenido: 'x' })
    await crearNotaClinica({ id: 'n1', contenido: 'x' })

    const ids = registro
      .filter((r) => r.tabla === 'notas_clinicas')
      .map((r) => llamada(r.operaciones, 'upsert')[1][0].id)
    expect(ids).toEqual(['n1', 'n1'])
  })
})
