import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Box3, Vector3 } from 'three'
import { identificarNodosPorFdi, FDI_ESPERADOS } from '../identificarNodosFdi'
import { clonarEscenaGLB } from '../OdontogramaGLBScene'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_GLB = join(__dirname, '..', '..', '..', '..', 'public', 'models', 'odontograma.glb')

function cargarGltfReal() {
  const buffer = readFileSync(RUTA_GLB)
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject)
  })
}

// Esta es la prueba mas importante de esta ronda: NO compara contra
// valores de referencia escritos a mano (eso se podria "arreglar"
// cambiando los numeros esperados) - compara la escena que usaria el
// odontograma CLINICO contra la escena REAL del .glb tal cual la
// carga GLTFLoader — la fuente anatómica real, sin reconstrucción.
describe('Prueba de equivalencia GLB - escena clonada vs GLB real sin modificar', () => {
  it('clonarEscenaGLB() - la MISMA funcion que usa OdontogramaGLBScene para ambos consumidores - preserva position/quaternion/scale exactos de los 32 dientes', async () => {
    const gltf = await cargarGltfReal()
    const escenaClinicaSimulada = clonarEscenaGLB(gltf.scene)

    const nodosReferencia = identificarNodosPorFdi(gltf.scene)
    const nodosClinicos = identificarNodosPorFdi(escenaClinicaSimulada)

    expect(Object.keys(nodosClinicos).sort()).toEqual(Object.keys(nodosReferencia).sort())

    for (const fdi of FDI_ESPERADOS.map(String)) {
      const referencia = nodosReferencia[fdi]
      const clinico = nodosClinicos[fdi]
      expect(clinico.position.toArray(), `${fdi} - position`).toEqual(referencia.position.toArray())
      expect(clinico.quaternion.toArray(), `${fdi} - quaternion`).toEqual(referencia.quaternion.toArray())
      expect(clinico.scale.toArray(), `${fdi} - scale`).toEqual(referencia.scale.toArray())
    }
  })

  it('misma geometria: mismo numero de vertices por pieza (no se reconstruyo ni simplifico nada)', async () => {
    const gltf = await cargarGltfReal()
    const escenaClinicaSimulada = clonarEscenaGLB(gltf.scene)
    const nodosReferencia = identificarNodosPorFdi(gltf.scene)
    const nodosClinicos = identificarNodosPorFdi(escenaClinicaSimulada)

    for (const fdi of FDI_ESPERADOS.map(String)) {
      expect(nodosClinicos[fdi].geometry.attributes.position.count, `${fdi} - numero de vertices`)
        .toBe(nodosReferencia[fdi].geometry.attributes.position.count)
    }
  })

  it('mismo bounding box mundial completo (centro y tamano de la escena entera)', async () => {
    const gltf = await cargarGltfReal()
    const escenaClinicaSimulada = clonarEscenaGLB(gltf.scene)

    const cajaReferencia = new Box3().setFromObject(gltf.scene)
    const cajaClinica = new Box3().setFromObject(escenaClinicaSimulada)

    const centroRef = new Vector3(); cajaReferencia.getCenter(centroRef)
    const centroClin = new Vector3(); cajaClinica.getCenter(centroClin)
    const tamRef = new Vector3(); cajaReferencia.getSize(tamRef)
    const tamClin = new Vector3(); cajaClinica.getSize(tamClin)

    expect(centroClin.toArray()).toEqual(centroRef.toArray())
    expect(tamClin.toArray()).toEqual(tamRef.toArray())
  })

  it('separacion identica entre piezas vecinas (ninguna se solapo ni se alejo al clonar)', async () => {
    const gltf = await cargarGltfReal()
    const escenaClinicaSimulada = clonarEscenaGLB(gltf.scene)
    const nodosReferencia = identificarNodosPorFdi(gltf.scene)
    const nodosClinicos = identificarNodosPorFdi(escenaClinicaSimulada)

    const distanciaEntre = (nodos, a, b) => {
      nodos[a].updateWorldMatrix(true, false)
      nodos[b].updateWorldMatrix(true, false)
      const ca = new Vector3(); new Box3().setFromObject(nodos[a]).getCenter(ca)
      const cb = new Vector3(); new Box3().setFromObject(nodos[b]).getCenter(cb)
      return ca.distanceTo(cb)
    }

    for (const [a, b] of [['11', '12'], ['16', '17'], ['46', '47']]) {
      const dRef = distanciaEntre(nodosReferencia, a, b)
      const dClin = distanciaEntre(nodosClinicos, a, b)
      expect(dClin).toBeCloseTo(dRef, 5)
    }
  })
})
