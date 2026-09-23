import { describe, it, expect } from 'vitest'
import {
  alturaPorProfundidad, construirPuntosZigzag, puntosATextoPolilinea, anchoTotal,
  SITIOS_VESTIBULAR, SITIOS_LINGUAL, ALTURA_ZONA, ANCHO_DIENTE, PROFUNDIDAD_MAX_ESCALA
} from '../../../lib/graficaPeriodontal'

describe('alturaPorProfundidad — conversión mm a píxeles', () => {
  it('0mm da 0px', () => {
    expect(alturaPorProfundidad(0)).toBe(0)
  })

  it('el máximo de la escala (12mm) da la altura completa de la zona', () => {
    expect(alturaPorProfundidad(PROFUNDIDAD_MAX_ESCALA)).toBe(ALTURA_ZONA)
  })

  it('la mitad de la escala da la mitad de la altura', () => {
    expect(alturaPorProfundidad(6)).toBe(ALTURA_ZONA / 2)
  })

  it('valores por encima del máximo se acotan, nunca exceden la zona', () => {
    expect(alturaPorProfundidad(20)).toBe(ALTURA_ZONA)
  })

  it('valores negativos o nulos se tratan como 0, nunca negativos', () => {
    expect(alturaPorProfundidad(-3)).toBe(0)
    expect(alturaPorProfundidad(null)).toBe(0)
    expect(alturaPorProfundidad(undefined)).toBe(0)
  })
})

describe('construirPuntosZigzag — vestibular vs lingual quedan espejados', () => {
  const piezaConSondaje = (numero, profundidad) => ({
    numero_pieza: numero,
    sitios: SITIOS_VESTIBULAR.concat(SITIOS_LINGUAL).map((sitio) => ({
      sitio, profundidad_sondaje: profundidad, sangrado: false
    }))
  })

  it('genera exactamente 3 puntos por diente (uno por sitio del lado dado)', () => {
    const puntos = construirPuntosZigzag([piezaConSondaje(11, 3)], SITIOS_VESTIBULAR, true)
    expect(puntos).toHaveLength(3)
  })

  it('vestibular (esVestibular=true): profundidad 0 queda en el borde INFERIOR de su zona (y = ALTURA_ZONA)', () => {
    const puntos = construirPuntosZigzag([piezaConSondaje(11, 0)], SITIOS_VESTIBULAR, true)
    expect(puntos[0].y).toBe(ALTURA_ZONA)
  })

  it('vestibular: a mayor profundidad, el punto sube (y decrece)', () => {
    const puntosProfundo = construirPuntosZigzag([piezaConSondaje(11, 9)], SITIOS_VESTIBULAR, true)
    const puntosSuperficial = construirPuntosZigzag([piezaConSondaje(11, 2)], SITIOS_VESTIBULAR, true)
    expect(puntosProfundo[0].y).toBeLessThan(puntosSuperficial[0].y)
  })

  it('lingual (esVestibular=false): profundidad 0 queda en el borde SUPERIOR de su zona (y = 0) — espejado respecto a vestibular', () => {
    const puntos = construirPuntosZigzag([piezaConSondaje(11, 0)], SITIOS_LINGUAL, false)
    expect(puntos[0].y).toBe(0)
  })

  it('lingual: a mayor profundidad, el punto baja (y crece) — opuesto a vestibular', () => {
    const puntosProfundo = construirPuntosZigzag([piezaConSondaje(11, 9)], SITIOS_LINGUAL, false)
    const puntosSuperficial = construirPuntosZigzag([piezaConSondaje(11, 2)], SITIOS_LINGUAL, false)
    expect(puntosProfundo[0].y).toBeGreaterThan(puntosSuperficial[0].y)
  })

  it('el sangrado de cada sitio se conserva en el punto correspondiente', () => {
    const pieza = {
      numero_pieza: 11,
      sitios: [{ sitio: 'mesial_v', profundidad_sondaje: 3, sangrado: true }]
    }
    const puntos = construirPuntosZigzag([pieza], ['mesial_v'], true)
    expect(puntos[0].sangrado).toBe(true)
  })

  it('un diente ausente (pieza null en el arreglo) no revienta — usa profundidad 0 sin sangrado', () => {
    const puntos = construirPuntosZigzag([null], SITIOS_VESTIBULAR, true)
    expect(puntos).toHaveLength(3)
    expect(puntos.every((p) => p.profundidad === 0 && p.sangrado === false)).toBe(true)
  })

  it('dientes consecutivos avanzan en X sin traslaparse (el segundo diente empieza donde termina el primero)', () => {
    const puntos = construirPuntosZigzag([piezaConSondaje(11, 3), piezaConSondaje(12, 3)], SITIOS_VESTIBULAR, true)
    const xUltimoPrimerDiente = puntos[2].x
    const xPrimeroSegundoDiente = puntos[3].x
    expect(xPrimeroSegundoDiente).toBeGreaterThan(xUltimoPrimerDiente)
    expect(puntos[3].indicePieza).toBe(1)
  })
})

describe('puntosATextoPolilinea — formato SVG', () => {
  it('convierte puntos a la sintaxis "x,y x,y" que espera <polyline points="">', () => {
    const texto = puntosATextoPolilinea([{ x: 0, y: 10 }, { x: 18, y: 5 }])
    expect(texto).toBe('0,10 18,5')
  })

  it('arreglo vacío da texto vacío, no rompe', () => {
    expect(puntosATextoPolilinea([])).toBe('')
  })
})

describe('anchoTotal', () => {
  it('16 dientes (una arcada completa) da 16 × ANCHO_DIENTE', () => {
    expect(anchoTotal(16)).toBe(16 * ANCHO_DIENTE)
  })
})
