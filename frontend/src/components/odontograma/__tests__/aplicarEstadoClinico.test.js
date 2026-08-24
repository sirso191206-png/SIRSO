import { describe, it, expect } from 'vitest'
import { Mesh, BoxGeometry, MeshStandardMaterial, Vector3, Euler } from 'three'
import { aplicarEstadoClinico } from '../aplicarEstadoClinico'

function crearMeshDePrueba() {
  const mesh = new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial({ color: '#ffffff' }))
  mesh.name = '16'
  mesh.position.set(1.23, -4.56, 7.89)
  mesh.rotation.set(0.1, 0.2, 0.3)
  mesh.scale.set(1.1, 0.9, 1.05)
  return mesh
}

function snapshot(mesh) {
  return {
    position: mesh.position.toArray(),
    rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
    scale: mesh.scale.toArray(),
    matrix: mesh.matrix.toArray(),
  }
}

describe('aplicarEstadoClinico — contrato: nunca toca position/rotation/scale', () => {
  it('con estado "caries": cambia el color, la transformación queda IDÉNTICA', () => {
    const mesh = crearMeshDePrueba()
    const antes = snapshot(mesh)
    aplicarEstadoClinico(mesh, { id: 'p1', numero_pieza: '16', estado: 'sano', caras: [{ cara: 'oclusal', estado: 'caries' }] }, { visible: true, seleccionada: false })
    expect(snapshot(mesh)).toEqual(antes)
    expect(mesh.material.color.getHexString()).toBe('fca5a5')
  })

  it('con estado "corona": cambia el color, la transformación queda IDÉNTICA', () => {
    const mesh = crearMeshDePrueba()
    const antes = snapshot(mesh)
    aplicarEstadoClinico(mesh, { id: 'p1', numero_pieza: '16', estado: 'corona' }, { visible: true, seleccionada: false })
    expect(snapshot(mesh)).toEqual(antes)
  })

  it('seleccionada: cambia emissive, la transformación sigue IDÉNTICA', () => {
    const mesh = crearMeshDePrueba()
    const antes = snapshot(mesh)
    aplicarEstadoClinico(mesh, { id: 'p1', numero_pieza: '16', estado: 'sano' }, { visible: true, seleccionada: true })
    expect(snapshot(mesh)).toEqual(antes)
    expect(mesh.material.emissiveIntensity).toBeGreaterThan(0)
  })

  it('ausente: solo cambia mesh.visible a false, la transformación sigue IDÉNTICA', () => {
    const mesh = crearMeshDePrueba()
    const antes = snapshot(mesh)
    aplicarEstadoClinico(mesh, { id: 'p1', numero_pieza: '16', estado: 'ausente' }, { visible: true, seleccionada: false })
    expect(snapshot(mesh)).toEqual(antes)
    expect(mesh.visible).toBe(false)
  })

  it('fuera del arco visible (arcoVisible=superior/inferior): solo mesh.visible=false, transformación intacta', () => {
    const mesh = crearMeshDePrueba()
    const antes = snapshot(mesh)
    aplicarEstadoClinico(mesh, { id: 'p1', numero_pieza: '16', estado: 'sano' }, { visible: false, seleccionada: false })
    expect(snapshot(mesh)).toEqual(antes)
    expect(mesh.visible).toBe(false)
  })

  it('sin pieza clínica (undefined): oculta el mesh, no truena, transformación intacta', () => {
    const mesh = crearMeshDePrueba()
    const antes = snapshot(mesh)
    expect(() => aplicarEstadoClinico(mesh, undefined, { visible: true, seleccionada: false })).not.toThrow()
    expect(snapshot(mesh)).toEqual(antes)
    expect(mesh.visible).toBe(false)
  })
})
