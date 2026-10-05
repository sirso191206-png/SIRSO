// Utilidades PURAS del sistema de planes (sin red, sin React). Aquí NO hay
// precios, límites ni listas de planes: todo eso vive en la base de datos
// (planes_catalogo y tablas relacionadas, migración 075) y se consulta.
// Lo que sí hay es formato, validación de formularios y la traducción de los
// errores que la base devuelve al aplicar un límite o una funcionalidad.

export const ETIQUETA_CATEGORIA = {
  clinico: 'Clínico',
  agenda: 'Agenda',
  administrativo: 'Administrativo',
  analitica: 'Analítica',
  plataforma: 'Plataforma',
  general: 'General'
}

const NOMBRE_RECURSO = {
  pacientes: { plural: 'pacientes', alta: 'registrar nuevos pacientes' },
  usuarios: { plural: 'usuarios', alta: 'agregar nuevos usuarios' },
  sucursales: { plural: 'sucursales activas', alta: 'activar nuevas sucursales' }
}

// null/undefined = ilimitado (así lo define la base).
export function esIlimitado(valor) {
  return valor === null || valor === undefined
}

export function formatearLimite(valor) {
  return esIlimitado(valor) ? 'Ilimitado' : Number(valor).toLocaleString('es-MX')
}

export function formatearPrecio(monto, moneda = 'MXN') {
  if (monto === null || monto === undefined) return '—'
  return `$${Number(monto).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${moneda}`
}

export function etiquetaPeriodo(modalidad) {
  return modalidad === 'anual' ? 'año' : 'mes'
}

export function precioDePlan(plan, modalidad) {
  if (!plan) return null
  return modalidad === 'anual' ? plan.precio_anual : plan.precio_mensual
}

// Modalidades que el plan permite, en el orden en que se ofrecen.
export function modalidadesPermitidas(plan) {
  if (!plan) return []
  const lista = []
  if (plan.permite_mensual) lista.push('mensual')
  if (plan.permite_anual) lista.push('anual')
  return lista
}

// Porcentaje de uso para una barra de progreso. null = ilimitado (no hay barra).
export function porcentajeUso(usado, limite) {
  if (esIlimitado(limite)) return null
  if (Number(limite) === 0) return Number(usado) > 0 ? 100 : 0
  return Math.min(100, Math.round((Number(usado) * 100) / Number(limite)))
}

// 'lleno' (>= 100%), 'alto' (>= 80%), 'normal', o null si es ilimitado.
export function nivelUso(usado, limite) {
  if (esIlimitado(limite)) return null
  const razon = Number(limite) === 0 ? (Number(usado) > 0 ? 1 : 0) : Number(usado) / Number(limite)
  if (razon >= 1) return 'lleno'
  if (razon >= 0.8) return 'alto'
  return 'normal'
}

// Aviso al bajar de plan: NUNCA se borra nada, solo se bloquean altas nuevas.
export function mensajeExceso({ tipo, usado, limite }) {
  const r = NOMBRE_RECURSO[tipo] ?? { plural: tipo, alta: `registrar nuevos ${tipo}` }
  return (
    `Tu clínica actualmente tiene ${Number(usado).toLocaleString('es-MX')} ${r.plural} y el plan permite ` +
    `${Number(limite).toLocaleString('es-MX')}. Puedes seguir consultando tus registros, pero necesitas ` +
    `actualizar tu plan para ${r.alta}.`
  )
}

// ---- Errores que devuelve la base al aplicar el plan ----
// PT402 / PLAN_LIMIT_REACHED: cupo agotado. PT403 / FEATURE_NOT_AVAILABLE:
// funcionalidad no incluida. (Migración 075.)
export function tipoErrorDePlan(error) {
  if (!error) return null
  if (error.details === 'PLAN_LIMIT_REACHED' || error.code === 'PT402') return 'limite'
  if (error.details === 'FEATURE_NOT_AVAILABLE' || error.code === 'PT403') return 'funcionalidad'
  return null
}

export function esErrorDePlan(error) {
  return tipoErrorDePlan(error) !== null
}

export function mensajeErrorDePlan(error) {
  const tipo = tipoErrorDePlan(error)
  if (tipo === 'limite') return error.message || 'Has alcanzado el límite de tu plan.'
  if (tipo === 'funcionalidad') return 'Esta funcionalidad no está disponible en tu plan.'
  return error?.message ?? 'Error desconocido'
}

