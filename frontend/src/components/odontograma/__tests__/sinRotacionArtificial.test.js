import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ROTACION_BASE_MODELO } from '../Diente3D'
import { calcularPosicionAnatomicaReal } from '../posicionAnatomicaReal'
import { BufferGeometry, Float32BufferAttribute } from 'three'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_GLB = join(__dirname, '..', '..', '..', '..', 'public', 'models', 'odontograma.glb')

function leerGlb() {
  const buffer = readFileSync(RUTA_GLB)
  const chunkLengthJson = buffer.readUInt32LE(12)
  const gltf = JSON.parse(buffer.subarray(20, 20 + chunkLengthJson).toString('utf8'))
  const offsetBin = 20 + chunkLengthJson
  const chunkLengthBin = buffer.readUInt32LE(offsetBin)
  const binario = buffer.subarray(offsetBin + 8, offsetBin + 8 + chunkLengthBin)
  return { gltf, binario }
}

function vertices(gltf, binario, nombreNodo) {
  const nodo = gltf.nodes.find((n) => n.name === nombreNodo)
  const mesh = gltf.meshes[nodo.mesh]
  const accessorIdx = mesh.primitives[0].attributes.POSITION
  const accessor = gltf.accessors[accessorIdx]
  const bufferView = gltf.bufferViews[accessor.bufferView]
  const offset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const floats = new Float32Array(binario.buffer, binario.byteOffset + offset, accessor.count * 3)
  const out = []
  for (let i = 0; i < accessor.count; i++) out.push([floats[i * 3], floats[i * 3 + 1], floats[i * 3 + 2]])
  return out
}

/** PCA simple en 2D: ángulo (grados, 0-180) de la dirección de mayor
 * varianza en el plano X,Y — mide "hacia dónde mira" el contorno de
 * la pieza en el plano perpendicular al eje corona-raíz (Z). */
function anguloOrientacionXY(v) {
  const n = v.length
  const mx = v.reduce((s, p) => s + p[0], 0) / n
  const my = v.reduce((s, p) => s + p[1], 0) / n
  let cxx = 0, cyy = 0, cxy = 0
  for (const [x, y] of v) {
    cxx += (x - mx) ** 2
    cyy += (y - my) ** 2
    cxy += (x - mx) * (y - my)
  }
  cxx /= n; cyy /= n; cxy /= n
  // eigenvector principal de [[cxx,cxy],[cxy,cyy]]
  const traza = cxx + cyy
  const det = cxx * cyy - cxy * cxy
  const lambda = traza / 2 + Math.sqrt(Math.max(0, (traza / 2) ** 2 - det))
  const vx = cxy === 0 ? 1 : lambda - cyy
  const vy = cxy === 0 ? 0 : cxy
  let angulo = (Math.atan2(vy, vx) * 180) / Math.PI
  return ((angulo % 180) + 180) % 180
}

describe('ROTACION_BASE_MODELO — única rotación permitida para geometría real', () => {
  it('es exactamente [Math.PI/2, 0, 0] (90° sobre X, nada más)', () => {
    expect(ROTACION_BASE_MODELO).toEqual([Math.PI / 2, 0, 0])
  })
})

describe('calcularPosicionAnatomicaReal — sin rotación tangencial artificial', () => {
  it('el objeto devuelto para cada FDI solo tiene "posicion", nunca "rotacion"', () => {
    const { gltf, binario } = leerGlb()
    const nodes = {}
    for (const nodo of gltf.nodes) {
      const mesh = gltf.meshes[nodo.mesh]
      const accessor = gltf.accessors[mesh.primitives[0].attributes.POSITION]
      const bufferView = gltf.bufferViews[accessor.bufferView]
      const offset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
      const floats = new Float32Array(binario.buffer, binario.byteOffset + offset, accessor.count * 3)
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new Float32BufferAttribute(floats, 3))
      nodes[nodo.name] = { geometry }
    }
    const posiciones = calcularPosicionAnatomicaReal(nodes)
    for (const info of Object.values(posiciones)) {
      expect(Object.keys(info)).toEqual(['posicion'])
    }
  })
})

describe('Por qué NO se debe rotar el grupo — evidencia de que la orientación ya está horneada en los vértices', () => {
  it('la orientación en el plano XY (perpendicular al eje corona-raíz) varía sustancialmente y de forma sistemática entre piezas de la misma arcada', () => {
    const { gltf, binario } = leerGlb()
    const angulos = ['18', '16', '11', '26', '28'].map((fdi) => anguloOrientacionXY(vertices(gltf, binario, fdi)))
    // Si la orientación fuera idéntica en todas las piezas (geometría
    // "genérica" sin facing horneado), los 5 ángulos serían iguales o
    // casi iguales. En cambio, deben variar en un rango amplio —
    // confirma que Blender ya orientó cada pieza individualmente.
    const rango = Math.max(...angulos) - Math.min(...angulos)
    expect(rango).toBeGreaterThan(30)
  })
})
