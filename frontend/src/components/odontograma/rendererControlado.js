// Destrucción CONTROLADA del renderer de three.js.
//
// Al desmontar un <Canvas>, @react-three/fiber llama a renderer.forceContextLoss() para soltar el contexto de la tarjeta
// gráfica enseguida (los navegadores solo permiten ~16 a la vez). Es lo correcto — pero three.js registra por su cuenta
// un listener de "webglcontextlost" que imprime "THREE.WebGLRenderer: Context Lost." CADA VEZ, aunque nada se haya
// perdido: es una destrucción pedida por nosotros, y confundía con una pérdida real.
//
// La secuencia ordenada de destrucción es: renderer.dispose() (libera los recursos de three y QUITA esos listeners)
// y DESPUÉS forceContextLoss() (suelta el contexto). Aquí se garantiza ese orden y que ocurra una sola vez:
//   · no se oculta ningún mensaje ni se filtra la consola;
//   · una pérdida REAL de contexto (tarjeta gráfica, demasiados contextos, pestaña reclamada) sigue avisando, porque
//     mientras el renderer está en uso sus listeners siguen puestos.
export function controlarDestruccion(renderer) {
  if (!renderer || renderer.__destruccionControlada) return renderer
  const soltarContexto = renderer.forceContextLoss.bind(renderer)
  let destruido = false
  renderer.forceContextLoss = () => {
    if (destruido) return // idempotente: una segunda llamada no hace nada (evita "context already lost")
    destruido = true
    renderer.dispose()
    soltarContexto()
  }
  renderer.__destruccionControlada = true
  return renderer
}
