// ============================================================
// SIRO — Interoperabilidad SIS: cifrado (corte E)
// ------------------------------------------------------------
// ⚠️ IMPORTANTE: este archivo vive en supabase/functions/_shared/ a
// propósito, NUNCA en el frontend. Cualquier código que use la llave
// de 24 bytes debe correr del lado del servidor (Edge Function) —
// si este módulo se importara desde el frontend, la llave real
// tendría que viajar hasta el navegador para poder cifrar ahí,
// quedando visible para cualquiera que abra las herramientas de
// desarrollador. El cifrado siempre debe hacerse en una Edge
// Function; el frontend solo debe recibir el .cif ya listo.
//
// Reimplementación en TypeScript puro (sin dependencias) del
// algoritmo que usa la herramienta oficial de cifrado de la DGIS
// (cifrado.jar, del paquete "Transferencia_2024" publicado en
// gobi.salud.gob.mx). Se necesitó reimplementar porque:
//
//   1. cifrado.jar es una herramienta Java (JVM) — no corre en
//      Deno (donde viven las Edge Functions de Supabase) ni en el
//      navegador.
//   2. Deno tampoco soporta DES/3DES vía su capa de compatibilidad
//      con node:crypto (createCipheriv('des-ede3-ecb', ...) lanza
//      "Unknown cipher" — verificado directamente).
//
// El algoritmo real se determinó por ingeniería inversa del jar
// (decompilado con javap) y se verificó de tres formas independientes
// antes de escribir una sola línea de esta implementación:
//   a) Se corrió cifrado.jar de verdad (con Java 21) sobre un archivo
//      de prueba y se obtuvo el .cif real.
//   b) Se descifró ese mismo .cif usando las clases reales del jar
//      (cifrado.EncriptaArchivo.decrypt) y se recuperó el texto
//      original exacto.
//   c) Se reprodujo el mismo resultado con Node.js
//      (crypto.createCipheriv('des-ede3-ecb', ...)), que SÍ soporta
//      este cifrado nativamente (a diferencia de Deno) — confirmando
//      de forma independiente que el algoritmo es exactamente:
//
//      DESede (Triple DES, 3 llaves EDE) en modo ECB, con
//      relleno PKCS5 (= PKCS7 con bloques de 8 bytes).
//
// La "llave" (transferencia.jks, 2340 bytes) NO es un Java KeyStore
// real pese al nombre — la herramienta original solo usa los
// PRIMEROS 24 BYTES del archivo directamente como material de llave
// 3DES (DESedeKeySpec de Java hace esto: usa los primeros 24 bytes
// de cualquier arreglo que se le pase, ignora el resto). Verificado
// generando el .cif con un archivo que solo contenía esos 24 bytes:
// el resultado fue byte a byte idéntico al original.
//
// Los 24 bytes se dividen en 3 llaves DES de 8 bytes cada una:
// K1=bytes[0:8], K2=bytes[8:16], K3=bytes[16:24]. El modo EDE es:
//   cifrar    = E(K3, D(K2, E(K1, bloque)))
//   descifrar = D(K1, E(K2, D(K3, bloque)))
//
// Las tablas de permutación/sustitución (IP, FP, E, P, PC-1, PC-2,
// S-boxes) son el estándar público FIPS 46-3 (Data Encryption
// Standard), no código de terceros — son tablas numéricas de una
// norma técnica pública, igual que cualquier otra implementación de
// DES en el mundo (hay miles, es el algoritmo más implementado de
// la historia de la criptografía).
// ============================================================

// ------------------------------------------------------------
// Tablas FIPS 46-3 (índices 1-based, como los define la norma).
// ------------------------------------------------------------

const IP = [
  58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4,
  62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8,
  57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3,
  61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7,
]

const FP = [
  40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31,
  38, 6, 46, 14, 54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29,
  36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27,
  34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25,
]

const E_TABLE = [
  32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17,
  16, 17, 18, 19, 20, 21, 20, 21, 22, 23, 24, 25, 24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1,
]

const P_TABLE = [
  16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10,
  2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25,
]

const PC1 = [
  57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18,
  10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36,
  63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22,
  14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4,
]

const PC2 = [
  14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4,
  26, 8, 16, 7, 27, 20, 13, 2, 41, 52, 31, 37, 47, 55, 30, 40,
  51, 45, 33, 48, 44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32,
]

const SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1]

const S_BOXES = [
  [
    14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7,
    0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8,
    4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0,
    15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13,
  ],
  [
    15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10,
    3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5,
    0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15,
    13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9,
  ],
  [
    10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8,
    13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1,
    13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7,
    1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12,
  ],
  [
    7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15,
    13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9,
    10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4,
    3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14,
  ],
  [
    2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9,
    14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6,
    4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14,
    11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3,
  ],
  [
    12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11,
    10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8,
    9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6,
    4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13,
  ],
  [
    4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1,
    13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6,
    1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2,
    6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12,
  ],
  [
    13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7,
    1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2,
    7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8,
    2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11,
  ],
]

// ------------------------------------------------------------
// Utilidades de bits. Se trabaja con arreglos de 0/1 (no bitwise de
// enteros de 32 bits) a propósito: es más lento pero mucho menos
// propenso a errores de transcripción que la aritmética de bits, y
// el volumen de datos de un reporte SIS (unos cuantos KB) no lo
// necesita más rápido.
// ------------------------------------------------------------
type Bits = number[]

function bytesToBits(bytes: Uint8Array): Bits {
  const bits: Bits = []
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1)
  }
  return bits
}

function bitsToBytes(bits: Bits): Uint8Array {
  const bytes = new Uint8Array(bits.length / 8)
  for (let i = 0; i < bytes.length; i++) {
    let b = 0
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j]
    bytes[i] = b
  }
  return bytes
}

/** table usa índices 1-based (como en FIPS 46-3): permuted[i] = bits[table[i]-1]. */
function permute(bits: Bits, table: number[]): Bits {
  return table.map((pos) => bits[pos - 1])
}

function leftRotate(bits: Bits, n: number): Bits {
  return [...bits.slice(n), ...bits.slice(0, n)]
}

function xorBits(a: Bits, b: Bits): Bits {
  return a.map((v, i) => v ^ b[i])
}

// ------------------------------------------------------------
// Programación de llaves: de 64 bits (8 bytes, con paridad
// ignorada por PC-1) a 16 subllaves de 48 bits.
// ------------------------------------------------------------
function generarSubllaves(llave8bytes: Uint8Array): Bits[] {
  const llave64 = bytesToBits(llave8bytes)
  const llave56 = permute(llave64, PC1)
  let c = llave56.slice(0, 28)
  let d = llave56.slice(28, 56)
  const subllaves: Bits[] = []
  for (let ronda = 0; ronda < 16; ronda++) {
    c = leftRotate(c, SHIFTS[ronda])
    d = leftRotate(d, SHIFTS[ronda])
    subllaves.push(permute([...c, ...d], PC2))
  }
  return subllaves
}

// ------------------------------------------------------------
// Función de Feistel: E → XOR con subllave → S-boxes → P.
// ------------------------------------------------------------
function feistel(mitadDerecha32: Bits, subllave48: Bits): Bits {
  const expandido = permute(mitadDerecha32, E_TABLE) // 32 -> 48
  const xor = xorBits(expandido, subllave48)

  const salidaSBoxes: Bits = []
  for (let i = 0; i < 8; i++) {
    const bloque6 = xor.slice(i * 6, i * 6 + 6)
    const fila = (bloque6[0] << 1) | bloque6[5]
    const columna =
      (bloque6[1] << 3) | (bloque6[2] << 2) | (bloque6[3] << 1) | bloque6[4]
    const valor = S_BOXES[i][fila * 16 + columna]
    for (let b = 3; b >= 0; b--) salidaSBoxes.push((valor >> b) & 1)
  }

  return permute(salidaSBoxes, P_TABLE) // 32 bits
}

// ------------------------------------------------------------
// DES de un solo bloque (8 bytes), con las subllaves ya calculadas.
// `invertirOrden=true` para descifrar (las 16 subllaves se aplican
// en orden inverso — es la única diferencia entre cifrar/descifrar
// en DES, gracias a la simetría de la red de Feistel).
// ------------------------------------------------------------
function desBloque(bloque8bytes: Uint8Array, subllaves: Bits[], invertirOrden: boolean): Uint8Array {
  const bits = permute(bytesToBits(bloque8bytes), IP)
  let l = bits.slice(0, 32)
  let r = bits.slice(32, 64)

  for (let ronda = 0; ronda < 16; ronda++) {
    const indiceSubllave = invertirOrden ? 15 - ronda : ronda
    const nuevoR = xorBits(l, feistel(r, subllaves[indiceSubllave]))
    l = r
    r = nuevoR
  }

  // preFP invierte L y R una última vez (paso estándar de DES)
  const preFP = [...r, ...l]
  return bitsToBytes(permute(preFP, FP))
}

