// ============================================================
// SIRO — Interoperabilidad SIS (Salud Bucal)
// Referencia: GIIS-B016-04-08, versión 4.8 (01/nov/2024)
// ------------------------------------------------------------
// Motor de exportación del documento de intercambio (.TXT).
//
// Responsabilidades:
//  - Serializar registros al TXT con el ORDEN, ENCABEZADO y
//    SEPARADORES exactos de la guía (| campos, & multivalor).
//  - Terminar líneas en CRLF (\r\n), incluida la última.
//  - Codificar en ANSI / Windows-1252 (no UTF-8).
//  - Construir la nomenclatura del archivo (CSB-{ent}{inst}-{AAMM}).
//
// NO valida reglas de negocio (eso es sis-validator, corte D) ni
// arma los registros desde SIRO (eso es sis-mapper, corte B).
// Deja el punto de extensión para el cifrado 3DES y la carga
// oficial (corte E).
// ============================================================

import {
  SIS_FIELDS,
  SIS_HEADER_TOKENS,
  type SisFieldKey,
  type SisRegistro,
} from './sis-types'

// El "#" queda reservado para subvariables (no se usa en esta guía
// de Salud Bucal, pero se documenta el separador por si otra guía lo
// requiere en el futuro).
const SEP_CAMPO = '|'
const SEP_MULTIVALOR = '&'
const EOL = '\r\n'

// ------------------------------------------------------------
// Serialización de un valor de campo.
// ------------------------------------------------------------
function serializarValor(valor: SisRegistro[SisFieldKey]): string {
  if (valor === null || valor === undefined) return ''
  if (Array.isArray(valor)) {
    return valor.map((v) => String(v)).join(SEP_MULTIVALOR)
  }
  return String(valor)
}

/** Serializa un registro a su línea de 77 campos separados por "|". */
export function serializarRegistro(registro: SisRegistro): string {
  return SIS_FIELDS.map((campo) => serializarValor(registro[campo])).join(SEP_CAMPO)
}

/** Línea de encabezado exacta (77 tokens en MAYÚSCULAS, unida por "|"). */
export function construirEncabezado(): string {
  return SIS_HEADER_TOKENS.join(SEP_CAMPO)
}

/**
 * Construye el contenido TXT completo como string (encabezado +
 * registros), con líneas CRLF y CRLF final.
 */
export function construirTxt(registros: SisRegistro[]): string {
  const lineas = [construirEncabezado(), ...registros.map(serializarRegistro)]
  // CRLF entre líneas y también al final (como el archivo oficial).
  return lineas.join(EOL) + EOL
}

// ------------------------------------------------------------
// Codificación ANSI / Windows-1252.
//
// El navegador solo trae TextEncoder para UTF-8, así que
// codificamos a Windows-1252 a mano. Los caracteres que usa esta
// guía (A–Z, Ñ, dígitos y los especiales - , . / ' ¨) caen todos
// dentro de CP1252, por lo que no se pierde información.
// ------------------------------------------------------------

// Bloque 0x80–0x9F de CP1252 (los code points que difieren de
// Latin-1). Se incluye por completitud; los datos de salud bucal no
// deberían producir estos caracteres.
const CP1252_ALTOS: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
}

/**
 * Codifica un string a bytes Windows-1252. Lanza error con el
 * carácter ofensor si algo no es representable (para que la capa de
 * validación/UI lo reporte en vez de corromper el archivo en silencio).
 */
export function codificarWindows1252(texto: string): Uint8Array {
  const bytes: number[] = []
  for (const ch of texto) {
    const cp = ch.codePointAt(0) as number
    if (cp <= 0x7f || (cp >= 0xa0 && cp <= 0xff)) {
      // ASCII y bloque alto de Latin-1 (incluye Ñ=0xD1, ¨=0xA8).
      bytes.push(cp)
    } else if (cp in CP1252_ALTOS) {
      bytes.push(CP1252_ALTOS[cp])
    } else {
      throw new Error(
        `Carácter no representable en Windows-1252: "${ch}" (U+${cp
          .toString(16)
          .toUpperCase()
          .padStart(4, '0')}). Revísalo antes de exportar.`,
      )
    }
  }
  return Uint8Array.from(bytes)
}

/** Contenido TXT completo ya codificado en Windows-1252 (listo para descargar). */
export function construirTxtBytes(registros: SisRegistro[]): Uint8Array {
  return codificarWindows1252(construirTxt(registros))
}

// ------------------------------------------------------------
// Nomenclatura del archivo.
//   CSB-{ENT}{INST}-{AA}{MM}.{EXT}
//   ej. CSB-DFSSA-2410.TXT  (entidad DF, institución SSA, oct 2024)
// La entidad (2) y la institución (3) provienen de la nomenclatura
// de la CLUES; aquí se reciben como parámetros. El derivarlas de la
// CLUES vive en sis-catalogs (corte siguiente).
// ------------------------------------------------------------
export type ExtensionSis = 'TXT' | 'CIF' | 'ZIP'

export function construirNombreArchivo(params: {
  entidad: string // 2 caracteres
  institucion: string // 3 caracteres
  anio: number // año completo, ej. 2024
  mes: number // 1–12
  extension?: ExtensionSis
}): string {
  const { entidad, institucion, anio, mes, extension = 'TXT' } = params

  const ent = entidad.toUpperCase()
  const inst = institucion.toUpperCase()
  if (ent.length !== 2) throw new Error('La entidad debe tener 2 caracteres.')
  if (inst.length !== 3) throw new Error('La institución debe tener 3 caracteres.')
  if (mes < 1 || mes > 12) throw new Error('El mes debe estar entre 1 y 12.')

  const aa = String(anio % 100).padStart(2, '0')
  const mm = String(mes).padStart(2, '0')
  return `CSB-${ent}${inst}-${aa}${mm}.${extension}`
}

// ------------------------------------------------------------
// Parser (round-trip): útil para la prueba dorada y para una
// futura importación/verificación de archivos. Convierte un TXT en
// arreglo de registros crudos (todos los valores como string).
// ------------------------------------------------------------
export interface ResultadoParseo {
  encabezado: string[]
  registros: SisRegistro[]
}

export function parsearTxt(contenido: string): ResultadoParseo {
  const lineas = contenido.split(EOL).filter((l) => l.length > 0)
  if (lineas.length === 0) {
    return { encabezado: [], registros: [] }
  }
  const encabezado = lineas[0].split(SEP_CAMPO)
  const registros: SisRegistro[] = lineas.slice(1).map((linea) => {
    const campos = linea.split(SEP_CAMPO)
    if (campos.length !== SIS_FIELDS.length) {
      throw new Error(
        `Registro con ${campos.length} campos; se esperaban ${SIS_FIELDS.length}.`,
      )
    }
    const registro = {} as SisRegistro
    SIS_FIELDS.forEach((campo, i) => {
      registro[campo] = campos[i]
    })
    return registro
  })
  return { encabezado, registros }
}
