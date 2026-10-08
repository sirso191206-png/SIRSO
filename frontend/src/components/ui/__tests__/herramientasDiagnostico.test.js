// Las herramientas de diagnóstico (tools/) deben detectar de verdad lo que dicen detectar.
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { verificar, exportaciones } from '../../../../tools/verificar-importaciones.mjs'
import { compararArboles } from '../../../../tools/comparar-arboles.mjs'

const temporales = []
function carpeta(archivos) {
  const raiz = mkdtempSync(join(tmpdir(), 'siro-diag-')); temporales.push(raiz)
  for (const [ruta, contenido] of Object.entries(archivos)) { const p = join(raiz, ruta); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, contenido) }
  return raiz
}
afterEach(() => { while (temporales.length) rmSync(temporales.pop(), { recursive: true, force: true }) })

describe('verificar-importaciones: importaciones sin exportación (→ "Element type is invalid … undefined")', () => {
  it('detecta un componente importado que el módulo NO exporta', () => {
    const r = carpeta({ 'src/a.jsx': 'export function Real() { return null }\n', 'src/b.jsx': "import { Real, Fantasma } from './a'\nexport const B = () => null\n" })
    const p = verificar(join(r, 'src'))
    expect(p.sinExportacion).toHaveLength(1); expect(p.sinExportacion[0]).toMatchObject({ importa: '{ Fantasma }', falta: 'export Fantasma' })
  })
  it('detecta `import X from` cuando el módulo solo tiene exportaciones con nombre (default vs named)', () => {
    const r = carpeta({ 'src/a.jsx': 'export function Tarjeta() { return null }\n', 'src/b.jsx': "import Tarjeta from './a'\nexport const B = Tarjeta\n" })
    expect(verificar(join(r, 'src')).sinExportacion[0]).toMatchObject({ importa: 'import Tarjeta', falta: 'export default' })
  })
  it('y al revés: `import { X }` de un módulo que solo exporta por defecto', () => {
    const r = carpeta({ 'src/a.jsx': 'export default function Tarjeta() { return null }\n', 'src/b.jsx': "import { Tarjeta } from './a'\nexport const B = Tarjeta\n" })
    expect(verificar(join(r, 'src')).sinExportacion[0]).toMatchObject({ importa: '{ Tarjeta }' })
  })
  it('reconoce todas las formas válidas de exportar: function, const, class, async, lista, alias, default, export *, reexportación', () => {
    const r = carpeta({
      'src/base.js': 'export function f() {}\nexport const c = 1\nexport class K {}\nexport async function g() {}\nexport function* gen() {}\n',
      'src/lista.js': 'const a = 1, b = 2\nfunction x() {}\nexport { a, b as bravo, x as default }\n',
      'src/barril.js': "export * from './base'\nexport { c as otra } from './base'\nexport { default as Porta } from './lista'\n",
      'src/uso.jsx': "import { f, c, K, g, gen } from './base'\nimport porDefecto, { a, bravo } from './lista'\nimport { f as ff, otra, Porta } from './barril'\nexport const U = [f, c, K, g, gen, porDefecto, a, bravo, ff, otra, Porta]\n"
    })
    expect(verificar(join(r, 'src')).sinExportacion).toEqual([])
    expect([...exportaciones(join(r, 'src/barril.js')).nombres].sort()).toEqual(['K', 'c', 'f', 'g', 'gen', 'otra'].sort().concat(['Porta']).sort())
  })
  it('lo que SOLO aparece en un comentario NO es una exportación, y un import comentado no genera alarma; los módulos de terceros se ignoran', () => {
    const r = carpeta({
      'src/a.js': "// export function Fantasma() {}\n/* export const Otro = 1 */\nexport const Real = 1\n",
      'src/b.jsx': "import React from 'react'\nimport { useState } from 'react'\nimport { Real, Fantasma } from './a'\n// import { Nada } from './a'\n/* import { Otro } from './a' */\nexport const B = [React, useState, Real, Fantasma]\n"
    })
    const p = verificar(join(r, 'src'))
    expect(p.sinExportacion).toHaveLength(1); expect(p.sinExportacion[0]).toMatchObject({ importa: '{ Fantasma }' })
  })
  it('un import de un archivo que no existe o de un recurso (css, json) no se marca', () => {
    const r = carpeta({ 'src/a.jsx': "import './estilos.css'\nimport datos from './datos.json'\nexport const A = datos\n", 'src/estilos.css': 'a{}', 'src/datos.json': '{}' })
    expect(verificar(join(r, 'src')).sinExportacion).toEqual([])
  })
})

