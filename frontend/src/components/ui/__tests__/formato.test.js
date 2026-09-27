import { describe, it, expect } from 'vitest'
import { formatearMoneda } from '../../../lib/formato'

describe('formatearMoneda', () => {
  it('agrega separador de miles con coma, como pidió el usuario (1,000)', () => {
    expect(formatearMoneda(1000)).toBe('1,000.00')
  })

  it('funciona con miles de miles', () => {
    expect(formatearMoneda(1234567.5)).toBe('1,234,567.50')
  })

  it('siempre muestra 2 decimales, incluso con números enteros', () => {
    expect(formatearMoneda(50)).toBe('50.00')
  })

  it('acepta strings numéricos (tal como vienen de Supabase a veces)', () => {
    expect(formatearMoneda('1500.5')).toBe('1,500.50')
  })

  it('redondea a 2 decimales cuando hay más', () => {
    expect(formatearMoneda(10.999)).toBe('11.00')
  })

  it('maneja cero y negativos correctamente', () => {
    expect(formatearMoneda(0)).toBe('0.00')
    expect(formatearMoneda(-250.5)).toBe('-250.50')
  })
})
