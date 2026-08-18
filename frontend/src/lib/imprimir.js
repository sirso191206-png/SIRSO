// Antes vivía duplicado, idéntico, en los 6 generadores de documentos
// imprimibles: imprimirRecibo, imprimirPresupuesto, imprimirReceta,
// imprimirConsentimiento, imprimirReferencia, imprimirCorteDeCaja.
//
// Cada generador sigue construyendo su propio HTML (título, estilos,
// contenido) — lo único que se centraliza aquí es el mecanismo de
// apertura de la ventana e impresión, que era 100% igual en los 6.
export function abrirVentanaImpresion(html) {
  const ventana = window.open('', '_blank')
  if (!ventana) {
    throw new Error('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio.')
  }
  ventana.document.write(html)
  ventana.document.close()
}
