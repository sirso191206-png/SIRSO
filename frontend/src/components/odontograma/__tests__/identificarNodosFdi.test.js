import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Mesh, BoxGeometry, MeshBasicMaterial, Group } from 'three'
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
    const meshOriginal = gltf.scene.getObjectByName('47')
    expect(nodos['47']).toBe(meshOriginal)
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
