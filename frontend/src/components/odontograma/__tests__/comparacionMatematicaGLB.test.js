import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Box3, Vector3 } from 'three'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_GLB = join(__dirname, '..', '..', '..', '..', 'public', 'models', 'odontograma.glb')

const FDI_ESPERADOS = [
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
]

function cargarGltfReal() {
  const buffer = readFileSync(RUTA_GLB)
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject)
  })
}

// Fase 4 del pedido: comparacion matematica GLTFLoader vs lo esperado
// del GLB - existencia, nombre, posicion, rotacion, escala, bounding
// box, para los 32 dientes. No se calcula NINGUNA posicion nueva -
// solo se lee lo que Three.js ya construyo al cargar el archivo.
describe('Fase 4 - comparacion matematica GLTFLoader vs GLB, para los 32 dientes', () => {
  it('existencia: los 32 FDI existen como Mesh en la escena', async () => {
    const gltf = await cargarGltfReal()
    for (const fdi of FDI_ESPERADOS) {
      const obj = gltf.scene.getObjectByName(String(fdi))
      expect(obj, `FDI ${fdi} no encontrado`).toBeDefined()
      expect(obj.isMesh, `FDI ${fdi} no es un Mesh`).toBe(true)
    }
  })

  it('nombre: cada mesh se llama exactamente su FDI, sin variaciones', async () => {
    const gltf = await cargarGltfReal()
    for (const fdi of FDI_ESPERADOS) {
      const obj = gltf.scene.getObjectByName(String(fdi))
      expect(obj.name).toBe(String(fdi))
    }
  })

  it('posicion local: [0,0,0] en el nodo - la posicion real vive horneada en los vertices, no en translation', async () => {
    const gltf = await cargarGltfReal()
    for (const fdi of FDI_ESPERADOS) {
      const obj = gltf.scene.getObjectByName(String(fdi))
      expect(obj.position.toArray(), `FDI ${fdi}`).toEqual([0, 0, 0])
    }
  })

  it('rotacion local: los 32 dientes comparten el MISMO quaternion (conversion Z-up a Y-up horneada por el exportador, no calculada por SIRSO)', async () => {
    const gltf = await cargarGltfReal()
    const quaterniones = FDI_ESPERADOS.map((fdi) => gltf.scene.getObjectByName(String(fdi)).quaternion.toArray())
    const primero = quaterniones[0]
    for (const q of quaterniones) {
      expect(q.map((n) => Number(n.toFixed(5)))).toEqual(primero.map((n) => Number(n.toFixed(5))))
    }
    expect(primero[0]).toBeCloseTo(Math.sin(Math.PI / 4), 4)
    expect(primero[1]).toBeCloseTo(0, 4)
    expect(primero[2]).toBeCloseTo(0, 4)
    expect(primero[3]).toBeCloseTo(Math.cos(Math.PI / 4), 4)
  })

  it('escala local: [1,1,1] en los 32 nodos - SIRSO no aplica ningun factor adicional', async () => {
    const gltf = await cargarGltfReal()
    for (const fdi of FDI_ESPERADOS) {
      const obj = gltf.scene.getObjectByName(String(fdi))
      expect(obj.scale.toArray(), `FDI ${fdi}`).toEqual([1, 1, 1])
    }
  })

  it('bounding box mundial: cada diente tiene tamano razonable y una posicion distinta de las demas', async () => {
    const gltf = await cargarGltfReal()
    const centros = []
    for (const fdi of FDI_ESPERADOS) {
      const obj = gltf.scene.getObjectByName(String(fdi))
      const bbox = new Box3().setFromObject(obj)
      const tam = new Vector3(); bbox.getSize(tam)
      const centro = new Vector3(); bbox.getCenter(centro)
      expect(tam.length(), `FDI ${fdi} - tamano`).toBeGreaterThan(0.1)
      expect(tam.length(), `FDI ${fdi} - tamano`).toBeLessThan(10)
      centros.push(`${centro.x.toFixed(3)},${centro.y.toFixed(3)},${centro.z.toFixed(3)}`)
    }
    expect(new Set(centros).size).toBe(32)
  })

  it('sin duplicados: 32 meshes en la escena con nombre FDI, ni uno mas ni uno menos', async () => {
    const gltf = await cargarGltfReal()
    const nombres = []
    gltf.scene.traverse((obj) => {
      if (obj.isMesh && FDI_ESPERADOS.includes(Number(obj.name))) nombres.push(obj.name)
    })
    expect(nombres.length).toBe(32)
    expect(new Set(nombres).size).toBe(32)
  })
})
