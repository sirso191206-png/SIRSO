import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { identificarNodosPorFdi } from '../identificarNodosFdi'
import { aplicarEstadoClinico } from '../aplicarEstadoClinico'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_GLB = join(__dirname, '..', '..', '..', '..', 'public', 'models', 'odontograma.glb')

function cargarGltfReal() {
  const buffer = readFileSync(RUTA_GLB)
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject)
  })
}

function snapshot(mesh) {
  return {
    position: mesh.position.toArray(),
    quaternion: mesh.quaternion.toArray(),
    scale: mesh.scale.toArray(),
  }
}

// Secuencia de estados pedida explícitamente: normal, caries, corona,
// implante, tratamiento, seleccionado, ausente — sobre el GLB REAL
// completo (32 piezas), no un mesh de prueba aislado.
const SECUENCIA_ESTADOS = [
  { estado: 'sano', seleccionada: false, etiqueta: 'normal' },
  { estado: 'sano', caras: [{ cara: 'oclusal', estado: 'caries' }], seleccionada: false, etiqueta: 'caries' },
  { estado: 'corona', seleccionada: false, etiqueta: 'corona' },
  { estado: 'implante', seleccionada: false, etiqueta: 'implante' },
  { estado: 'en_tratamiento', seleccionada: false, etiqueta: 'tratamiento' },
  { estado: 'sano', seleccionada: true, etiqueta: 'seleccionado' },
  { estado: 'ausente', seleccionada: false, etiqueta: 'ausente' },
]

describe('Prueba crítica — ningún estado clínico, en ninguna secuencia, mueve un diente (GLB real, 32 piezas)', () => {
  it('para cada uno de los 32 dientes: position/quaternion/scale idénticos antes y después de aplicar TODA la secuencia de estados', async () => {
    const gltf = await cargarGltfReal()
    const escena = gltf.scene.clone(true)
    escena.traverse((obj) => { if (obj.isMesh) obj.material = obj.material.clone() })
    const nodos = identificarNodosPorFdi(escena)

    const antes = {}
    for (const [fdi, mesh] of Object.entries(nodos)) antes[fdi] = snapshot(mesh)

    for (const [fdi, mesh] of Object.entries(nodos)) {
      for (const paso of SECUENCIA_ESTADOS) {
        const pieza = { id: 'p-' + fdi, numero_pieza: fdi, estado: paso.estado, caras: paso.caras ?? [] }
        aplicarEstadoClinico(mesh, pieza, { visible: true, seleccionada: paso.seleccionada })

        const despues = snapshot(mesh)
        expect(despues.position, `${fdi} tras '${paso.etiqueta}' — position`).toEqual(antes[fdi].position)
        expect(despues.quaternion, `${fdi} tras '${paso.etiqueta}' — quaternion`).toEqual(antes[fdi].quaternion)
        expect(despues.scale, `${fdi} tras '${paso.etiqueta}' — scale`).toEqual(antes[fdi].scale)
      }
    }
  })

  it('"ausente" únicamente cambia mesh.visible a false — nunca la posición de la pieza ni de ninguna otra', async () => {
    const gltf = await cargarGltfReal()
    const escena = gltf.scene.clone(true)
    escena.traverse((obj) => { if (obj.isMesh) obj.material = obj.material.clone() })
    const nodos = identificarNodosPorFdi(escena)

    const antesDeTodos = {}
    for (const [fdi, mesh] of Object.entries(nodos)) antesDeTodos[fdi] = snapshot(mesh)

    // Marcar SOLO el 46 como ausente.
    aplicarEstadoClinico(nodos['46'], { id: 'x', numero_pieza: '46', estado: 'ausente' }, { visible: true, seleccionada: false })

    expect(nodos['46'].visible).toBe(false)
    expect(snapshot(nodos['46'])).toEqual(antesDeTodos['46'])

    // Ningún vecino (ni ningún otro de los 32) debe haberse movido.
    for (const [fdi, mesh] of Object.entries(nodos)) {
      expect(snapshot(mesh), `${fdi} no debería haberse movido al marcar 46 como ausente`).toEqual(antesDeTodos[fdi])
    }
  })
})
