// Fase final: el 3DES-ECB propio de supabase/functions/_shared/sis-cifrado.ts (Deno no trae DES) se contrasta con OpenSSL (3DES del sistema) con claves y datos ALEATORIOS.
// El formato lo impone la herramienta oficial (cifrado.jar): se verifica la COMPATIBILIDAD, no se cambia el algoritmo.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { transformSync } from 'esbuild'

const fuente = readFileSync(new URL('../../../../../supabase/functions/_shared/sis-cifrado.ts', import.meta.url), 'utf8').replace(/^export /gm, '')
const { cifrarDes3Ecb, descifrarDes3Ecb } = new Function(transformSync(fuente, { loader: 'ts', format: 'esm' }).code + '\nreturn { cifrarDes3Ecb, descifrarDes3Ecb }')()
const openssl = (() => { try { createCipheriv('des-ede3-ecb', randomBytes(24), null); return true } catch { return false } })()

describe.skipIf(!openssl)('cifrado SIS (3DES-ECB propio) contra OpenSSL', () => {
  it('300 casos aleatorios (longitudes de 0 a 4,097 bytes): el cifrado es IDÉNTICO byte a byte al de OpenSSL, y ambos descifran el resultado', () => {
    const largos = [0, 1, 7, 8, 9, 15, 16, 17, 63, 64, 100, 1000, 4097]
    for (let i = 0; i < 300; i++) {
      const llave = randomBytes(24), datos = randomBytes(largos[i % largos.length])
      const c = createCipheriv('des-ede3-ecb', llave, null); const esperado = Buffer.concat([c.update(datos), c.final()])
      const propio = Buffer.from(cifrarDes3Ecb(new Uint8Array(datos), new Uint8Array(llave)))
      expect(propio.equals(esperado), `longitud ${datos.length}`).toBe(true)
      expect(Buffer.from(descifrarDes3Ecb(new Uint8Array(propio), new Uint8Array(llave))).equals(datos)).toBe(true)
      const d = createDecipheriv('des-ede3-ecb', llave, null); expect(Buffer.concat([d.update(propio), d.final()]).equals(datos)).toBe(true)
    }
  })
  it('la longitud cifrada es siempre un múltiplo de 8 y mayor que la original (relleno PKCS)', () => {
    for (const n of [0, 1, 7, 8, 9, 16]) { const r = cifrarDes3Ecb(new Uint8Array(n), new Uint8Array(24)); expect(r.length % 8).toBe(0); expect(r.length).toBeGreaterThan(n) }
  })
})
