import { describe, it, expect, vi, afterEach } from 'vitest'
import { esHoy } from '../../../../hooks/usePrecargaAutomaticaDelDia.js'

describe('esHoy', () => {
  afterEach(() => vi.useRealTimers())

  it('null/undefined nunca es "hoy" — nunca se salta la primera precarga del día', () => {
    expect(esHoy(null)).toBe(false)
    expect(esHoy(undefined)).toBe(false)
  })

  it('una fecha de hoy mismo (otra hora) cuenta como "hoy"', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 1, 18, 0, 0))
    expect(esHoy(new Date(2026, 9, 1, 7, 30, 0).toISOString())).toBe(true)
  })

  it('una fecha de AYER no cuenta como "hoy" — debe volver a precargar', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 2, 8, 0, 0))
    expect(esHoy(new Date(2026, 9, 1, 23, 59, 0).toISOString())).toBe(false)
  })

  it('una fecha futura (reloj mal puesto) tampoco cuenta como "hoy"', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 1, 8, 0, 0))
    expect(esHoy(new Date(2026, 9, 2, 0, 1, 0).toISOString())).toBe(false)
  })
})
