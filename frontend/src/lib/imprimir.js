// Documentos imprimibles (recibo, presupuesto, receta, consentimiento, referencia, corte de caja, expediente).
//
// SEGURIDAD: la ventana de impresión comparte origen con SIRO (lee la misma sesión), así que un nombre de paciente,
// una nota o un medicamento con «<img onerror=…>» se ejecutaría con la sesión de quien imprime. Por eso:
//  1. Todo documento se arma con la plantilla `html` — cada valor interpolado se ESCAPA, salvo que sea a su vez un
//     fragmento `html` (o una lista de ellos). Un texto con marcado escrito «a mano» se escapa: hay que usar `html`.
//  2. abrirVentanaImpresion SOLO acepta documentos `html`; un texto plano lanza error (evita regresiones).
//  3. Segunda barrera: una política CSP con nonce. Solo corre el <script> propio del documento (window.print);
//     cualquier script o manejador inyectado se bloquea aunque algún día fallara el escape.

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

function nonceAleatorio() {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// Inserta la CSP y firma con el nonce los <script> del documento. Como todo dato está escapado, los únicos «<script»
// que pueden aparecer son los escritos en la plantilla.
export function documentoConPolitica(documento, nonce = nonceAleatorio()) {
  if (!esHtmlSeguro(documento)) throw new Error('Documento de impresión sin escapar: usa la plantilla html de lib/imprimir.')
  const csp = `default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'`
  return documento.texto
    .replace(/<head>/i, `<head>\n      <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
    .replace(/<script>/gi, `<script nonce="${nonce}">`)
}

export function abrirVentanaImpresion(documento) {
  const texto = documentoConPolitica(documento)
  const ventana = window.open('', '_blank')
  if (!ventana) {
    throw new Error('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio.')
  }
  ventana.document.write(texto)
  ventana.document.close()
}
