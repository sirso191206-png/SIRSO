import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Mesh, BoxGeometry, MeshBasicMaterial, Group, Vector3 } from 'three'
import { identificarNodosPorFdi, FDI_ESPERADOS } from '../identificarNodosFdi'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_GLB = join(__dirname, '..', '..', '..', '..', 'public', 'models', 'odontograma.glb')

function cargarGltfReal() {
  const buffer = readFileSync(RUTA_GLB)
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject)
  })
}

describe('identificarNodosPorFdi — con la escena real del .glb (GLTFLoader real)', () => {
  it('encuentra los 32 FDI, cada uno asociado a un Mesh real', async () => {
    const gltf = await cargarGltfReal()
    const nodos = identificarNodosPorFdi(gltf.scene)
    expect(Object.keys(nodos)).toHaveLength(32)
    for (const fdi of FDI_ESPERADOS) {
      expect(nodos[String(fdi)]).toBeDefined()
      expect(nodos[String(fdi)].isMesh).toBe(true)
    }
  })

  it('el objeto devuelto es literalmente el mismo mesh de la escena — misma posición/rotación/escala, nada recalculado', async () => {
    const gltf = await cargarGltfReal()
    const nodos = identificarNodosPorFdi(gltf.scene)
    expect(nodos['17']).toBe(gltf.scene.getObjectByName('17'))
    // La arcada inferior del .glb viene con los cuadrantes invertidos: el FDI 47 es el mesh llamado «37».
    expect(nodos['47']).toBe(gltf.scene.getObjectByName('37'))
  })

  it('cada pieza inferior queda del MISMO lado que su antagonista superior (1x↔4x, 2x↔3x)', async () => {
    const gltf = await cargarGltfReal()
    gltf.scene.updateMatrixWorld(true)
    const nodos = identificarNodosPorFdi(gltf.scene)
    const x = (fdi) => {
      const m = nodos[fdi]
      m.geometry.computeBoundingBox()
      return m.geometry.boundingBox.getCenter(new Vector3()).applyMatrix4(m.matrixWorld).x
    }
    for (let n = 1; n <= 8; n++) {
      expect(Math.sign(x(`4${n}`))).toBe(Math.sign(x(`1${n}`)))
      expect(Math.sign(x(`3${n}`))).toBe(Math.sign(x(`2${n}`)))
    }
  })

  it('lanza un error explícito si hay un FDI duplicado, en vez de quedarse con el último silenciosamente', () => {
    const escena = new Group()
    const m1 = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    m1.name = '11'
    const m2 = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    m2.name = '11'
    escena.add(m1, m2)
    expect(() => identificarNodosPorFdi(escena)).toThrow(/duplicado/)
  })

  it('ignora meshes que no tienen nombre FDI (no truena, simplemente no los incluye)', () => {
    const escena = new Group()
    const decorativo = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    decorativo.name = 'algo_que_no_es_fdi'
    escena.add(decorativo)
    expect(() => identificarNodosPorFdi(escena)).not.toThrow()
    expect(identificarNodosPorFdi(escena)).toEqual({})
  })
})
