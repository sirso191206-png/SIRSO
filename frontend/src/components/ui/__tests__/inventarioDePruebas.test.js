// Guardia contra "pruebas que existen pero nadie ejecuta": toda prueba (*.test.js / *.test.ts / *.test.jsx) que exista en src/
// debe quedar cubierta por el `include` de vitest.config.ts. Ya pasó una vez: 101 pruebas de SIS llevaron semanas sin correr
// porque una reescritura del include las dejó fuera, y nadie lo notó porque la suite seguía "toda en verde".
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath (no .pathname): en Windows .pathname da "/C:/Users/…", una ruta inválida. Apunta a frontend/.
const RAIZ = fileURLToPath(new URL('../../../../', import.meta.url))
const configuracion = readFileSync(join(RAIZ, 'vitest.config.ts'), 'utf8')
const patrones = [...configuracion.match(/include:\s*\[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1])

function pruebasEnDisco(dir) {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n)
    if (statSync(ruta).isDirectory()) return n === 'node_modules' ? [] : pruebasEnDisco(ruta)
    return /\.test\.(js|jsx|ts|tsx)$/.test(n) ? [relative(RAIZ, ruta).replaceAll('\\', '/')] : []
  })
}
// Un glob de la forma  src/<carpeta>/**/*.test.<ext>  → expresión regular (los únicos que usamos).
const aRegex = (g) => new RegExp('^' + g.split('**/').map((tramo) => tramo.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('(?:.*/)?') + '$')

describe('inventario de pruebas', () => {
  const todas = pruebasEnDisco(join(RAIZ, 'src'))
  it('el include de Vitest no está vacío y usa globs que este inventario entiende', () => {
    expect(patrones.length).toBeGreaterThan(0)
    for (const p of patrones) expect(p, p).toMatch(/^src\/[\w-]+\/\*\*\/\*\.test\.\w+$/)
  })
  it('hay pruebas de cada tipo conocido (js en components, ts en features)', () => {
    expect(todas.some((r) => r.startsWith('src/components/') && r.endsWith('.test.js'))).toBe(true)
    expect(todas.some((r) => r.startsWith('src/features/') && r.endsWith('.test.ts'))).toBe(true)
  })
  it('TODA prueba que existe en src/ la ejecuta Vitest (ninguna queda huérfana del include)', () => {
    const regex = patrones.map(aRegex)
    const huerfanas = todas.filter((r) => !regex.some((x) => x.test(r)))
    expect(huerfanas, `pruebas que existen pero que vitest.config.ts NO ejecuta:\n  ${huerfanas.join('\n  ')}`).toEqual([])
  })
  it('el include no apunta a carpetas sin ninguna prueba (un patrón muerto suele ser un error de escritura)', () => {
    for (const p of patrones) expect(todas.some((r) => aRegex(p).test(r)), `el patrón ${p} no coincide con ninguna prueba`).toBe(true)
  })
})
