import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { calcularPosicionAnatomicaReal, transformarPuntoAEjesThree } from '../posicionAnatomicaReal'

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

/** Construye un objeto `nodes` real (con BufferGeometry de Three.js
 * de verdad, no un mock a mano) a partir de los vértices crudos del
 * .glb — mismo formato que devuelve useGLTF en producción. */
function construirNodesDesdeGlb() {
  const { gltf, binario } = leerGlb()
  const nodes = {}
  for (const nodo of gltf.nodes) {
    const mesh = gltf.meshes[nodo.mesh]
    const accessorIdx = mesh.primitives[0].attributes.POSITION
    const accessor = gltf.accessors[accessorIdx]
    const bufferView = gltf.bufferViews[accessor.bufferView]
    const offset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
    const floats = new Float32Array(binario.buffer, binario.byteOffset + offset, accessor.count * 3)

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(floats, 3))
    nodes[nodo.name] = { geometry }
  }
  return nodes
}

describe('transformarPuntoAEjesThree — misma transformación que ROTACION_BASE_MODELO', () => {
  it('(x,y,z) -> (x,-z,y), igual que rotationX=+90°', () => {
    expect(transformarPuntoAEjesThree(1, 2, 3)).toEqual([1, -3, 2])
  })
})

describe('calcularPosicionAnatomicaReal — con geometría real de Three.js desde el .glb', () => {
  const nodes = construirNodesDesdeGlb()
  const posiciones = calcularPosicionAnatomicaReal(nodes)

  it('produce una posición para cada uno de los 32 FDI', () => {
    const FDI_ESPERADOS = [
      11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28,
      31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48,
    ]
    for (const fdi of FDI_ESPERADOS) {
      expect(posiciones[String(fdi)]).toBeDefined()
      expect(posiciones[String(fdi)].posicion).toHaveLength(3)
    }
  })

  it('el diente 11 tiene la posición real medida directo del .glb, con el mismo método de centro (bounding-box) que usa geometry.center() en Diente3D.jsx — X≈-0.40, Y≈1.12, Z≈2.55', () => {
    const [x, y, z] = posiciones['11'].posicion
    expect(x).toBeCloseTo(-0.396, 1)
    expect(y).toBeCloseTo(1.121, 1)
    expect(z).toBeCloseTo(2.546, 1)
  })

  it('41 y 48 quedan del MISMO lado (X positivo) — confirma que ya no se usa la curva sintética con los lados invertidos', () => {
    expect(posiciones['41'].posicion[0]).toBeGreaterThan(0)
    expect(posiciones['48'].posicion[0]).toBeGreaterThan(0)
  })

  it('31 y 38 quedan del MISMO lado (X negativo), consistente con 41/48 del lado opuesto', () => {
    expect(posiciones['31'].posicion[0]).toBeLessThan(0)
    expect(posiciones['38'].posicion[0]).toBeLessThan(0)
  })

  it('la arcada superior (1x/2x) tiene Y positivo y la inferior (3x/4x) tiene Y negativo', () => {
    for (const fdi of ['11', '18', '21', '28']) {
      expect(posiciones[fdi].posicion[1]).toBeGreaterThan(0)
    }
    for (const fdi of ['31', '38', '41', '48']) {
      expect(posiciones[fdi].posicion[1]).toBeLessThan(0)
    }
  })

  it('NO produce ninguna propiedad "rotacion" — sin rotación artificial por tangente/tipo, la orientación ya viene de los vértices', () => {
    for (const [fdi, info] of Object.entries(posiciones)) {
      expect(info, `pieza ${fdi}`).not.toHaveProperty('rotacion')
      expect(Object.keys(info)).toEqual(['posicion'])
    }
  })
})
