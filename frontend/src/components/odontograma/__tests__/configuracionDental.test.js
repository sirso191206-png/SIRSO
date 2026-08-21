import { describe, it, expect } from 'vitest'
import { CONFIGURACION_DENTAL } from '../configuracionDental'

const FDI_ESPERADOS = [
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
]

describe('configuracionDental — posición anatómica de las 32 piezas', () => {
  it('tiene una entrada para cada uno de los 32 FDI', () => {
    const claves = Object.keys(CONFIGURACION_DENTAL)
    expect(claves.length).toBe(32)
    for (const fdi of FDI_ESPERADOS) {
      expect(CONFIGURACION_DENTAL[String(fdi)]).toBeDefined()
    }
  })

  it('ninguna pieza comparte exactamente la misma posición 3D (x,y,z) que otra — nota: piezas superiores e inferiores SÍ comparten (x,z), es correcto anatómicamente (una arriba y otra abajo alineadas verticalmente), lo que las distingue es Y (altura de arco)', () => {
    const posiciones = Object.entries(CONFIGURACION_DENTAL).map(
      ([fdi, c]) => `${c.posicion[0].toFixed(4)},${c.posicion[1].toFixed(4)},${c.posicion[2].toFixed(4)}`
    )
    const unicas = new Set(posiciones)
    expect(unicas.size).toBe(posiciones.length)
  })

  it('las 16 piezas de arcada superior tienen Y positivo, y las 16 de inferior, negativo', () => {
    const superiores = Object.values(CONFIGURACION_DENTAL).filter((c) => c.arcada === 'superior')
    const inferiores = Object.values(CONFIGURACION_DENTAL).filter((c) => c.arcada === 'inferior')
    expect(superiores.length).toBe(16)
    expect(inferiores.length).toBe(16)
    expect(superiores.every((c) => c.posicion[1] > 0)).toBe(true)
    expect(inferiores.every((c) => c.posicion[1] < 0)).toBe(true)
  })

  it('cuadrantes 1 y 4 (FDI empieza con 1 o 4) son lado derecho; 2 y 3, izquierdo', () => {
    for (const [fdi, config] of Object.entries(CONFIGURACION_DENTAL)) {
      const esperado = ['1', '4'].includes(fdi[0]) ? 'derecho' : 'izquierdo'
      expect(config.lado).toBe(esperado)
    }
  })

  it('la rotación solo usa el eje Y (Blender no hornea rotación distinta por diente — ver README/hallazgos)', () => {
    for (const config of Object.values(CONFIGURACION_DENTAL)) {
      expect(config.rotacion[0]).toBe(0)
      expect(config.rotacion[2]).toBe(0)
    }
  })

  it('cada pieza superior se alinea horizontalmente (x,z) con su contraparte inferior — correcto anatómicamente', () => {
    const superior16 = CONFIGURACION_DENTAL['16']
    const inferior46 = CONFIGURACION_DENTAL['46']
    expect(superior16.posicion[0]).toBeCloseTo(inferior46.posicion[0], 4)
    expect(superior16.posicion[2]).toBeCloseTo(inferior46.posicion[2], 4)
    expect(superior16.posicion[1]).not.toBeCloseTo(inferior46.posicion[1], 4)
  })

  it('cada pieza tiene una escala numérica positiva', () => {
    for (const config of Object.values(CONFIGURACION_DENTAL)) {
      expect(typeof config.escala).toBe('number')
      expect(config.escala).toBeGreaterThan(0)
    }
  })
})
