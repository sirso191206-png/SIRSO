// Registro mínimo para reiniciar la caché del modelo 3D SIN importar three ni drei (este archivo vive en el paquete
// principal; three/drei solo se descargan al entrar a la vista 3D). OdontogramaGLBScene registra aquí cómo limpiar
// la caché de useGLTF; la pantalla que ofrece "Reintentar" solo llama a reiniciarModelo3D().
//
// Por qué hace falta: useGLTF guarda en su caché también las cargas FALLIDAS. Sin limpiarla, "Reintentar" volvería a
// lanzar al instante el mismo error sin intentar descargar nada.
const limpiadores = new Set()

export function registrarLimpiezaModelo(limpiar) {
  limpiadores.add(limpiar)
  return () => limpiadores.delete(limpiar)
}

export function reiniciarModelo3D() {
  for (const limpiar of limpiadores) {
    try { limpiar() } catch (error) { console.error('No se pudo limpiar la caché del modelo 3D:', error) }
  }
}
