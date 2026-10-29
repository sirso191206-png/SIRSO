// Documentos imprimibles (recibo, presupuesto, receta, consentimiento, referencia, corte de caja, expediente).
//
// SEGURIDAD: la ventana de impresión comparte origen con SIRO (lee la misma sesión), así que un nombre de paciente,
// una nota o un medicamento con «<img onerror=…>» se ejecutaría con la sesión de quien imprime. Por eso:
//  1. Todo documento se arma con la plantilla `html` — cada valor interpolado se ESCAPA, salvo que sea a su vez un
//     fragmento `html` (o una lista de ellos). Un texto con marcado escrito «a mano» se escapa: hay que usar `html`.
//  2. abrirVentanaImpresion SOLO acepta documentos `html`; un texto plano lanza error (evita regresiones).
//  3. Segunda barrera: una política CSP sin scripts (script-src 'none'). El documento no lleva ningún <script>: la
//     impresión la lanza SIRO desde fuera (imprimirCuandoCargue), así que cualquier script o manejador inyectado se
//     bloquea aunque algún día fallara el escape. Además, la ventana hereda la CSP del sitio, que tampoco permite
//     scripts en línea.

class HtmlSeguro {
  constructor(texto) { this.texto = texto }
  toString() { return this.texto }
}

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escaparHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ENTIDADES[c])
}

function interpolar(valor) {
  if (valor instanceof HtmlSeguro) return valor.texto
  if (Array.isArray(valor)) return valor.map(interpolar).join('')
  if (valor == null || valor === false) return ''
  return escaparHtml(valor)
}

export function html(partes, ...valores) {
  return new HtmlSeguro(partes.reduce((acc, parte, i) => acc + parte + (i < valores.length ? interpolar(valores[i]) : ''), ''))
}

export function esHtmlSeguro(valor) {
  return valor instanceof HtmlSeguro
}

// Solo imágenes embebidas (firmas) o de https (logo en Storage). Cualquier otra cosa no se pinta.
export function urlImagenSegura(url) {
  const u = String(url ?? '').trim()
  return /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(u) || /^https:\/\//i.test(u) ? u : ''
}

export const CSP_IMPRESION = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'"

// Inserta la CSP en el documento. Ninguna plantilla lleva <script>.
export function documentoConPolitica(documento) {
  if (!esHtmlSeguro(documento)) throw new Error('Documento de impresión sin escapar: usa la plantilla html de lib/imprimir.')
  return documento.texto.replace(/<head>/i, `<head>\n      <meta http-equiv="Content-Security-Policy" content="${CSP_IMPRESION}" />`)
}

// Imprime cuando las imágenes (el logo viene de Supabase Storage) terminaron de cargar o fallaron; si alguna nunca
// responde, imprime de todos modos a los 5 s para no dejar la ventana esperando.
export function imprimirCuandoCargue(ventana, { espera = 150, limite = 5000 } = {}) {
  let hecho = false
  const imprimir = () => {
    if (hecho) return
    hecho = true
    setTimeout(() => { ventana.focus(); ventana.print() }, espera)
  }
  const pendientes = Array.from(ventana.document.images).filter((i) => !i.complete)
  if (!pendientes.length) return imprimir()
  let faltan = pendientes.length
  const lista = () => { if (--faltan === 0) imprimir() }
  for (const img of pendientes) {
    img.addEventListener('load', lista, { once: true })
    img.addEventListener('error', lista, { once: true })
  }
  setTimeout(imprimir, limite)
}

export function abrirVentanaImpresion(documento) {
  const texto = documentoConPolitica(documento)
  const ventana = window.open('', '_blank')
  if (!ventana) {
    throw new Error('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio.')
  }
  ventana.document.write(texto)
  ventana.document.close()
  imprimirCuandoCargue(ventana)
}
