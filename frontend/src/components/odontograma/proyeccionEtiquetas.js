import { Vector3 } from 'three'

// Proyecta un punto del mundo 3D a píxeles de pantalla y calcula la escala que le toca. Es la misma matemática que usa
// <Html distanceFactor> de drei (escala = distanceFactor / (2·tan(fov/2)·distancia)), pero SIN crear un React root por
// cada etiqueta: <Html> dejaba ~65 listeners DEL DOM por etiqueta que no se liberaban al desmontar (con 64 etiquetas,
// ~4,200 listeners fugados cada vez que se abría el 3D). Función pura: se prueba con una cámara de three sin WebGL.
const punto = new Vector3()
const posicionCamara = new Vector3()

export function proyectarPunto(posicion, camara, ancho, alto, distanceFactor) {
  punto.set(posicion[0], posicion[1], posicion[2])
  posicionCamara.setFromMatrixPosition(camara.matrixWorld)
  const distancia = punto.distanceTo(posicionCamara)
  punto.project(camara)
  // z en (-1, 1) = delante de la cámara y dentro del rango de profundidad; x/y con un margen fuera del encuadre.
  const visible = punto.z > -1 && punto.z < 1 && Math.abs(punto.x) <= 1.25 && Math.abs(punto.y) <= 1.25
  const escala = distanceFactor ? distanceFactor / (2 * Math.tan((camara.fov * Math.PI) / 360) * distancia) : 1
  return {
    visible,
    x: (punto.x * 0.5 + 0.5) * ancho,
    y: (-punto.y * 0.5 + 0.5) * alto,
    escala,
    // Lo más cercano a la cámara queda por encima.
    profundidad: Math.round((1 - (punto.z * 0.5 + 0.5)) * 10000)
  }
}
