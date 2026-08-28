import { describe, it, expect } from 'vitest'
import { formatearAlergias } from '../imprimirExpedienteCompleto'

describe('formatearAlergias — nunca JSON crudo en la impresión', () => {
  it('el caso exacto reportado como bug: un objeto {tipo, severidad, sustancia} en arreglo', () => {
    const resultado = formatearAlergias([{ tipo: 'otro', severidad: 'Moderada', sustancia: 'Yodo' }])
    expect(resultado).toBe('Yodo — Moderada')
    expect(resultado).not.toContain('{')
    expect(resultado).not.toContain('"tipo"')
  })

  it('el mismo objeto, pero SIN arreglo (un solo objeto directo)', () => {
    expect(formatearAlergias({ tipo: 'otro', severidad: 'Moderada', sustancia: 'Yodo' })).toBe('Yodo — Moderada')
  })

  it('varias alergias: se muestran todas, separadas por " · ", en el formato exacto pedido', () => {
    const resultado = formatearAlergias([
      { sustancia: 'Penicilina', severidad: 'Grave' },
      { sustancia: 'Yodo', severidad: 'Moderada' },
      { sustancia: 'Látex', severidad: 'Leve' },
    ])
    expect(resultado).toBe('Penicilina — Grave · Yodo — Moderada · Látex — Leve')
  })

  it('JSON guardado como texto (string) en vez de objeto/arreglo ya parseado', () => {
    const comoTexto = JSON.stringify([{ sustancia: 'Yodo', severidad: 'Moderada' }])
    expect(formatearAlergias(comoTexto)).toBe('Yodo — Moderada')
  })

  it('JSON de un solo objeto guardado como texto', () => {
    const comoTexto = JSON.stringify({ sustancia: 'Yodo', severidad: 'Moderada' })
    expect(formatearAlergias(comoTexto)).toBe('Yodo — Moderada')
  })

  it('null → "No referidas"', () => {
    expect(formatearAlergias(null)).toBe('No referidas')
  })

  it('undefined → "No referidas"', () => {
    expect(formatearAlergias(undefined)).toBe('No referidas')
  })

  it('objeto vacío {} → "No referidas", nunca "{}" literal', () => {
    const resultado = formatearAlergias({})
    expect(resultado).toBe('No referidas')
    expect(resultado).not.toContain('{')
  })

  it('arreglo vacío [] → "No referidas"', () => {
    expect(formatearAlergias([])).toBe('No referidas')
  })

  it('string vacío → "No referidas"', () => {
    expect(formatearAlergias('')).toBe('No referidas')
    expect(formatearAlergias('   ')).toBe('No referidas')
  })

  it('falta sustancia pero hay severidad: nunca aparece "undefined" ni "null"', () => {
    const resultado = formatearAlergias([{ tipo: 'otro', severidad: 'Grave' }])
    expect(resultado).toBe('Grave')
    expect(resultado).not.toContain('undefined')
    expect(resultado).not.toContain('null')
  })

  it('objeto sin severidad ni sustancia/nombre (ningún dato útil) dentro de un arreglo con otro válido: se omite el vacío, se conserva el válido', () => {
    const resultado = formatearAlergias([{ tipo: 'otro' }, { sustancia: 'Yodo', severidad: 'Moderada' }])
    expect(resultado).toBe('Yodo — Moderada')
  })

  it('arreglo de strings simples (formato antiguo, sin objeto estructurado) se conserva tal cual', () => {
    expect(formatearAlergias(['Penicilina', 'Yodo'])).toBe('Penicilina · Yodo')
  })

  it('texto plano no-JSON (dato capturado de forma libre en algún momento): se imprime tal cual, no se descarta', () => {
    expect(formatearAlergias('Penicilina y derivados de yodo')).toBe('Penicilina y derivados de yodo')
  })

  it('usa "nombre" o "alergia" como respaldo si no existe "sustancia"', () => {
    expect(formatearAlergias([{ nombre: 'Aspirina', severidad: 'Leve' }])).toBe('Aspirina — Leve')
    expect(formatearAlergias([{ alergia: 'Polen', severidad: 'Leve' }])).toBe('Polen — Leve')
  })
})
