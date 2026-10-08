#!/usr/bin/env node
// Encuentra, SIN ejecutar nada, las causas típicas de "Element type is invalid: expected a string … but got: undefined":
//   1) IMPORTACIÓN SIN EXPORTACIÓN: `import { X } from './a'` y './a' no exporta X (o `import X` y no hay `export default`).
//   2) MOCK INCOMPLETO: una prueba hace vi.mock('./a', () => ({ Y })) y algún archivo de src importa de './a' un COMPONENTE
//      (mayúscula inicial, o el export por defecto de un .jsx) que el mock no define → en esa prueba vale undefined.
//
//   node tools/verificar-importaciones.mjs [carpeta-src]        (por omisión: src)
// Es un análisis por texto (no ejecuta código): puede dar falsos positivos con exportaciones muy dinámicas, pero nombra
// archivo e importación exactos.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const EXT = ['.js', '.jsx', '.mjs', '/index.js', '/index.jsx']
const esCodigo = (n) => /\.(jsx?|mjs)$/.test(n)

function archivos(dir) {
  const salida = []
  const rec = (d) => { for (const n of readdirSync(d)) { if (n === 'node_modules' || n === 'dist') continue; const p = join(d, n); if (statSync(p).isDirectory()) rec(p); else if (esCodigo(n)) salida.push(p) } }
  rec(dir)
  return salida
}

