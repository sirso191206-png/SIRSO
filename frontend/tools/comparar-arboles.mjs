#!/usr/bin/env node
// Compara DOS carpetas de proyecto y dice qué archivos sobran, faltan o difieren. Pensado para saber en qué se aparta
// tu repositorio local de un ZIP entregado: copiar un ZIP ENCIMA de un repositorio existente NO borra los archivos que ya
// no existen en la versión nueva (p. ej. una prueba antigua), y esos restos se ejecutan contra código más nuevo.
//
//   node tools/comparar-arboles.mjs <tu-repositorio> <carpeta-del-zip-descomprimido>
//
// Ignora node_modules, dist, .git, .env y *.log. Compara el CONTENIDO sin importar los saltos de línea (CRLF/LF).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const IGNORAR = new Set(['node_modules', 'dist', '.git', 'coverage', '.vite', '.env', '.DS_Store'])

function listar(raiz) {
  const archivos = new Map()
  const recorrer = (dir) => {
    for (const nombre of readdirSync(dir)) {
      if (IGNORAR.has(nombre) || nombre.endsWith('.log')) continue
      const ruta = join(dir, nombre)
      if (statSync(ruta).isDirectory()) recorrer(ruta)
      else archivos.set(relative(raiz, ruta).split(sep).join('/'), ruta)
    }
  }
  recorrer(raiz)
  return archivos
}

function huella(ruta) {
  const bytes = readFileSync(ruta)
  const esTexto = !bytes.includes(0)
  const normal = esTexto ? Buffer.from(bytes.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')) : bytes
  return createHash('sha256').update(normal).digest('hex')
}

export function compararArboles(a, b) {
  const A = listar(a)
  const B = listar(b)
  const soloEnA = [...A.keys()].filter((k) => !B.has(k)).sort()
  const soloEnB = [...B.keys()].filter((k) => !A.has(k)).sort()
  const distintos = [...A.keys()].filter((k) => B.has(k) && huella(A.get(k)) !== huella(B.get(k))).sort()
  return { soloEnA, soloEnB, distintos }
}

const esPrueba = (ruta) => /(__tests__\/|\.test\.[cm]?jsx?$)/.test(ruta)

function informe(a, b, r) {
  const L = []
  L.push(`Comparando\n  A (tu repositorio): ${a}\n  B (el ZIP):         ${b}\n`)
  const pruebasSobrantes = r.soloEnA.filter(esPrueba)
  L.push(`■ Archivos que están en A pero NO en el ZIP: ${r.soloEnA.length}`)
  if (pruebasSobrantes.length) L.push(`  ⚠ de ellos, PRUEBAS (posibles restos de otra versión, se ejecutan contra código distinto al que probaron):\n${pruebasSobrantes.map((x) => '     - ' + x).join('\n')}`)
  const otros = r.soloEnA.filter((x) => !esPrueba(x))
  if (otros.length) L.push(`  otros:\n${otros.slice(0, 40).map((x) => '     - ' + x).join('\n')}${otros.length > 40 ? `\n     … y ${otros.length - 40} más` : ''}`)
  L.push(`\n■ Archivos que están en el ZIP pero FALTAN en A: ${r.soloEnB.length}`)
  if (r.soloEnB.length) L.push(r.soloEnB.slice(0, 40).map((x) => '     - ' + x).join('\n') + (r.soloEnB.length > 40 ? `\n     … y ${r.soloEnB.length - 40} más` : ''))
  L.push(`\n■ Archivos con el mismo nombre pero CONTENIDO DISTINTO: ${r.distintos.length}`)
  if (r.distintos.length) L.push(r.distintos.slice(0, 60).map((x) => '     - ' + x).join('\n') + (r.distintos.length > 60 ? `\n     … y ${r.distintos.length - 60} más` : ''))
  L.push(`\n${r.soloEnA.length + r.soloEnB.length + r.distintos.length === 0 ? '✔ Los dos árboles son IDÉNTICOS.' : '→ Revisa primero las pruebas sobrantes y los archivos distintos de src/: ahí suele estar la causa de las fallas.'}`)
  return L.join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [a, b] = process.argv.slice(2)
  if (!a || !b) { console.error('Uso: node tools/comparar-arboles.mjs <tu-repositorio> <carpeta-del-zip-descomprimido>'); process.exit(2) }
  const r = compararArboles(a, b)
  console.log(informe(a, b, r))
  process.exit(r.soloEnA.length + r.soloEnB.length + r.distintos.length === 0 ? 0 : 1)
}
