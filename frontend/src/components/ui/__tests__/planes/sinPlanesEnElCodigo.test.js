// Guardia de arquitectura: los planes, precios y límites viven en la BASE DE
// DATOS. Si alguien vuelve a escribir un plan a mano en el frontend, esto falla.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../../../..') // src/

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n)
    if (statSync(ruta).isDirectory()) return n === '__tests__' ? [] : archivos(ruta)
    return /\.(js|jsx)$/.test(n) && !/\.test\./.test(n) ? [ruta] : []
  })
}

const FUENTES = archivos(RAIZ).map((ruta) => ({ ruta: ruta.replace(RAIZ, 'src'), texto: readFileSync(ruta, 'utf8') }))

describe('el frontend no tiene planes, precios ni límites escritos a mano', () => {
  it('hay archivos que revisar (la guardia no es vacía)', () => {
    expect(FUENTES.length).toBeGreaterThan(100)
  })
  it('ningún código de plan entre comillas (esencial, profesional, …) en el código de la app', () => {
    const malos = FUENTES.filter((f) => /['"`](basico|esencial|profesional|clinica|empresarial)['"`]/.test(f.texto)).map((f) => f.ruta)
    expect(malos).toEqual([])
  })
  it('ninguna constante tipo PLANES = [...] / { precio: ... }', () => {
    const malos = FUENTES.filter((f) => /\bPLANES\s*=|const\s+PLANES\b|precio(Mensual|Anual)?\s*:\s*\d/.test(f.texto)).map((f) => f.ruta)
    expect(malos).toEqual([])
  })
  it('ni los precios iniciales (599 / 999 / 1799 / 3999 / 5990 …) pegados junto a un plan', () => {
    const malos = FUENTES.filter((f) => /\b(599|999|1,?799|3,?999|5,?990|9,?990|17,?990|39,?990)\b[^\n]{0,40}(MXN|mes|año)/i.test(f.texto)).map((f) => f.ruta)
    expect(malos).toEqual([])
  })
  it('no hay if(plan === "...") ramificando por nombre de plan', () => {
    const malos = FUENTES.filter((f) => /plan\s*===?\s*['"]/.test(f.texto)).map((f) => f.ruta)
    expect(malos).toEqual([])
  })
  it('no existe ninguna integración ni funcionalidad de WhatsApp en el sistema de planes', () => {
    const malos = FUENTES.filter((f) => /planes\//.test(f.ruta) || /lib\/planes|services\/planes|store\/usePlanStore/.test(f.ruta))
      .filter((f) => /whatsapp/i.test(f.texto)).map((f) => f.ruta)
    expect(malos).toEqual([])
  })
})