function resolver(desde, especificador) {
  if (!especificador.startsWith('.')) return null
  const base = resolve(dirname(desde), especificador)
  if (existsSync(base) && statSync(base).isFile()) return esCodigo(base) ? base : null
  for (const e of EXT) if (existsSync(base + e)) return base + e
  return null
}

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const cacheExports = new Map()
export function exportaciones(ruta, vistos = new Set()) {
  if (cacheExports.has(ruta)) return cacheExports.get(ruta)
  if (vistos.has(ruta)) return { nombres: new Set(), porDefecto: false }
  vistos.add(ruta)
  const t = sinComentarios(readFileSync(ruta, 'utf8'))
  const nombres = new Set()
  let porDefecto = /\bexport\s+default\b/.test(t)
  for (const m of t.matchAll(/\bexport\s+(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)/g)) nombres.add(m[1])
  for (const m of t.matchAll(/\bexport\s+(?:const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) nombres.add(m[1])
  for (const m of t.matchAll(/\bexport\s*\{([^}]*)\}(?:\s*from\s*['"]([^'"]+)['"])?/g)) {
    for (const parte of m[1].split(',')) {
      const p = parte.trim(); if (!p) continue
      const nombre = p.split(/\s+as\s+/).pop().trim() // `a as b` exporta "b"; `x as default` es el export por defecto
      if (nombre === 'default') porDefecto = true; else nombres.add(nombre)
    }
  }
  for (const m of t.matchAll(/\bexport\s*\*\s*from\s*['"]([^'"]+)['"]/g)) {
    const destino = resolver(ruta, m[1])
    if (destino) for (const n of exportaciones(destino, vistos).nombres) nombres.add(n)
  }
  const r = { nombres, porDefecto }
  cacheExports.set(ruta, r)
  return r
}

export function importaciones(ruta) {
  const t = sinComentarios(readFileSync(ruta, 'utf8'))
  const lista = []
  for (const m of t.matchAll(/\bimport\s+([^'"();]+?)\s+from\s*['"]([^'"]+)['"]/g)) {
    const clausula = m[1].trim(); const desde = m[2]
    if (/^type\b/.test(clausula)) continue
    let porDefecto = null; const nombrados = []; let espacio = false
    const llaves = /\{([^}]*)\}/.exec(clausula)
    const antes = clausula.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim()
    if (llaves) for (const p of llaves[1].split(',')) { const x = p.trim(); if (x) nombrados.push(x.split(/\s+as\s+/)[0].trim()) }
    if (/^\*\s+as\s+/.test(antes)) espacio = true
    else if (antes) porDefecto = antes.split(/\s+/)[0]
    lista.push({ desde, porDefecto, nombrados, espacio })
  }
  return lista
}

// Claves de primer nivel del objeto que devuelve el factory de un vi.mock (null = no se puede saber con seguridad).
function clavesDelMock(texto, posicion) {
  const cuerpo = texto.slice(posicion)
  const inicio = cuerpo.search(/=>\s*\(?\s*\{/)
  if (inicio < 0) return null
  const brace = cuerpo.indexOf('{', inicio)
  let prof = 0, i = brace, fin = -1
  for (; i < cuerpo.length; i++) { const c = cuerpo[i]; if (c === '{') prof++; else if (c === '}') { prof--; if (prof === 0) { fin = i; break } } }
  if (fin < 0) return null
  const objeto = cuerpo.slice(brace + 1, fin)
  if (/\.\.\./.test(objeto) || /importOriginal|vi\.importActual/.test(cuerpo.slice(0, fin))) return null
  const claves = new Set(); let p = 0; let token = ''
  const cerrar = (siguiente) => { const nombre = token.trim().replace(/^async\s+/, '').replace(/^['"]|['"]$/g, ''); if (nombre && /^[A-Za-z0-9_$]+$/.test(nombre) && (siguiente === ':' || siguiente === ',' || siguiente === '(' || siguiente === '' )) claves.add(nombre); token = '' }
  for (let k = 0; k < objeto.length; k++) {
    const c = objeto[k]
    if ('{[('.includes(c)) { if (p === 0 && c === '(') cerrar('('); p++; continue }
    if ('}])'.includes(c)) { p--; continue }
    if (p > 0) continue
    if (c === ':' ) { cerrar(':'); p = 0; // saltar el valor hasta la coma de primer nivel
      let q = 0; for (k++; k < objeto.length; k++) { const d = objeto[k]; if ('{[('.includes(d)) q++; else if ('}])'.includes(d)) q--; else if (d === ',' && q === 0) break } ; continue }
    if (c === ',') { cerrar(','); continue }
    token += c
  }
  cerrar('')
  return claves
}

export function verificar(raizSrc) {
  const todos = archivos(raizSrc)
  const problemas = { sinExportacion: [], mocksIncompletos: [] }
  const importadoresPorModulo = new Map()
  for (const f of todos) {
    for (const imp of importaciones(f)) {
      const destino = resolver(f, imp.desde)
      if (!destino) continue
      const ex = exportaciones(destino)
      if (imp.porDefecto && !ex.porDefecto) problemas.sinExportacion.push({ archivo: f, importa: `import ${imp.porDefecto}`, desde: imp.desde, falta: 'export default' })
      for (const n of imp.nombrados) if (!ex.nombres.has(n)) problemas.sinExportacion.push({ archivo: f, importa: `{ ${n} }`, desde: imp.desde, falta: `export ${n}` })
      if (!/__tests__|\.test\./.test(f)) {
        if (!importadoresPorModulo.has(destino)) importadoresPorModulo.set(destino, [])
        importadoresPorModulo.get(destino).push({ archivo: f, nombrados: imp.nombrados, porDefecto: imp.porDefecto })
      }
    }
  }
  for (const prueba of todos.filter((f) => /__tests__|\.test\./.test(f))) {
    const t = sinComentarios(readFileSync(prueba, 'utf8'))
    for (const m of t.matchAll(/\bvi\.mock\(\s*['"]([^'"]+)['"]\s*,/g)) {
      const modulo = resolver(prueba, m[1]); if (!modulo) continue
      const claves = clavesDelMock(t, m.index + m[0].length); if (!claves) continue
      // Solo COMPONENTES (nombre con mayúscula inicial, o el export por defecto de un .jsx): son los que producen
      // "Element type is invalid … undefined" al renderizarse. Una función que el mock no define solo falla si la prueba la
      // llama, y eso ya lo dice la propia prueba; marcarlas aquí sería ruido.
      const esJsx = modulo.endsWith('.jsx')
      for (const imp of importadoresPorModulo.get(modulo) ?? []) {
        for (const n of imp.nombrados) if (/^[A-Z]/.test(n) && !claves.has(n)) problemas.mocksIncompletos.push({ prueba, mock: m[1], archivo: imp.archivo, falta: n })
        if (imp.porDefecto && esJsx && !claves.has('default')) problemas.mocksIncompletos.push({ prueba, mock: m[1], archivo: imp.archivo, falta: 'default' })
      }
    }
  }
  return problemas
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const raiz = resolve(process.argv[2] ?? 'src')
  const rel = (p) => relative(process.cwd(), p).split(sep).join('/')
  const p = verificar(raiz)
  console.log(`Analizado: ${raiz}\n`)
  console.log(`■ Importaciones SIN la exportación correspondiente (→ undefined): ${p.sinExportacion.length}`)
  for (const x of p.sinExportacion) console.log(`   ${rel(x.archivo)}\n      ${x.importa} from '${x.desde}'  →  falta: ${x.falta}`)
  console.log(`\n■ Mocks de prueba INCOMPLETOS (algo que el código importa y el mock no define): ${p.mocksIncompletos.length}`)
  for (const x of p.mocksIncompletos) console.log(`   ${rel(x.prueba)} mockea '${x.mock}' sin '${x.falta}', pero ${rel(x.archivo)} lo importa`)
  console.log(`\n${p.sinExportacion.length + p.mocksIncompletos.length === 0 ? '✔ Ninguna importación huérfana ni mock incompleto detectados.' : '→ Cada línea de arriba es una causa posible de "Element type is invalid … undefined".'}`)
  process.exit(p.sinExportacion.length + p.mocksIncompletos.length === 0 ? 0 : 1)
}
