import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// No hay entorno de navegador/WebGL en las pruebas automáticas, así
// que esto no renderiza el modelo — verifica directamente la
// estructura binaria del .glb (mismo formato, JSON + buffer binario),
// que es lo que sí se puede comprobar con certeza sin un navegador.

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_GLB = join(__dirname, '..', '..', '..', '..', 'public', 'models', 'odontograma.glb')

const FDI_ESPERADOS = [
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
]

function leerGlb() {
  const buffer = readFileSync(RUTA_GLB)
  // Cabecera glTF binario: magic(4) + version(4) + length(4) = 12 bytes,
  // luego el primer chunk (JSON): chunkLength(4) + chunkType(4) + datos.
  const chunkLength = buffer.readUInt32LE(12)
  const jsonBytes = buffer.subarray(20, 20 + chunkLength)
  return JSON.parse(jsonBytes.toString('utf8'))
}

describe('odontograma.glb — estructura del modelo exportado', () => {
  const gltf = leerGlb()
  const nombresNodos = gltf.nodes.map((n) => n.name)

  it('tiene exactamente 32 nodos (dientes)', () => {
    expect(gltf.nodes.length).toBe(32)
  })

  it('cada uno de los 32 FDI esperados está presente', () => {
    const faltantes = FDI_ESPERADOS.filter((fdi) => !nombresNodos.includes(String(fdi)))
    expect(faltantes).toEqual([])
  })

  it('no hay ningún FDI duplicado', () => {
    const unicos = new Set(nombresNodos)
    expect(unicos.size).toBe(nombresNodos.length)
  })

  it('no hay nodos con nombres fuera del catálogo FDI esperado', () => {
    const inesperados = nombresNodos.filter((n) => !FDI_ESPERADOS.includes(Number(n)))
    expect(inesperados).toEqual([])
  })

  it('cada nodo tiene exactamente una malla (sin duplicados de geometría por pieza)', () => {
    for (const nodo of gltf.nodes) {
      const mesh = gltf.meshes[nodo.mesh]
      expect(mesh.primitives.length).toBe(1)
    }
  })
})
