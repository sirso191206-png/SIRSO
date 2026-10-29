import { etiquetaAccionPlan } from './planes'

// Etiquetas legibles para la auditoría. Los nombres técnicos (crear_pacientes, editar_citas…) los genera
// el trigger de la base de datos; aquí solo se traducen para mostrarlos.
const MODULOS = {
  pacientes: 'Pacientes', expedientes: 'Expedientes', notas_clinicas: 'Notas clínicas', citas: 'Citas', pagos: 'Pagos',
  tratamientos: 'Tratamientos', recetas: 'Recetas', consentimientos_informados: 'Consentimientos',
  referencias_medicas: 'Referencias médicas', usuarios: 'Usuarios', arco_solicitudes: 'Derechos ARCO',
  incidentes_seguridad: 'Incidentes de seguridad', suscripciones: 'Suscripción', planes_catalogo: 'Planes', sesiones: 'Sesiones',
  reportes: 'Reportes', auditoria: 'Auditoría',
  // Migración 120: acciones administrativas.
  clinicas: 'Datos de la clínica', catalogo_tratamientos: 'Catálogo', sucursales: 'Sucursales', consultorios: 'Consultorios',
  sucursal_usuarios: 'Asignación a sucursales', reserva_config: 'Reserva en línea', reserva_servicios: 'Reserva en línea',
  materiales: 'Inventario', movimientos_inventario: 'Inventario', receta_materiales: 'Inventario',
  horarios_bloqueados: 'Horarios bloqueados'
}
const SINGULAR = {
  pacientes: 'paciente', expedientes: 'expediente', notas_clinicas: 'nota clínica', citas: 'cita', pagos: 'pago',
  tratamientos: 'tratamiento', recetas: 'receta', consentimientos_informados: 'consentimiento',
  referencias_medicas: 'referencia médica', usuarios: 'usuario', arco_solicitudes: 'solicitud ARCO',
  incidentes_seguridad: 'incidente de seguridad',
  clinicas: 'datos de la clínica', catalogo_tratamientos: 'tratamiento del catálogo', sucursales: 'sucursal',
  consultorios: 'consultorio', sucursal_usuarios: 'asignación a sucursal', reserva_config: 'configuración de la reserva en línea',
  reserva_servicios: 'servicio de la reserva en línea', materiales: 'material', movimientos_inventario: 'movimiento de inventario',
  receta_materiales: 'material de un tratamiento', horarios_bloqueados: 'horario bloqueado'
}
const VERBO = { crear: 'Crear', editar: 'Editar', eliminar: 'Eliminar' }
const OTRAS = {
  exportar: 'Exportar o imprimir información',
  DATA_EXPORTED: 'Exportar los datos de un paciente',
  cerrar_sesion_remota: 'Cerrar sesión de otro dispositivo',
  ver_clinica: 'Consultar la clínica (soporte de SIRO)'
}

// Quién hizo la acción. Sin usuario es el propio sistema (procesos automáticos); con un usuario que la clínica no puede
// ver es el personal de soporte de SIRO (los usuarios con registros nunca se borran: migración 111).
export function autorDeAuditoria(fila) {
  if (fila?.usuario?.nombre) return fila.usuario.nombre
  return fila?.usuario_id ? 'Soporte de SIRO' : 'Sistema'
}

export const MODULOS_AUDITABLES = Object.entries(MODULOS)
  .filter(([k]) => !['suscripciones', 'planes_catalogo', 'sesiones', 'reportes', 'auditoria'].includes(k))
  .map(([valor, etiqueta]) => ({ valor, etiqueta }))

export const TIPOS_ACCION = [
  { valor: 'crear', etiqueta: 'Altas' },
  { valor: 'editar', etiqueta: 'Cambios' },
  { valor: 'eliminar', etiqueta: 'Bajas' },
  { valor: 'otros', etiqueta: 'Otras (exportar, plan, sesiones…)' }
]

function humanizar(texto) {
  const t = String(texto ?? '').replace(/_/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''
}

export function etiquetaModulo(entidad) {
  return MODULOS[entidad] ?? humanizar(entidad)
}

export function etiquetaAccion(accion) {
  if (OTRAS[accion]) return OTRAS[accion]
  const m = /^(crear|editar|eliminar)_(.+)$/.exec(accion ?? '')
  if (m) return `${VERBO[m[1]]} ${SINGULAR[m[2]] ?? humanizar(m[2]).toLowerCase()}`
  const plan = etiquetaAccionPlan(accion)
  return plan !== accion ? plan : humanizar(accion)
}

// Fecha y hora local en español de México.
export function formatearFechaHora(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Identificador corto del registro afectado (los UUID completos no ayudan a nadie en pantalla).
export function registroCorto(id) {
  return id ? String(id).slice(0, 8) : '—'
}

// Inicio y fin de día LOCAL → ISO, para filtrar por fecha sin perder el último día.
export function rangoDeFechas(desdeYmd, hastaYmd) {
  const inicio = desdeYmd ? new Date(`${desdeYmd}T00:00:00`).toISOString() : null
  const fin = hastaYmd ? new Date(`${hastaYmd}T23:59:59.999`).toISOString() : null
  return { desde: inicio, hasta: fin }
}
