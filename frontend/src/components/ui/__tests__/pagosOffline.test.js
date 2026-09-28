import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { registrarPago } from '../../../services/pagos'

describe('registrarPago - decisión deliberada de exigir conexión real', () => {
  const originalOnLine = globalThis.navigator?.onLine

  afterEach(() => {
    if (globalThis.navigator) {
      Object.defineProperty(globalThis.navigator, 'onLine', { value: originalOnLine, configurable: true })
    }
  })

  it('rechaza con un mensaje claro cuando no hay conexión, sin siquiera intentar la red', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true })
    await expect(registrarPago({ monto: 100 })).rejects.toThrow('Los pagos requieren conexión a internet.')
  })
})
