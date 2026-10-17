// Guardia (fase final): ningún archivo del código, las migraciones, las Edge Functions ni la documentación puede tener BOM ni texto corrupto («mojibake»: UTF-8 leído como
// Windows-1252 y vuelto a guardar: una «í» que aparece como dos símbolos raros). Una vez ocurrió en sis-mapper.ts (202 apariciones, 38 líneas de MENSAJES que ve el usuario).
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, extname } from 'node:path'

const RAIZ = fileURLToPath(new URL('../../../../../', import.meta.url))   // raíz del proyecto
const CARPETAS = ['frontend/src', 'supabase/functions', 'supabase/migrations', 'supabase/tests', 'supabase/verificacion', 'supabase/decisiones', 'supabase/rollback', 'supabase/restauracion', 'docs']
const EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.sql', '.md', '.sh', '.mjs'])
// Escrita con ESCAPES (U+00C3/U+00C2 seguidos de un carácter típico de la corrupción, o U+00E2 U+20AC) para que este archivo no contenga texto corrupto literal.
const MOJIBAKE = /[\u00c3\u00c2][\u0080-\u00bf\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013\u2014\u2018-\u201e\u2020-\u2022\u2026\u2030\u2039\u203a\u20ac\u2122]|\u00e2\u20ac[\u201c\u201d\u2122\u00a6\u2013\u2014]?/
function archivos(dir) { return readdirSync(dir).flatMap((n) => { const p = join(dir, n); if (n === 'node_modules' || n === 'dist') return []; return statSync(p).isDirectory() ? archivos(p) : EXT.has(extname(n)) ? [p] : [] }) }
const todos = CARPETAS.flatMap((c) => archivos(join(RAIZ, c)))

describe('codificación de los archivos del proyecto', () => {
  it('se revisan muchos archivos (la guardia no está vacía)', () => { expect(todos.length).toBeGreaterThan(500) })
  it('ningún archivo empieza con BOM (EF BB BF)', () => {
    const conBom = todos.filter((f) => { const b = readFileSync(f); return b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf })
    expect(conBom.map((f) => f.replace(RAIZ, ''))).toEqual([])
  })
  it('todos son UTF-8 válido y no contienen texto corrupto (mojibake)', () => {
    const malos = []
    for (const f of todos) {
      const t = new TextDecoder('utf-8', { fatal: false }).decode(readFileSync(f))
      if (t.includes('\uFFFD')) malos.push(`${f.replace(RAIZ, '')}: carácter de reemplazo U+FFFD (bytes inválidos)`)
      const m = t.split('\n').findIndex((l) => MOJIBAKE.test(l)); if (m >= 0) malos.push(`${f.replace(RAIZ, '')}:${m + 1}: ${t.split('\n')[m].trim().slice(0, 60)}`)
    }
    expect(malos).toEqual([])
  })
  it('CASO NEGATIVO: el detector reconoce el texto corrupto típico (y no confunde texto correcto)', () => {
    // Construidos con ESCAPES para que este archivo no contenga texto corrupto literal (la propia guardia lo vigila).
    for (const mal of ['La cl\u00c3\u00adnica', 'SIRO \u00e2\u20ac\u201d SIS', 'versi\u00c3\u00b3n', 'GU\u00c3\u008dA']) expect(MOJIBAKE.test(mal), mal).toBe(true)
    for (const bien of ['La clínica', 'SIRO — SIS', 'versión', 'GUÍA', 'Ángel Ñandú ÂÃ solos']) expect(MOJIBAKE.test(bien), bien).toBe(false)
  })
})
