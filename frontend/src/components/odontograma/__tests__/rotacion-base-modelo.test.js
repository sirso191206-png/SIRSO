import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Esta prueba existe por el bug real que se encontró: el eje largo del
// diente exportado desde Blender queda en Z, no en Y (Three.js usa Y
// como vertical) — y además la corona no está siempre del mismo lado
// de Z: en las piezas superiores está en Z+, en las inferiores en Z-
// (correcto anatómicamente, arriba y abajo se enfrentan en direcciones
// opuestas al cerrar la boca). ROTACION_BASE_MODELO en Diente3D.jsx
// (rotationX = +90°) depende de que este patrón se cumpla — si el
// .glb cambiara de tal forma que ya no se cumpliera, esta prueba lo
// detectaría.

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

function verticesDe(gltf, binario, nombreNodo) {
  const nodo = gltf.nodes.find((n) => n.name === nombreNodo)
  const mesh = gltf.meshes[nodo.mesh]
  const accessorIdx = mesh.primitives[0].attributes.POSITION
  const accessor = gltf.accessors[accessorIdx]
  const bufferView = gltf.bufferViews[accessor.bufferView]
  const offset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const floats = new Float32Array(binario.buffer, binario.byteOffset + offset, accessor.count * 3)
  const vertices = []
  for (let i = 0; i < accessor.count; i++) {
    vertices.push([floats[i * 3], floats[i * 3 + 1], floats[i * 3 + 2]])
  }
  return vertices
}

/** +1 si la sección transversal (X,Y) es más ancha del lado Z positivo
 * (corona ahí), -1 si es más ancha del lado Z negativo. */
function ladoCoronaEnZ(vertices) {
  const zs = vertices.map((v) => v[2])
  const zMin = Math.min(...zs)
  const zMax = Math.max(...zs)
  const franjas = 10
  const paso = (zMax - zMin) / franjas
  const areaFranja = (zDesde, zHasta) => {
    const enFranja = vertices.filter((v) => v[2] >= zDesde && v[2] < zHasta)
    if (enFranja.length < 3) return 0
    const xs = enFranja.map((v) => v[0])
    const ys = enFranja.map((v) => v[1])
    return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
  }
  let areaNegativa = 0
  let areaPositiva = 0
  for (let i = 0; i < 3; i++) areaNegativa += areaFranja(zMin + i * paso, zMin + (i + 1) * paso)
  for (let i = 7; i < 10; i++) areaPositiva += areaFranja(zMin + i * paso, zMin + (i + 1) * paso)
  return areaPositiva > areaNegativa ? 1 : -1
}

describe('odontograma.glb — polaridad del eje Z (base de ROTACION_BASE_MODELO en Diente3D.jsx)', () => {
  const { gltf, binario } = leerGlb()

  it('en las piezas SUPERIORES (FDI empieza con 1 o 2), la corona está del lado Z+', () => {
    const superiores = gltf.nodes.map((n) => n.name).filter((n) => ['1', '2'].includes(n[0]))
    const incorrectas = []
    for (const numero of superiores) {
      const lado = ladoCoronaEnZ(verticesDe(gltf, binario, numero))
      if (lado !== 1) incorrectas.push(numero)
    }
    expect(incorrectas).toEqual([])
  })

  it('en las piezas INFERIORES (FDI empieza con 3 o 4), la corona está del lado Z-', () => {
    const inferiores = gltf.nodes.map((n) => n.name).filter((n) => ['3', '4'].includes(n[0]))
    const incorrectas = []
    for (const numero of inferiores) {
      const lado = ladoCoronaEnZ(verticesDe(gltf, binario, numero))
      if (lado !== -1) incorrectas.push(numero)
    }
    expect(incorrectas).toEqual([])
  })
})
