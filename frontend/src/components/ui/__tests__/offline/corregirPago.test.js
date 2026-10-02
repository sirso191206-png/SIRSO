// "Editar" un pago no edita de verdad — la base de datos lo bloquea a
// propósito (migración 062). corregirPago() hace, por dentro, la
// secuencia segura ya permitida: anular el original + registrar uno
// nuevo con los valores corregidos.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { crearQueryMock, ok, fallo } from './helpers/supabaseMock.js'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: supabaseMock }))

import { corregirPago } from '../../../../services/pagos.js'

const ponerConexion = (enLinea) => Object.defineProperty(globalThis.navigator, 'onLine', { value: enLinea, configurable: true })

const pagoOriginal = {
  id: 'pago-1', paciente_id: 'p1', tratamiento_id: 't1', tipo: 'pago',
  monto: 2000, metodo: 'efectivo', registrado_por: 'u-original'
}

let updatesVistos
let insertsVistos
beforeEach(() => {
  ponerConexion(true)
  updatesVistos = []
  insertsVistos = []
  supabaseMock.from.mockReset()
  supabaseMock.from.mockImplementation((t) =>
    crearQueryMock(t, (tabla, operaciones) => {
      const upd = operaciones.find(([m]) => m === 'update')
      if (upd) { updatesVistos.push(upd[1][0]); return ok({ id: pagoOriginal.id, ...pagoOriginal, ...upd[1][0] }) }
      const ins = operaciones.find(([m]) => m === 'insert')
      if (ins) { insertsVistos.push(ins[1][0]); return ok({ id: 'pago-nuevo', numero_recibo: 'REC-00099', ...ins[1][0] }) }
      return ok(null)
    }, [])
  )
})

describe('corregirPago', () => {
  it('anula el original con un motivo claro, y registra uno nuevo con el monto/método corregidos', async () => {
    const nuevo = await corregirPago(pagoOriginal, { monto: 200, metodo: 'tarjeta' }, { usuarioId: 'u-editor' })

    expect(updatesVistos).toHaveLength(1)
    expect(updatesVistos[0].anulado_en).toBeTruthy()
    expect(updatesVistos[0].anulado_por).toBe('u-editor')
    expect(updatesVistos[0].motivo_anulacion).toContain('Corrección')

    expect(insertsVistos).toHaveLength(1)
    expect(insertsVistos[0].monto).toBe(200)
    expect(insertsVistos[0].metodo).toBe('tarjeta')
    expect(insertsVistos[0].registrado_por).toBe('u-editor')
    expect(nuevo.id).toBe('pago-nuevo')
  })

  it('conserva paciente, tratamiento y tipo del pago original — solo cambia monto/método', async () => {
    await corregirPago(pagoOriginal, { monto: 500, metodo: 'otro' }, { usuarioId: 'u-editor' })
    expect(insertsVistos[0].paciente_id).toBe('p1')
    expect(insertsVistos[0].tratamiento_id).toBe('t1')
    expect(insertsVistos[0].tipo).toBe('pago')
  })

  it('el pago nuevo NUNCA hereda quién registró el original — queda a nombre de quien corrige', async () => {
    await corregirPago(pagoOriginal, { monto: 500, metodo: 'efectivo' }, { usuarioId: 'u-editor' })
    expect(insertsVistos[0].registrado_por).toBe('u-editor')
    expect(insertsVistos[0].registrado_por).not.toBe('u-original')
  })

  it('si anular falla, nunca llega a registrar el nuevo (no se duplica ni queda huérfano)', async () => {
    supabaseMock.from.mockImplementation((t) => crearQueryMock(t, () => fallo('no se pudo anular'), []))
    await expect(corregirPago(pagoOriginal, { monto: 500, metodo: 'efectivo' }, { usuarioId: 'u-editor' })).rejects.toBeTruthy()
    expect(insertsVistos).toHaveLength(0)
  })

  it('sin conexión, falla igual que registrar un pago nuevo cualquiera', async () => {
    ponerConexion(false)
    await expect(corregirPago(pagoOriginal, { monto: 500, metodo: 'efectivo' }, { usuarioId: 'u-editor' })).rejects.toThrow('Los pagos requieren conexión a internet.')
  })

  it('motivo por defecto si no se da uno explícito', async () => {
    await corregirPago(pagoOriginal, { monto: 500, metodo: 'efectivo' }, { usuarioId: 'u-editor' })
    expect(updatesVistos[0].motivo_anulacion).toBe('Corrección de monto/método')
  })
})
