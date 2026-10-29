// Teléfonos de pacientes, tutores y contactos: se guardan SOLO con dígitos (y un «+» inicial si es internacional), para que
// «55 1234 5678», «55-1234-5678» y «5512345678» sean el mismo número al buscar y al marcar (tel:).

export function normalizarTelefono(valor) {
  const texto = String(valor ?? '').trim()
  if (!texto) return ''
  const internacional = texto.startsWith('+')
  return (internacional ? '+' : '') + texto.replace(/[\s\-().]/g, '').replace(/^\+/, '')
}

// Vacío cuenta como válido (los teléfonos opcionales se validan solo si se escriben). 10 a 15 dígitos: México usa 10.
export function telefonoValido(valor) {
  const normal = normalizarTelefono(valor)
  return normal === '' || /^\+?\d{10,15}$/.test(normal)
}

export const MENSAJE_TELEFONO_INVALIDO = 'Escribe un teléfono de 10 dígitos (solo números; puedes usar espacios o guiones).'

// Para buscar: si lo escrito parece un teléfono («55 1234», «55-12-34»), se buscan solo sus dígitos.
export function terminoTelefonico(termino) {
  const texto = String(termino ?? '').trim()
  if (!/^[\d\s\-().+]+$/.test(texto)) return null
  const digitos = texto.replace(/\D/g, '')
  return digitos.length >= 3 ? digitos : null
}

// RFC mexicano: 3 letras (moral) o 4 (física), fecha AAMMDD y homoclave de 3. Se compara en mayúsculas y sin espacios.
export function normalizarRfc(valor) {
  return String(valor ?? '').toUpperCase().replace(/\s+/g, '')
}
export function rfcValido(valor) {
  const r = normalizarRfc(valor)
  return r === '' || /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(r)
}
