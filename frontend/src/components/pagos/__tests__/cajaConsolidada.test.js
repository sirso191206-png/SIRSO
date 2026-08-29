import { describe, it, expect } from 'vitest'
import { calcularTotalesPorSucursal } from '../../../lib/cajaConsolidada'

describe('calcularTotalesPorSucursal — corte de caja consolidado', () => {
  it('agrupa correctamente pagos de 2 sucursales distintas', () => {
    const pagos = [
      { sucursal_id: 'centro', sucursal: { nombre: 'Centro' }, tipo: 'pago', monto: 500 },
      { sucursal_id: 'centro', sucursal: { nombre: 'Centro' }, tipo: 'pago', monto: 300 },
      { sucursal_id: 'norte', sucursal: { nombre: 'Norte' }, tipo: 'pago', monto: 1000 },
    ]
    const resultado = calcularTotalesPorSucursal(pagos)
    expect(resultado).toHaveLength(2)
    expect(resultado.find((r) => r.nombre === 'Centro').total).toBe(800)
    expect(resultado.find((r) => r.nombre === 'Norte').total).toBe(1000)
  })

  it('los reembolsos restan del total, no suman', () => {
    const pagos = [
      { sucursal_id: 'centro', sucursal: { nombre: 'Centro' }, tipo: 'pago', monto: 500 },
      { sucursal_id: 'centro', sucursal: { nombre: 'Centro' }, tipo: 'reembolso', monto: 100 },
    ]
    const resultado = calcularTotalesPorSucursal(pagos)
    expect(resultado[0].total).toBe(400)
  })

  it('pagos sin sucursal_id se agrupan como "Sin sucursal", nunca se descartan', () => {
    const pagos = [
      { sucursal_id: null, sucursal: null, tipo: 'pago', monto: 200 },
      { sucursal_id: null, sucursal: null, tipo: 'pago', monto: 300 },
    ]
    const resultado = calcularTotalesPorSucursal(pagos)
    expect(resultado).toHaveLength(1)
    expect(resultado[0].nombre).toBe('Sin sucursal')
    expect(resultado[0].sucursalId).toBe(null)
    expect(resultado[0].total).toBe(500)
  })

  it('arreglo vacío devuelve arreglo vacío', () => {
    expect(calcularTotalesPorSucursal([])).toEqual([])
  })

  it('mezcla de pagos con y sin sucursal: cada grupo por separado', () => {
    const pagos = [
      { sucursal_id: 'centro', sucursal: { nombre: 'Centro' }, tipo: 'pago', monto: 500 },
      { sucursal_id: null, sucursal: null, tipo: 'pago', monto: 100 },
    ]
    const resultado = calcularTotalesPorSucursal(pagos)
    expect(resultado).toHaveLength(2)
  })
})
