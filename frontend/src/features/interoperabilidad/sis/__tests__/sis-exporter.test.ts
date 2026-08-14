// ============================================================
// Pruebas del motor de exportación SIS (corte A).
// La prueba clave es la "dorada": tomar el archivo oficial de la
// DGIS, parsearlo a registros, volver a exportarlo y verificar que
// el resultado es IDÉNTICO byte a byte al original.
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  construirEncabezado,
  construirTxt,
  construirTxtBytes,
  construirNombreArchivo,
  codificarWindows1252,
  parsearTxt,
  serializarRegistro,
} from '../sis-exporter'
import { SIS_FIELDS, SIS_HEADER_TOKENS, type SisRegistro } from '../sis-types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_OFICIAL = join(__dirname, 'fixtures', 'CSB-EJEMPLOS-2410.txt')

describe('estructura base', () => {
  it('hay exactamente 77 variables y 77 encabezados', () => {
    expect(SIS_FIELDS).toHaveLength(77)
    expect(SIS_HEADER_TOKENS).toHaveLength(77)
  })

  it('preserva el espacio intencional en FECHACONSULTA (col 24)', () => {
    expect(SIS_HEADER_TOKENS[23]).toBe('FECHACONSULTA ')
  })
})

describe('prueba dorada: round-trip contra el archivo oficial', () => {
  // Leemos como latin-1 (Windows-1252 es ASCII-compatible en este ejemplo).
  const bytesOriginales = readFileSync(RUTA_OFICIAL)
  const contenidoOriginal = bytesOriginales.toString('latin1')

  it('el encabezado generado coincide con el del archivo oficial', () => {
    const encabezadoOficial = contenidoOriginal.split('\r\n')[0]
    expect(construirEncabezado()).toBe(encabezadoOficial)
  })

  it('reexportar los registros parseados reproduce el archivo carácter por carácter', () => {
    const { registros } = parsearTxt(contenidoOriginal)
    expect(registros).toHaveLength(10)
    const regenerado = construirTxt(registros)
    expect(regenerado).toBe(contenidoOriginal)
  })

  it('reexportar reproduce el archivo BYTE por BYTE (incluye codificación y CRLF final)', () => {
    const { registros } = parsearTxt(contenidoOriginal)
    const bytesRegenerados = construirTxtBytes(registros)
    expect(Buffer.from(bytesRegenerados).equals(bytesOriginales)).toBe(true)
  })
})

describe('formato de líneas', () => {
  const registro = Object.fromEntries(
    SIS_FIELDS.map((c) => [c, '0']),
  ) as unknown as SisRegistro

  it('usa CRLF entre líneas y CRLF final', () => {
    const txt = construirTxt([registro])
    expect(txt.endsWith('\r\n')).toBe(true)
    // encabezado + 1 registro + terminador final => 2 CRLF
    expect(txt.split('\r\n').filter((l) => l.length > 0)).toHaveLength(2)
  })

  it('serializa 77 campos separados por "|"', () => {
    expect(serializarRegistro(registro).split('|')).toHaveLength(77)
  })

  it('une valores multivalor con "&"', () => {
    const r = { ...registro, derechohabiencia: ['2', '3'] } as SisRegistro
    expect(serializarRegistro(r)).toContain('2&3')
  })

  it('deja vacíos los campos nulos (diagnósticos 2 y 3)', () => {
    const r = {
      ...registro,
      primeraVezDiagnostico2: '-1',
      codigoCIEDiagnostico2: '',
      primeraVezDiagnostico3: '-1',
      codigoCIEDiagnostico3: '',
    } as SisRegistro
    expect(serializarRegistro(r)).toContain('-1||-1|')
  })
})

describe('codificación Windows-1252', () => {
  it('codifica Ñ como 0xD1 (un solo byte, no UTF-8)', () => {
    const bytes = codificarWindows1252('Ñ')
    expect(Array.from(bytes)).toEqual([0xd1])
  })

  it('la diéresis ¨ es un solo byte 0xA8', () => {
    expect(Array.from(codificarWindows1252('¨'))).toEqual([0xa8])
  })

  it('lanza error claro ante un carácter no representable', () => {
    expect(() => codificarWindows1252('😀')).toThrow(/no representable/i)
  })
})

describe('nomenclatura del archivo', () => {
  it('arma CSB-{ent}{inst}-{AAMM}.TXT como el ejemplo de la guía', () => {
    const nombre = construirNombreArchivo({
      entidad: 'DF',
      institucion: 'SSA',
      anio: 2024,
      mes: 10,
    })
    expect(nombre).toBe('CSB-DFSSA-2410.TXT')
  })

  it('soporta las extensiones CIF y ZIP del flujo posterior', () => {
    const base = { entidad: 'MC', institucion: 'IMB', anio: 2024, mes: 3 }
    expect(construirNombreArchivo({ ...base, extension: 'CIF' })).toBe('CSB-MCIMB-2403.CIF')
    expect(construirNombreArchivo({ ...base, extension: 'ZIP' })).toBe('CSB-MCIMB-2403.ZIP')
  })

  it('rechaza entidad/institución con longitud incorrecta', () => {
    expect(() =>
      construirNombreArchivo({ entidad: 'DFF', institucion: 'SSA', anio: 2024, mes: 10 }),
    ).toThrow()
  })
})
