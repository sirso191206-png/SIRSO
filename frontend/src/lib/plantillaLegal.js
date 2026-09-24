// Sustituye tokens {{VARIABLE}} dentro del texto de un documento legal
// por su valor real. Si una variable no tiene valor configurado (null,
// undefined, o cadena vacía), se deja un marcador visible en vez de
// inventar un valor — nunca se debe mostrar información legal falsa
// solo para que el texto se vea "completo".
const SIN_CONFIGURAR = (nombreVariable) => `[${nombreVariable} — pendiente de configurar]`

export function sustituirVariables(contenido, variables = {}) {
  if (!contenido) return ''
  return contenido.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (coincidenciaCompleta, nombreVariable) => {
    const valor = variables[nombreVariable]
    if (valor === null || valor === undefined || valor === '') return SIN_CONFIGURAR(nombreVariable)
    return String(valor)
  })
}

// Junta las variables disponibles para una clínica + un documento
// concreto, en el vocabulario exacto que usan los documentos
// ({{RESPONSABLE}}, {{DOMICILIO}}, etc.) — separado de la llamada a
// Supabase para poder probarlo sin red.
export function construirVariablesDocumento({ clinica, documento }) {
  return {
    RESPONSABLE: clinica?.razon_social || clinica?.nombre || null,
    DOMICILIO: clinica?.direccion || null,
    CORREO_PRIVACIDAD: clinica?.correo_privacidad || clinica?.correo || null,
    TELEFONO: clinica?.telefono || null,
    RFC: clinica?.rfc || null,
    FECHA_ACTUALIZACION: documento?.publicado_en
      ? new Date(documento.publicado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
      : null,
    VERSION: documento?.version || null
  }
}
