import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rutaEscenaDental = join(__dirname, '..', 'EscenaDental3D.jsx')
const rutaOdontogramaGLBScene = join(__dirname, '..', 'OdontogramaGLBScene.jsx')
const codigoEscenaDental = readFileSync(rutaEscenaDental, 'utf8')
const codigoGLBScene = readFileSync(rutaOdontogramaGLBScene, 'utf8')
// El código relevante para "sin reconstrucción" está repartido entre
// los dos archivos ahora que EscenaDental3D.jsx es un envoltorio
// delgado sobre OdontogramaGLBScene.jsx (compartido con la prueba
// para OdontogramaGLBScene) — se revisan ambos juntos.
const codigoCombinado = codigoEscenaDental + '\n' + codigoGLBScene

// Prueba de regresión intencionalmente literal: si en el futuro
// alguien vuelve a agregar reconstrucción de posición/rotación
// (configuracionDental.js, Math.atan2 para tangentes, Math.sin/cos
// para una elipse), esta prueba debe fallar de inmediato — es más
// confiable que confiar en que nadie lo reintroduzca sin darse cuenta.
describe('EscenaDental3D.jsx + OdontogramaGLBScene.jsx — sin reconstrucción de posición (inspección de código fuente)', () => {
  it('no importan configuracionDental.js', () => {
    expect(codigoCombinado).not.toMatch(/configuracionDental/)
  })

  it('no usan Math.atan2 (rotación por tangente)', () => {
    expect(codigoCombinado).not.toMatch(/Math\.atan2/)
  })

  it('no usan Math.sin/Math.cos (curva elíptica sintética)', () => {
    expect(codigoCombinado).not.toMatch(/Math\.(sin|cos)\(/)
  })

  it('no importan posicionAnatomicaReal.js (también reconstruía, aunque con datos reales)', () => {
    expect(codigoCombinado).not.toMatch(/posicionAnatomicaReal/)
  })

  it('EscenaDental3D.jsx NO renderiza <primitive> directamente — delega TODO a OdontogramaGLBScene', () => {
    expect(codigoEscenaDental).not.toMatch(/<primitive\s+object=/)
    expect(codigoEscenaDental).toMatch(/OdontogramaGLBScene/)
  })

  it('OdontogramaGLBScene.jsx sí usa <primitive object=... /> para renderizar la escena directa', () => {
    expect(codigoGLBScene).toMatch(/<primitive\s+object=/)
  })

  it('OdontogramaGLBScene.jsx sí usa identificarNodosPorFdi (la única fuente GLB NODE → FDI)', () => {
    expect(codigoGLBScene).toMatch(/identificarNodosPorFdi/)
  })

  it('EscenaDental3D.jsx ya NO depende de Diente3D.jsx (geometría real desacoplada del placeholder)', () => {
    expect(codigoEscenaDental).not.toMatch(/from '\.\/Diente3D'/)
  })
})

