import { describe, it, expect } from 'vitest'
import { sustituirVariables, construirVariablesDocumento } from '../../../lib/plantillaLegal'

describe('sustituirVariables', () => {
  it('reemplaza una variable con su valor real', () => {
    expect(sustituirVariables('Responsable: {{RESPONSABLE}}', { RESPONSABLE: 'Clínica Betty' }))
      .toBe('Responsable: Clínica Betty')
  })

  it('reemplaza varias variables distintas en el mismo texto', () => {
    const texto = 'Domicilio: {{DOMICILIO}}. Tel: {{TELEFONO}}.'
    const resultado = sustituirVariables(texto, { DOMICILIO: 'Av. Reforma 123', TELEFONO: '555-1234' })
    expect(resultado).toBe('Domicilio: Av. Reforma 123. Tel: 555-1234.')
  })

  it('una variable sin valor configurado muestra un marcador visible, nunca texto vacío ni la llave literal', () => {
    const resultado = sustituirVariables('Correo: {{CORREO_PRIVACIDAD}}', {})
    expect(resultado).toBe('Correo: [CORREO_PRIVACIDAD — pendiente de configurar]')
    expect(resultado).not.toContain('{{')
  })

  it('null y cadena vacía se tratan igual que "sin configurar" — nunca se inventa un valor', () => {
    expect(sustituirVariables('{{RFC}}', { RFC: null })).toBe('[RFC — pendiente de configurar]')
    expect(sustituirVariables('{{RFC}}', { RFC: '' })).toBe('[RFC — pendiente de configurar]')
  })

  it('contenido sin ninguna variable se devuelve intacto', () => {
    expect(sustituirVariables('Texto normal sin variables.', {})).toBe('Texto normal sin variables.')
  })

  it('contenido vacío o null no rompe, devuelve cadena vacía', () => {
    expect(sustituirVariables('', {})).toBe('')
    expect(sustituirVariables(null, {})).toBe('')
  })

  it('la misma variable repetida varias veces se sustituye todas las veces', () => {
    const resultado = sustituirVariables('{{VERSION}} - copia {{VERSION}}', { VERSION: '1.0' })
    expect(resultado).toBe('1.0 - copia 1.0')
  })
})

describe('construirVariablesDocumento', () => {
  it('usa razon_social si existe, cae a nombre si no', () => {
    expect(construirVariablesDocumento({ clinica: { razon_social: 'Betty SA de CV', nombre: 'Clínica Betty' }, documento: {} }).RESPONSABLE)
      .toBe('Betty SA de CV')
    expect(construirVariablesDocumento({ clinica: { nombre: 'Clínica Betty' }, documento: {} }).RESPONSABLE)
      .toBe('Clínica Betty')
  })

  it('usa correo_privacidad si existe, cae a correo general si no', () => {
    expect(construirVariablesDocumento({ clinica: { correo_privacidad: 'privacidad@x.com', correo: 'info@x.com' }, documento: {} }).CORREO_PRIVACIDAD)
      .toBe('privacidad@x.com')
    expect(construirVariablesDocumento({ clinica: { correo: 'info@x.com' }, documento: {} }).CORREO_PRIVACIDAD)
      .toBe('info@x.com')
  })

  it('sin clinica ni documento, todas las variables quedan en null (no inventa nada)', () => {
    const vars = construirVariablesDocumento({ clinica: null, documento: null })
    expect(vars.RESPONSABLE).toBe(null)
    expect(vars.FECHA_ACTUALIZACION).toBe(null)
    expect(vars.VERSION).toBe(null)
  })

  it('FECHA_ACTUALIZACION se formatea en español desde publicado_en', () => {
    const vars = construirVariablesDocumento({ clinica: null, documento: { publicado_en: '2026-03-15T00:00:00Z' } })
    expect(vars.FECHA_ACTUALIZACION).toContain('2026')
    expect(vars.FECHA_ACTUALIZACION).toContain('marzo')
  })
})
