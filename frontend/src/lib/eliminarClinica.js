// Reglas de la pantalla "Eliminar clínica" (la autoridad real es la base de datos — fn_eliminar_clinica, migración 086 —;
// esto solo evita ofrecer un botón que el servidor va a rechazar y explica por qué).
export const ETIQUETAS_CONTEO = {
  usuarios: 'Usuarios (cuentas incluidas)', pacientes: 'Pacientes', citas: 'Citas', tratamientos: 'Tratamientos', pagos: 'Pagos',
  notas_clinicas: 'Notas clínicas', recetas: 'Recetas', consentimientos: 'Consentimientos', fotografias: 'Fotografías',
  documentos_clinicos: 'Documentos clínicos', sucursales: 'Sucursales'
}
export const ETIQUETAS_CONSERVADO = { auditoria: 'Registros de auditoría', solicitudes_arco: 'Solicitudes ARCO', incidentes_seguridad: 'Incidentes de seguridad' }

export const conteosNoVacios = (mapa, etiquetas) => Object.entries(etiquetas).map(([clave, etiqueta]) => ({ clave, etiqueta, cantidad: Number(mapa?.[clave] ?? 0) })).filter((x) => x.cantidad > 0)

export function puedeConfirmarEliminacion({ resumen, confirmarNombre, confirmarDatos }) {
  if (!resumen?.existe || !resumen.puede_eliminar) return false
  if (String(confirmarNombre ?? '').trim() !== resumen.nombre) return false
  if (Number(resumen.conteos?.pacientes ?? 0) > 0 && confirmarDatos !== true) return false
  return true
}

// DD/MM/AAAA en UTC (el mismo formato y zona que usa el servidor en sus mensajes, para que ambos coincidan siempre).
export function fechaDDMMAAAA(iso) {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return null
  const dos = (n) => String(n).padStart(2, '0')
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
}

// OJO con el nombre: la palabra clinica (en femenino) es también un CÓDIGO DE PLAN y la guardia sinPlanesEnElCodigo prohíbe escribirla entre
// comillas en el frontend; por eso la categoría de conservación de la información clínica se llama clinico (masculino).
export const ETIQUETAS_CATEGORIA = { clinico: 'Información clínica', fiscal: 'Pagos (fiscal)', contractual: 'Suscripciones y aceptaciones legales (contractual)' }

// Resumen de la política de UNA categoría de conservación (clinica | fiscal | contractual) para la pantalla; null si no aplica
// (sin política o sin registros de esa categoría). Cada categoría tiene su propia política y su propio plazo.
export function resumenConservacion(resumen, categoria = 'clinico') {
  const c = resumen?.conservacion?.[categoria]
  const anios = Number(c?.politica_anios ?? (categoria === 'clinico' ? resumen?.politica_anios : null))
  const ultimoIso = c?.ultimo_registro ?? (categoria === 'clinico' ? resumen?.ultimo_registro_clinico : null)
  const hastaIso = c?.conservar_hasta ?? (categoria === 'clinico' ? resumen?.conservar_hasta : null)
  const ultimo = fechaDDMMAAAA(ultimoIso)
  const hasta = fechaDDMMAAAA(hastaIso)
  if (!anios || !ultimo || !hasta) return null
  return { categoria, etiqueta: ETIQUETAS_CATEGORIA[categoria], anios, ultimo, hasta, cumplido: new Date(hastaIso).getTime() <= Date.now() }
}

// Qué dice la respuesta de `eliminar` sobre la limpieza: la base de datos ya no tiene la clínica, pero Auth y Storage pueden haber
// fallado. Nunca se anuncia «por completo» si queda algo pendiente.
export function estadoDeLaEliminacion(r) {
  const completa = r?.estado === 'eliminada_completa'
  return { completa, pendientes: r?.pendientes ?? null, hayAvisos: (r?.advertencias?.length ?? 0) > 0 }
}