// ¿La clínica puede usar esta funcionalidad? Solo para ocultar menús/pantallas:
// la barrera real está en la base de datos. Si aún no se cargó la suscripción,
// es una clínica anterior a los planes, o el código no se conoce, NO se oculta
// nada (ocultar de más sería peor que mostrar de más, que la BD igual rechaza).
export function funcionalidadDisponible(suscripcion, codigo) {
  if (!codigo) return true
  if (!suscripcion || suscripcion.sin_suscripcion) return true
  const f = (suscripcion.funcionalidades ?? []).find((x) => x.codigo === codigo)
  if (!f) return true
  return f.habilitada !== false
}

export function agruparFuncionalidades(lista = []) {
  const grupos = new Map()
  for (const f of lista) {
    const cat = f.categoria ?? 'general'
    if (!grupos.has(cat)) grupos.set(cat, [])
    grupos.get(cat).push(f)
  }
  return [...grupos.entries()].map(([categoria, items]) => ({
    categoria,
    etiqueta: ETIQUETA_CATEGORIA[categoria] ?? categoria,
    items
  }))
}

// ---- Formulario de plan (superadmin) ----
const CODIGO_PLAN = /^[a-z][a-z0-9_]{1,30}$/

function aNumeroONull(v) {
  if (v === '' || v === null || v === undefined) return null
  return Number(v)
}

export function formularioDesdePlan(plan) {
  const t = (v) => (v === null || v === undefined ? '' : String(v))
  return {
    plan: plan?.plan ?? '',
    nombre: plan?.nombre ?? '',
    descripcion: plan?.descripcion ?? '',
    precio_mensual: t(plan?.precio_mensual),
    precio_anual: t(plan?.precio_anual),
    moneda: plan?.moneda ?? 'MXN',
    permite_mensual: plan?.permite_mensual ?? true,
    permite_anual: plan?.permite_anual ?? true,
    activo: plan?.activo ?? true,
    visible: plan?.visible ?? true,
    recomendado: plan?.recomendado ?? false,
    orden: t(plan?.orden ?? 0),
    max_pacientes: t(plan?.max_pacientes),
    max_usuarios: t(plan?.max_usuarios),
    limite_sucursales: t(plan?.limite_sucursales),
    limite_sesiones_simultaneas: t(plan?.limite_sesiones_simultaneas),
    max_almacenamiento_mb: t(plan?.max_almacenamiento_mb)
  }
}

// Mismas reglas que sa_guardar_plan en la base (que es la autoridad); esto solo
// avisa antes de mandar. Devuelve { campo: mensaje }.
export function validarFormularioPlan(form, { esNuevo = false } = {}) {
  const errores = {}
  if (esNuevo && !CODIGO_PLAN.test((form.plan ?? '').trim().toLowerCase())) {
    errores.plan = 'Código inválido: minúsculas, números o guion bajo (2 a 31 caracteres, empieza con letra).'
  }
  if (!(form.nombre ?? '').trim()) errores.nombre = 'El plan necesita un nombre.'
  if (!form.permite_mensual && !form.permite_anual) errores.permite_mensual = 'Permite al menos una modalidad.'
  const precio = (campo, permitido) => {
    const v = form[campo]
    if (permitido && (v === '' || v === null || v === undefined)) return 'Falta el precio.'
    if (v !== '' && (Number.isNaN(Number(v)) || Number(v) < 0)) return 'El precio no puede ser negativo.'
    return null
  }
  const pm = precio('precio_mensual', form.permite_mensual)
  if (pm) errores.precio_mensual = pm
  const pa = precio('precio_anual', form.permite_anual)
  if (pa) errores.precio_anual = pa
  for (const campo of ['max_pacientes', 'max_usuarios', 'limite_sucursales', 'limite_sesiones_simultaneas', 'max_almacenamiento_mb']) {
    const v = form[campo]
    if (v !== '' && (!Number.isInteger(Number(v)) || Number(v) < 0)) errores[campo] = 'Debe ser un entero mayor o igual a 0 (vacío = ilimitado).'
  }
  return errores
}

// '' → null (ilimitado / sin valor) y números como número.
export function planDesdeFormulario(form) {
  return {
    codigo: (form.plan ?? '').trim().toLowerCase(),
    nombre: (form.nombre ?? '').trim(),
    descripcion: form.descripcion?.trim() ? form.descripcion.trim() : null,
    precio_mensual: aNumeroONull(form.precio_mensual),
    precio_anual: aNumeroONull(form.precio_anual),
    moneda: (form.moneda || 'MXN').toUpperCase(),
    permite_mensual: !!form.permite_mensual,
    permite_anual: !!form.permite_anual,
    activo: !!form.activo,
    visible: !!form.visible,
    recomendado: !!form.recomendado,
    orden: aNumeroONull(form.orden) ?? 0,
    max_pacientes: aNumeroONull(form.max_pacientes),
    max_usuarios: aNumeroONull(form.max_usuarios),
    limite_sucursales: aNumeroONull(form.limite_sucursales),
    limite_sesiones_simultaneas: aNumeroONull(form.limite_sesiones_simultaneas),
    max_almacenamiento_mb: aNumeroONull(form.max_almacenamiento_mb)
  }
}