// ------------------------------------------------------------
// Triple DES (EDE, 3 llaves) para UN bloque de 8 bytes.
// ------------------------------------------------------------
function tripleDesBloque(bloque8: Uint8Array, k1: Bits[], k2: Bits[], k3: Bits[], cifrando: boolean): Uint8Array {
  if (cifrando) {
    // E(K3, D(K2, E(K1, bloque)))
    const paso1 = desBloque(bloque8, k1, false)
    const paso2 = desBloque(paso1, k2, true)
    return desBloque(paso2, k3, false)
  }
  // D(K1, E(K2, D(K3, bloque)))
  const paso1 = desBloque(bloque8, k3, true)
  const paso2 = desBloque(paso1, k2, false)
  return desBloque(paso2, k1, true)
}

// ------------------------------------------------------------
// Relleno PKCS5 (= PKCS7 con bloques de 8 bytes).
// ------------------------------------------------------------
function rellenarPkcs5(datos: Uint8Array): Uint8Array {
  const relleno = 8 - (datos.length % 8)
  const resultado = new Uint8Array(datos.length + relleno)
  resultado.set(datos)
  resultado.fill(relleno, datos.length)
  return resultado
}

function quitarPkcs5(datos: Uint8Array): Uint8Array {
  const relleno = datos[datos.length - 1]
  if (relleno < 1 || relleno > 8 || relleno > datos.length) {
    throw new Error('Relleno PKCS5 inválido — ¿la llave o los datos están corruptos?')
  }
  return datos.slice(0, datos.length - relleno)
}

// ------------------------------------------------------------
// API pública: DESede/ECB/PKCS5Padding, igual que
// Cipher.getInstance("DESede") en Java (el default de la JVM).
// ------------------------------------------------------------

/**
 * Cifra `datos` con DESede/ECB/PKCS5Padding, reproduciendo
 * exactamente el comportamiento de cifrado.jar (herramienta oficial
 * de la DGIS). `llave24` deben ser los primeros 24 bytes del archivo
 * "transferencia.jks" (ver nota al inicio del archivo) — NUNCA
 * incrustar estos bytes en el código fuente; deben venir de un
 * secreto de Supabase, cargados en tiempo de ejecución.
 */
export function cifrarDes3Ecb(datos: Uint8Array, llave24: Uint8Array): Uint8Array {
  if (llave24.length !== 24) throw new Error('La llave debe tener exactamente 24 bytes.')
  const k1 = generarSubllaves(llave24.slice(0, 8))
  const k2 = generarSubllaves(llave24.slice(8, 16))
  const k3 = generarSubllaves(llave24.slice(16, 24))

  const conRelleno = rellenarPkcs5(datos)
  const resultado = new Uint8Array(conRelleno.length)
  for (let i = 0; i < conRelleno.length; i += 8) {
    const bloqueCifrado = tripleDesBloque(conRelleno.slice(i, i + 8), k1, k2, k3, true)
    resultado.set(bloqueCifrado, i)
  }
  return resultado
}

/** Descifra datos cifrados con cifrarDes3Ecb (o con cifrado.jar directamente). */
export function descifrarDes3Ecb(datosCifrados: Uint8Array, llave24: Uint8Array): Uint8Array {
  if (llave24.length !== 24) throw new Error('La llave debe tener exactamente 24 bytes.')
  if (datosCifrados.length % 8 !== 0) throw new Error('Los datos cifrados deben ser múltiplo de 8 bytes.')
  const k1 = generarSubllaves(llave24.slice(0, 8))
  const k2 = generarSubllaves(llave24.slice(8, 16))
  const k3 = generarSubllaves(llave24.slice(16, 24))

  const conRelleno = new Uint8Array(datosCifrados.length)
  for (let i = 0; i < datosCifrados.length; i += 8) {
    const bloqueDescifrado = tripleDesBloque(datosCifrados.slice(i, i + 8), k1, k2, k3, false)
    conRelleno.set(bloqueDescifrado, i)
  }
  return quitarPkcs5(conRelleno)
}
