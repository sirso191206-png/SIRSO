// Borrado real (no cancelar/anular) de tratamientos y pagos — online
// solo, a propósito (ver hooks/useTratamientos.js). Lo único con
// lógica real que probar aquí es la traducción del error de llave
// foránea a un mensaje claro — el resto es un DELETE directo.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { crearQueryMock, ok, fallo } from './helpers/supabaseMock.js'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: supabaseMock }))

import { eliminarTratamiento } from '../../../../services/tratamientos.js'
import { eliminarPago } from '../../../../services/pagos.js'

beforeEach(() => {
  supabaseMock.from.mockReset()
})

describe('eliminarTratamiento', () => {
  it('con éxito, borra sin lanzar', async () => {
    supabaseMock.from.mockImplementation((t) => crearQueryMock(t, () => ok(null), []))
    await expect(eliminarTratamiento('t1')).resolves.toBeUndefined()
  })

  it('si tiene pagos/fotografías asociadas (23503), traduce a un mensaje claro — no el error crudo de Postgres', async () => {
    supabaseMock.from.mockImplementation((t) => crearQueryMock(t, () => fallo('violates foreign key constraint', '23503'), []))
    await expect(eliminarTratamiento('t1')).rejects.toThrow('No se puede eliminar: tiene pagos o fotografías asociadas. Puedes cancelarlo en su lugar.')
  })

  it('cualquier otro error se propaga tal cual, sin inventar un mensaje que no aplica', async () => {
    supabaseMock.from.mockImplementation((t) => crearQueryMock(t, () => fallo('algo más se rompió', '500'), []))
    await expect(eliminarTratamiento('t1')).rejects.toThrow('algo más se rompió')
  })
})

describe('eliminarPago', () => {
  it('con éxito, borra sin lanzar', async () => {
    supabaseMock.from.mockImplementation((t) => crearQueryMock(t, () => ok(null), []))
    await expect(eliminarPago('p1')).resolves.toBeUndefined()
  })

  it('un error se propaga, no se pierde en silencio', async () => {
    supabaseMock.from.mockImplementation((t) => crearQueryMock(t, () => fallo('sin red'), []))
    await expect(eliminarPago('p1')).rejects.toThrow()
  })
})
