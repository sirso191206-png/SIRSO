import { describe, it, expect } from 'vitest'
import { calcularEncuadreCamara, calcularVistasCamara } from '../calcularEncuadreCamara'

// Números reales del bounding box completo de las 32 piezas — medidos
// con Box3.setFromObject() real de Three.js sobre el .glb cargado con
// GLTFLoader real (no un mock), ver informe de diagnóstico.
const CENTRO_REAL = [-0.026, -0.483, 0.044]
const TAMANO_REAL = [6.584, 5.537, 5.620]

describe('calcularEncuadreCamara', () => {
  it('el target siempre es exactamente el centro dado', () => {
    const r = calcularEncuadreCamara({ centro: CENTRO_REAL, tamano: TAMANO_REAL, direccion: [0, 0, 1], fovGrados: 40 })
    expect(r.target).toEqual(CENTRO_REAL)
  })

  it('la distancia es mayor que el tamaño máximo del modelo (la cámara queda AFUERA del objeto, no adentro)', () => {
    const r = calcularEncuadreCamara({ centro: CENTRO_REAL, tamano: TAMANO_REAL, direccion: [0, 0, 1], fovGrados: 40 })
    expect(r.distancia).toBeGreaterThan(Math.max(...TAMANO_REAL))
  })

  it('un FOV más chico exige más distancia para encuadrar el mismo objeto', () => {
    const angosto = calcularEncuadreCamara({ centro: CENTRO_REAL, tamano: TAMANO_REAL, direccion: [0, 0, 1], fovGrados: 20 })
    const amplio = calcularEncuadreCamara({ centro: CENTRO_REAL, tamano: TAMANO_REAL, direccion: [0, 0, 1], fovGrados: 60 })
    expect(angosto.distancia).toBeGreaterThan(amplio.distancia)
  })

  it('un objeto más grande exige más distancia con el mismo FOV', () => {
    const chico = calcularEncuadreCamara({ centro: [0, 0, 0], tamano: [1, 1, 1], direccion: [0, 0, 1], fovGrados: 40 })
    const grande = calcularEncuadreCamara({ centro: [0, 0, 0], tamano: [10, 10, 10], direccion: [0, 0, 1], fovGrados: 40 })
    expect(grande.distancia).toBeGreaterThan(chico.distancia)
  })

  it('la posición de cámara queda sobre la dirección indicada, a partir del centro', () => {
    const r = calcularEncuadreCamara({ centro: [0, 0, 0], tamano: [2, 2, 2], direccion: [0, 0, 1], fovGrados: 40 })
    expect(r.posicion[0]).toBeCloseTo(0, 5)
    expect(r.posicion[1]).toBeCloseTo(0, 5)
    expect(r.posicion[2]).toBeCloseTo(r.distancia, 5)
  })
})

describe('calcularVistasCamara — con el bounding box real de las 32 piezas', () => {
  const vistas = calcularVistasCamara({ centro: CENTRO_REAL, tamano: TAMANO_REAL, fovGrados: 40 })

  it('produce las 6 vistas esperadas: restablecer, ambas, frontal, oclusal, lateral, superior, inferior', () => {
    for (const v of ['restablecer', 'ambas', 'frontal', 'oclusal', 'lateral', 'superior', 'inferior']) {
      expect(vistas[v]).toBeDefined()
      expect(vistas[v].posicion).toHaveLength(3)
      expect(vistas[v].target).toHaveLength(3)
    }
  })

  it('la vista frontal mira principalmente a lo largo de Z (posición se aleja del centro sobre todo en Z)', () => {
    const dz = Math.abs(vistas.frontal.posicion[2] - CENTRO_REAL[2])
    const dx = Math.abs(vistas.frontal.posicion[0] - CENTRO_REAL[0])
    const dy = Math.abs(vistas.frontal.posicion[1] - CENTRO_REAL[1])
    expect(dz).toBeGreaterThan(dx)
    expect(dz).toBeGreaterThan(dy)
  })

  it('la vista oclusal mira principalmente a lo largo de Y (desde arriba)', () => {
    const dy = Math.abs(vistas.oclusal.posicion[1] - CENTRO_REAL[1])
    const dx = Math.abs(vistas.oclusal.posicion[0] - CENTRO_REAL[0])
    expect(dy).toBeGreaterThan(dx)
  })

  it('la vista lateral mira principalmente a lo largo de X (perfil)', () => {
    const dx = Math.abs(vistas.lateral.posicion[0] - CENTRO_REAL[0])
    const dz = Math.abs(vistas.lateral.posicion[2] - CENTRO_REAL[2])
    expect(dx).toBeGreaterThan(dz)
  })

  it('todas las vistas apuntan (target) al centro real del modelo, no a un diente ni al origen', () => {
    for (const v of Object.values(vistas)) {
      expect(v.target).toEqual(CENTRO_REAL)
    }
  })

  it('ninguna distancia de cámara es absurda (ni pegada al modelo, ni a un millón de unidades)', () => {
    for (const [nombre, v] of Object.entries(vistas)) {
      expect(v.distancia, `vista ${nombre}`).toBeGreaterThan(Math.max(...TAMANO_REAL) * 0.5)
      expect(v.distancia, `vista ${nombre}`).toBeLessThan(Math.max(...TAMANO_REAL) * 10)
    }
  })
})