describe('verificar-importaciones: mocks incompletos', () => {
  const base = { 'src/ui.jsx': 'export function Boton() { return null }\nexport function Tarjeta() { return null }\nexport function ayuda() {}\n', 'src/pantalla.jsx': "import { Boton, Tarjeta, ayuda } from './ui'\nexport const P = [Boton, Tarjeta, ayuda]\n" }
  it('detecta que un vi.mock deja SIN definir un componente que el código importa (valdrá undefined en esa prueba)', () => {
    const r = carpeta({ ...base, 'src/__tests__/p.test.js': "import { vi } from 'vitest'\nvi.mock('../ui', () => ({ Boton: () => null }))\n" })
    const p = verificar(join(r, 'src'))
    expect(p.mocksIncompletos).toHaveLength(1); expect(p.mocksIncompletos[0]).toMatchObject({ mock: '../ui', falta: 'Tarjeta' })
  })
  it('NO marca funciones (minúscula): solo fallan si la prueba las llama, y eso ya lo dice la prueba', () => {
    const r = carpeta({ ...base, 'src/__tests__/p.test.js': "import { vi } from 'vitest'\nvi.mock('../ui', () => ({ Boton: () => null, Tarjeta: () => null }))\n" })
    expect(verificar(join(r, 'src')).mocksIncompletos).toEqual([])
  })
  it('un mock que conserva el original (importOriginal / spread) no se puede juzgar y no se marca', () => {
    const r = carpeta({ ...base, 'src/__tests__/p.test.js': "import { vi } from 'vitest'\nvi.mock('../ui', async (importar) => ({ ...(await importar()), Boton: () => null }))\n" })
    expect(verificar(join(r, 'src')).mocksIncompletos).toEqual([])
  })
  it('reconoce claves escritas como método, async y con comillas', () => {
    const r = carpeta({ ...base, 'src/__tests__/p.test.js': "import { vi } from 'vitest'\nvi.mock('../ui', () => ({ Boton() { return null }, 'Tarjeta': () => null }))\n" })
    expect(verificar(join(r, 'src')).mocksIncompletos).toEqual([])
  })
  it('el default de un .jsx mockeado sin `default` se detecta', () => {
    const r = carpeta({ 'src/ui.jsx': 'export default function Panel() { return null }\n', 'src/pantalla.jsx': "import Panel from './ui'\nexport const P = Panel\n", 'src/__tests__/p.test.js': "import { vi } from 'vitest'\nvi.mock('../ui', () => ({ Panel: () => null }))\n" })
    expect(verificar(join(r, 'src')).mocksIncompletos[0]).toMatchObject({ falta: 'default' })
  })
})

describe('comparar-arboles: en qué se aparta tu repositorio del ZIP', () => {
  it('dos árboles iguales (aunque uno tenga saltos de línea de Windows) son idénticos', () => {
    const a = carpeta({ 'src/x.js': 'linea1\nlinea2\n', 'src/y.js': 'a\n' }); const b = carpeta({ 'src/x.js': 'linea1\r\nlinea2\r\n', 'src/y.js': 'a\n' })
    expect(compararArboles(a, b)).toEqual({ soloEnA: [], soloEnB: [], distintos: [] })
  })
  it('una prueba que SOLO existe en tu repositorio (resto de otra versión) se reporta', () => {
    const a = carpeta({ 'src/x.js': '1', 'src/__tests__/planes/planesGatingUI.test.js': 'it()' }); const b = carpeta({ 'src/x.js': '1', 'src/__tests__/planes/planesGatingYUI.test.js': 'it()' })
    expect(compararArboles(a, b)).toEqual({ soloEnA: ['src/__tests__/planes/planesGatingUI.test.js'], soloEnB: ['src/__tests__/planes/planesGatingYUI.test.js'], distintos: [] })
  })
  it('un archivo con el mismo nombre pero otro contenido se reporta', () => {
    const a = carpeta({ 'src/lib/planes.js': 'version vieja' }); const b = carpeta({ 'src/lib/planes.js': 'version nueva' })
    expect(compararArboles(a, b).distintos).toEqual(['src/lib/planes.js'])
  })
  it('ignora node_modules, dist, .git, .env y los .log', () => {
    const a = carpeta({ 'src/x.js': '1', 'node_modules/p/i.js': 'x', 'dist/a.js': 'x', '.git/HEAD': 'x', '.env': 'SECRETO', 'debug.log': 'x' }); const b = carpeta({ 'src/x.js': '1' })
    expect(compararArboles(a, b)).toEqual({ soloEnA: [], soloEnB: [], distintos: [] })
  })
  it('un binario se compara byte a byte (no se "normaliza")', () => {
    const a = carpeta({ 'public/m.glb': Buffer.from([1, 2, 0, 3]) }); const b = carpeta({ 'public/m.glb': Buffer.from([1, 2, 0, 4]) })
    expect(compararArboles(a, b).distintos).toEqual(['public/m.glb'])
  })
})
