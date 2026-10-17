// Aceptación de los documentos legales de SIRO (migración 106). Lógica pura: qué documentos exige cada persona y cuáles le faltan.
// Todas las personas usuarias aceptan los Términos y el Aviso de Privacidad; el propietario de una clínica acepta además, en nombre de ella, el Acuerdo de Tratamiento de Datos.
// La superadministración (SIRO mismo) no firma un acuerdo consigo misma.
export const NOMBRES_DOCUMENTO = {
  terms: { titulo: 'Términos y Condiciones', ruta: '/legal/terminos' },
  privacy_integral: { titulo: 'Aviso de Privacidad', ruta: '/legal/privacidad' },
  data_processing_agreement: { titulo: 'Acuerdo de Tratamiento de Datos', ruta: '/legal/acuerdo-tratamiento-datos' }
}

export function tiposRequeridos(perfil) {
  if (!perfil?.id) return []
  const tipos = ['terms', 'privacy_integral']
  if (perfil.rol === 'owner' && !perfil.es_super_admin) tipos.push('data_processing_agreement')
  return tipos
}

// documentos: los ACTIVOS de los tipos requeridos; aceptaciones: las de la persona (cada una con `documento_id`).
// Se compara por id del documento, así que una versión nueva (otro id) vuelve a pedirse y las anteriores no cuentan.
export function calcularPendientes(documentos = [], aceptaciones = []) {
  const aceptados = new Set((aceptaciones ?? []).map((a) => a?.documento_id).filter(Boolean))
  return (documentos ?? []).filter((d) => d?.id && !aceptados.has(d.id))
}

export function construirAceptacion({ perfil, documento, agenteUsuario }) {
  return {
    usuario_id: perfil.id,
    clinica_id: perfil.clinica_id ?? null,
    documento_id: documento.id,
    documento_version: documento.version,   // el servidor lo vuelve a fijar con el del documento
    metodo: 'aceptacion_en_pantalla',
    user_agent: agenteUsuario ? String(agenteUsuario).slice(0, 300) : null
  }
}
