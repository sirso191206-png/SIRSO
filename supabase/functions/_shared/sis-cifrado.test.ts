// Pruebas del cifrado DES-EDE3 — corren con `deno test` (no Vitest,
// ya que este módulo vive fuera del árbol del frontend a propósito).
// Ver sis-cifrado.ts para el porqué de cada vector de prueba.

import { cifrarDes3Ecb, descifrarDes3Ecb } from './sis-cifrado.ts'

// ------------------------------------------------------------
// Llave real de prueba (los primeros 24 bytes de
// "transferencia.jks", del paquete "Transferencia_2024.zip"
// publicado públicamente en gobi.salud.gob.mx — ver la nota en
// sis-cifrado.ts sobre por qué se trata como constante de prueba).
// ------------------------------------------------------------
const LLAVE24_B64 = '/u3+7QAAAAIAAAABAAAAAQAEZGdpcwAA'

function llave24(): Uint8Array {
  return Uint8Array.from(atob(LLAVE24_B64), (c) => c.charCodeAt(0))
}

function utf8(texto: string): Uint8Array {
  return new TextEncoder().encode(texto)
}

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function assertEquals(actual: unknown, esperado: unknown, mensaje?: string) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(esperado)
  if (a !== e) {
    throw new Error(`${mensaje ?? 'Assertion falló'}\n  esperado: ${e}\n  obtenido: ${a}`)
  }
}

function assertThrows(fn: () => void, patronMensaje: RegExp, mensaje?: string) {
  try {
    fn()
  } catch (err) {
    if (patronMensaje.test((err as Error).message)) return
    throw new Error(`${mensaje ?? 'assertThrows'}: el error no coincide con ${patronMensaje} — fue "${(err as Error).message}"`)
  }
  throw new Error(mensaje ?? 'Se esperaba que la función lanzara un error, pero no lo hizo.')
}

Deno.test('cifrarDes3Ecb — reproduce EXACTAMENTE el resultado del jar oficial de la DGIS (verificado con Java 21 real)', () => {
  const texto = utf8('HOLA MUNDO PRUEBA CIFRADO\n')
  const resultado = cifrarDes3Ecb(texto, llave24())
  assertEquals(b64(resultado), 'tHGGYtiniP8BXK5am6Ub6YWsQvpnOkH+c16faJ+RDQc=')
})

const vectoresAdicionales: Array<[string, string, string]> = [
  ['cadena vacía (0 bytes → un bloque completo de relleno)', '', 'nNv7MQw71so='],
  ['un solo byte', 'A', '7YGA49QjsQs='],
  ['exactamente 8 bytes', '12345678', 'klVitZqLmW2c2/sxDDvWyg=='],
  ['exactamente 16 bytes', '1234567890123456', 'klVitZqLmW1OuGG0tIEuj5zb+zEMO9bK'],
  ['texto sin salto de línea (25 bytes)', 'HOLA MUNDO PRUEBA CIFRADO', 'tHGGYtiniP8BXK5am6Ub6YWsQvpnOkH+sv72rR/1auI='],
  ['con acentos y Ñ (UTF-8)', 'CLUES|MÉXICO|ÑOÑO', 'mG4FjTcvlPFXjo4fYpvTOveuOUMr1Ycx'],
]

for (const [descripcion, texto, esperadoB64] of vectoresAdicionales) {
  Deno.test(`cifrarDes3Ecb — vector adicional: ${descripcion}`, () => {
    const resultado = cifrarDes3Ecb(utf8(texto), llave24())
    assertEquals(b64(resultado), esperadoB64)
  })
}

Deno.test('descifrarDes3Ecb — round-trip con un texto de varios bloques', () => {
  const original = utf8('Un texto de prueba cualquiera, con más de un bloque de longitud para probar varias iteraciones.')
  const cifrado = cifrarDes3Ecb(original, llave24())
  const descifrado = descifrarDes3Ecb(cifrado, llave24())
  assertEquals(new TextDecoder().decode(descifrado), new TextDecoder().decode(original))
})

Deno.test('descifrarDes3Ecb — descifra el vector dorado real y recupera el texto exacto', () => {
  const cifradoReal = Uint8Array.from(atob('tHGGYtiniP8BXK5am6Ub6YWsQvpnOkH+c16faJ+RDQc='), (c) => c.charCodeAt(0))
  const descifrado = descifrarDes3Ecb(cifradoReal, llave24())
  assertEquals(new TextDecoder().decode(descifrado), 'HOLA MUNDO PRUEBA CIFRADO\n')
})

Deno.test('descifrarDes3Ecb — rechaza datos que no son múltiplo de 8 bytes', () => {
  assertThrows(() => descifrarDes3Ecb(new Uint8Array(5), llave24()), /múltiplo de 8/)
})

Deno.test('validación de la llave — rechaza llaves que no midan 24 bytes', () => {
  assertThrows(() => cifrarDes3Ecb(utf8('hola'), new Uint8Array(16)), /24 bytes/)
  assertThrows(() => descifrarDes3Ecb(new Uint8Array(8), new Uint8Array(23)), /24 bytes/)
})

Deno.test('cifrarDes3Ecb — el archivo oficial completo de la guía (CSB-EJEMPLOS-2410.txt) cifra y descifra sin perder ni un byte', async () => {
  const ruta = new URL(
    '../../../frontend/src/features/interoperabilidad/sis/__tests__/fixtures/CSB-EJEMPLOS-2410.txt',
    import.meta.url,
  )
  const original = await Deno.readFile(ruta)

  const cifrado = cifrarDes3Ecb(original, llave24())
  assertEquals(cifrado.length % 8, 0)

  const descifrado = descifrarDes3Ecb(cifrado, llave24())
  assertEquals(descifrado.length, original.length)
  assertEquals(b64(descifrado), b64(original))
})