// Texto legible de un movimiento del historial (auditoría).
const ACCION = {
  crear_plan: 'Creó el plan',
  editar_plan: 'Modificó el plan',
  activar_plan: 'Activó el plan',
  desactivar_plan: 'Desactivó el plan',
  duplicar_plan: 'Duplicó el plan',
  editar_funcionalidades_plan: 'Cambió funcionalidades del plan',
  crear_funcionalidad: 'Creó una funcionalidad',
  editar_funcionalidad: 'Editó una funcionalidad',
  asignar_plan: 'Asignó plan a una clínica',
  cambiar_plan: 'Cambió el plan de una clínica',
  aplicar_condiciones_plan: 'Aplicó las condiciones actuales del plan',
  ajustar_condiciones_clinica: 'Ajustó condiciones de una clínica',
  suspender_suscripcion: 'Suspendió una suscripción',
  reactivar_suscripcion: 'Reactivó una suscripción'
}

export function etiquetaAccionPlan(accion) {
  return ACCION[accion] ?? accion
}

// Resume qué cambió (antes → después) para mostrarlo en el historial.
export function resumirCambios(detalle) {
  const cambios = detalle?.cambios
  if (!cambios || typeof cambios !== 'object') return []
  return Object.entries(cambios).map(([campo, v]) => ({ campo, antes: v?.antes ?? null, despues: v?.despues ?? null }))
}

// La vista guardada como preferencia puede no estar incluida en el plan actual:
// cae a la primera disponible (o null si no hay ninguna).
export function elegirVistaDisponible(preferida, valoresDisponibles) {
  if (valoresDisponibles.includes(preferida)) return preferida
  return valoresDisponibles[0] ?? null
}

// Misma regla que sa_guardar_funcionalidad (la base es la autoridad).
const CODIGO_FUNCIONALIDAD = /^[a-z][a-z0-9_]{1,40}$/
export function validarFuncionalidad(form) {
  const errores = {}
  if (!CODIGO_FUNCIONALIDAD.test((form.codigo ?? '').trim().toLowerCase())) {
    errores.codigo = 'Código inválido: minúsculas, números o guion bajo (2 a 41 caracteres, empieza con letra).'
  }
  if (!(form.nombre ?? '').trim()) errores.nombre = 'Falta el nombre.'
  return errores
}

// ---------------------------------------------------------------------------
// Identidad de la suscripción: SIEMPRE usuario + clínica. Lo cargado para una
// identidad nunca se usa para otra (caché, store y gating lo comprueban).
// ---------------------------------------------------------------------------
export function identidadSuscripcion(perfil) {
  if (!perfil?.id || !perfil?.clinica_id) return null
  return `${perfil.id}:${perfil.clinica_id}`
}

// Clave de la caché local: una por usuario Y clínica.
export function claveCacheSuscripcion(userId, clinicaId) {
  return `siro:mi-suscripcion:${userId}:${clinicaId}`
}

// ¿Alguna de estas funcionalidades está disponible? (pestañas que agrupan varias).
// Un arreglo vacío no oculta nada.
export function alMenosUnaDisponible(suscripcion, codigos) {
  if (!Array.isArray(codigos)) return funcionalidadDisponible(suscripcion, codigos)
  if (codigos.length === 0) return true
  return codigos.some((c) => funcionalidadDisponible(suscripcion, c))
}

// Nombre legible de una funcionalidad, tomado de la suscripción (viene de la base):
// aquí no hay nombres de funcionalidades escritos a mano.
export function nombreDeFuncionalidad(suscripcion, codigo) {
  return (suscripcion?.funcionalidades ?? []).find((f) => f.codigo === codigo)?.nombre ?? null
}

// Enlaces de menú visibles para un rol y un plan. `funcionalidad` puede ser un
// código, una lista (basta una) o no existir (siempre visible).
export function enlacesVisibles(enlaces, rol, disponible) {
  return enlaces.filter((e) => e.roles.includes(rol) && disponible(e.funcionalidad))
}
