import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { identificarNodosPorFdi, getFDIFromObject } from '../identificarNodosFdi'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_GLB = join(__dirname, '..', '..', '..', '..', 'public', 'models', 'odontograma.glb')

function cargarGltfReal() {
  const buffer = readFileSync(RUTA_GLB)
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject)
  })
}

describe('Seleccion por click - FDI exacto, nunca un vecino', () => {
  it('click sobre el objeto "11" identifica exactamente FDI 11, no 12 ni 21', async () => {
    const gltf = await cargarGltfReal()
    const nodos = identificarNodosPorFdi(gltf.scene)
    expect(getFDIFromObject(nodos['11'])).toBe('11')
    expect(getFDIFromObject(nodos['11'])).not.toBe('12')
    expect(getFDIFromObject(nodos['11'])).not.toBe('21')
  })

  it('click sobre el objeto "48" identifica exactamente FDI 48, no 47 ni 38', async () => {
    const gltf = await cargarGltfReal()
    const nodos = identificarNodosPorFdi(gltf.scene)
    expect(getFDIFromObject(nodos['48'])).toBe('48')
    expect(getFDIFromObject(nodos['48'])).not.toBe('47')
    expect(getFDIFromObject(nodos['48'])).not.toBe('38')
  })

  it('cada uno de los 32 FDI identifica exactamente a su propio objeto (nunca al de otro)', async () => {
    const gltf = await cargarGltfReal()
    const nodos = identificarNodosPorFdi(gltf.scene)
    for (const fdi of Object.keys(nodos)) {
      expect(getFDIFromObject(nodos[fdi])).toBe(fdi)
    }
  })
})

describe('Clonar la escena preserva position/rotation/scale EXACTOS del GLB original', () => {
  it('cada uno de los 32 meshes clonados tiene la misma position/quaternion/scale que el original', async () => {
    const gltf = await cargarGltfReal()
    const clon = gltf.scene.clone(true)

    const nodosOriginales = identificarNodosPorFdi(gltf.scene)
    const nodosClonados = identificarNodosPorFdi(clon)

    for (const fdi of Object.keys(nodosOriginales)) {
      const original = nodosOriginales[fdi]
      const clonado = nodosClonados[fdi]
      expect(clonado.position.toArray(), `posicion de ${fdi}`).toEqual(original.position.toArray())
      expect(clonado.quaternion.toArray(), `rotacion de ${fdi}`).toEqual(original.quaternion.toArray())
      expect(clonado.scale.toArray(), `escala de ${fdi}`).toEqual(original.scale.toArray())
    }
  })
})
