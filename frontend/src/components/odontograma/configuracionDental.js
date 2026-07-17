import { FILA_SUPERIOR, FILA_INFERIOR, TIPOS_DIENTES } from './constantesOdontograma'

// ------------------------------------------------------------
// Por qué por LONGITUD DE ARCO y no por ángulo:
// Repartir 16 dientes en ángulos iguales sobre una elipse los amontona
// en los extremos (el problema reportado: "molares y premolares se
// amontonan"), porque cerca de los extremos de una elipse la curva
// avanza más en X por cada grado de ángulo. La solución correcta es
// muestrear la curva y repartir los dientes por distancia real
// recorrida sobre ella, no por ángulo — así quedan separados de forma
// pareja de verdad, sin importar la forma de la elipse.
// ------------------------------------------------------------

const RADIO_X = 2.5 // qué tan ancha es la arcada (lateral)
const RADIO_Z = 1.55 // qué tan profunda es (anteroposterior)
const ANGULO_MAX_GRADOS = 96
const RESOLUCION_MUESTREO = 200

function generarPuntosCurva() {
  const anguloMax = (ANGULO_MAX_GRADOS * Math.PI) / 180
  const puntos = []
  for (let i = 0; i <= RESOLUCION_MUESTREO; i++) {
    const t = i / RESOLUCION_MUESTREO
    const angulo = -anguloMax + t * 2 * anguloMax
    puntos.push({
      x: RADIO_X * Math.sin(angulo),
      z: -RADIO_Z * (1 - Math.cos(angulo)),
      angulo
    })
  }
  return puntos
}

function longitudesAcumuladas(puntos) {
  const acumulada = [0]
  for (let i = 1; i < puntos.length; i++) {
    const dx = puntos[i].x - puntos[i - 1].x
    const dz = puntos[i].z - puntos[i - 1].z
    acumulada.push(acumulada[i - 1] + Math.sqrt(dx * dx + dz * dz))
  }
  return acumulada
}

function puntoEnFraccion(puntos, acumulada, fraccion) {
  const objetivo = fraccion * acumulada[acumulada.length - 1]
  for (let i = 1; i < acumulada.length; i++) {
    if (acumulada[i] >= objetivo) {
      const t0 = acumulada[i - 1]
      const t1 = acumulada[i]
      const f = (objetivo - t0) / (t1 - t0 || 1)
      const p0 = puntos[i - 1]
      const p1 = puntos[i]
      return {
        x: p0.x + (p1.x - p0.x) * f,
        z: p0.z + (p1.z - p0.z) * f,
        angulo: p0.angulo + (p1.angulo - p0.angulo) * f
      }
    }
  }
  return puntos[puntos.length - 1]
}

const ESCALA_POR_TIPO = { incisivo: 0.85, canino: 0.95, premolar: 1, molar: 1.12 }

// Arcadas mucho más cercanas que antes (antes ±1.3, ahora ±0.62) — se
// sienten anatómicamente relacionadas en vez de "flotando" separadas.
const ALTURA_ARCADA_SUPERIOR = 0.62
const ALTURA_ARCADA_INFERIOR = -0.62

function generarConfiguracionArcada(numeros, y, invertirRotacion) {
  const puntos = generarPuntosCurva()
  const acumulada = longitudesAcumuladas(puntos)
  const config = {}

  numeros.forEach((numero, i) => {
    const fraccion = i / (numeros.length - 1)
    const punto = puntoEnFraccion(puntos, acumulada, fraccion)
    const tipo = TIPOS_DIENTES[Number(numero)] ?? 'molar'
    // Cuadrantes 1 y 4 (numeración FDI) = lado derecho del paciente
    const lado = ['1', '4'].includes(numero[0]) ? 'derecho' : 'izquierdo'

    config[numero] = {
      tipo,
      arcada: y > 0 ? 'superior' : 'inferior',
      lado,
      posicion: [punto.x, y, punto.z],
      // La rotación sigue la tangente de la curva, para que cada pieza
      // "mire" hacia afuera del arco en vez de estar todas orientadas
      // igual (lo que las hacía verse como postes en fila).
      rotacion: [0, invertirRotacion ? -punto.angulo : punto.angulo, 0],
      escala: ESCALA_POR_TIPO[tipo] ?? 1
    }
  })

  return config
}

export const CONFIGURACION_DENTAL = {
  ...generarConfiguracionArcada(FILA_SUPERIOR, ALTURA_ARCADA_SUPERIOR, false),
  ...generarConfiguracionArcada(FILA_INFERIOR, ALTURA_ARCADA_INFERIOR, true)
}
