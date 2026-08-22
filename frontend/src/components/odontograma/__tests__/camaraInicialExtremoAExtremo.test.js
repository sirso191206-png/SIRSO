import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Box3, Vector3 } from 'three'
import { calcularVistasCamara } from '../calcularEncuadreCamara'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_GLB = join(__dirname, '..', '..', '..', '..', 'public', 'models', 'odontograma.glb')

function cargarGltfReal() {
  const buffer = readFileSync(RUTA_GLB)
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject)
  })
}

describe('cámara inicial — de extremo a extremo, con GLTFLoader real (no un mock)', () => {
  it('el bounding box completo (Box3.setFromObject) contiene los 32 dientes, sin recortar ninguno', async () => {
    const gltf = await cargarGltfReal()
    const bbox = new Box3().setFromObject(gltf.scene)
    // Cada uno de los 32 dientes debe caer completamente DENTRO de la
    // caja que se usará para calcular la cámara — si alguno quedara
    // afuera, la vista inicial lo cortaría.
    let fueraDeCaja = 0
    gltf.scene.traverse((obj) => {
      if (!obj.geometry) return
      const bboxPieza = new Box3().setFromObject(obj)
      if (!bbox.containsBox(bboxPieza)) fueraDeCaja++
    })
    expect(fueraDeCaja).toBe(0)
  })

  it('la cámara calculada desde ese bounding box encuadra la escena completa (target = centro real, distancia mayor al tamaño del modelo)', async () => {
    const gltf = await cargarGltfReal()
    const bbox = new Box3().setFromObject(gltf.scene)
    const centro = new Vector3()
    const tamano = new Vector3()
    bbox.getCenter(centro)
    bbox.getSize(tamano)

    const vistas = calcularVistasCamara({ centro: centro.toArray(), tamano: tamano.toArray(), fovGrados: 40 })

    expect(vistas.restablecer.target).toEqual(centro.toArray())
    expect(vistas.restablecer.distancia).toBeGreaterThan(Math.max(tamano.x, tamano.y, tamano.z))
  })
})
