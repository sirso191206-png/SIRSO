import { supabase } from '../lib/supabase'
import { sanitizarTerminoBusqueda } from '../lib/texto'

// Si ya existe un paciente con esa CURP en la clínica, lo regresa (para
// no crear un expediente duplicado) — si no, regresa null.
export async function buscarPacientePorCurp(curp) {
  const { data, error } = await supabase
    .from('pacientes')
    .select('id, nombre_completo, numero_expediente, archivado_en')
    .eq('curp', curp)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function buscarPacientes(termino, { incluirArchivados = false } = {}) {
  let query = supabase
    .from('v_pacientes_seguro')
    .select('id, nombre_completo, telefono, correo, fecha_nacimiento, archivado_en')
    .order('nombre_completo')
    .limit(50)

  if (!incluirArchivados) {
    query = query.is('archivado_en', null)
  }

  const terminoLimpio = sanitizarTerminoBusqueda(termino)
  if (terminoLimpio) {
    query = query.or(
      `nombre_completo.ilike.%${terminoLimpio}%,telefono.ilike.%${terminoLimpio}%`
    )
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function obtenerPaciente(id) {
  const { data, error } = await supabase
    .from('v_pacientes_seguro')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function crearPaciente(paciente) {
  const { data, error } = await supabase
    .from('pacientes')
    .insert(paciente)
    .select()
    .single()
  if (error) throw error

  // El expediente vacío y el odontograma se crean solos, vía triggers en
  // la BD — no hace falta insertarlos aquí.

  return data
}

export async function actualizarPaciente(id, cambios) {
  const { data, error } = await supabase
    .from('pacientes')
    .update(cambios)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Reasignación de odontólogo responsable — separada de
// actualizarPaciente() a propósito: en la base, un trigger
// (fn_validar_reasignacion_paciente) bloquea este cambio específico si
// quien lo hace no es owner, aunque el resto de la fila sí se pudiera
// editar. Tener una función aparte deja claro en el código que esta
// acción tiene una regla de permisos distinta al resto del formulario.
export async function reasignarPaciente(id, dentistaResponsableId) {
  const { data, error } = await supabase
    .from('pacientes')
    .update({ dentista_responsable_id: dentistaResponsableId })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function obtenerSaldo(pacienteId) {
  const { data, error } = await supabase
    .from('v_saldo_pacientes')
    .select('*')
    .eq('paciente_id', pacienteId)
    .maybeSingle()
  if (error) throw error
  return data ?? { total_tratamientos: 0, total_pagado: 0, saldo: 0 }
}

// Baja lógica: el paciente y toda su historia clínica se quedan intactos,
// solo se ocultan de las listas normales. Reversible con restaurarPaciente.
export async function archivarPaciente(id) {
  const { error } = await supabase
    .from('pacientes')
    .update({ archivado_en: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function restaurarPaciente(id) {
  const { error } = await supabase
    .from('pacientes')
    .update({ archivado_en: null })
    .eq('id', id)
  if (error) throw error
}

// Alerta simple de posibles duplicados antes de guardar (fuzzy por nombre/telefono)
export async function buscarPosiblesDuplicados({ nombre_completo, telefono }) {
  const nombreLimpio = sanitizarTerminoBusqueda(nombre_completo)
  const telefonoLimpio = sanitizarTerminoBusqueda(telefono)
  const { data, error } = await supabase
    .from('pacientes')
    .select('id, nombre_completo, telefono')
    .or(`telefono.eq.${telefonoLimpio},nombre_completo.ilike.%${nombreLimpio}%`)
    .limit(5)
  if (error) throw error
  return data
}

// ------------------------------------------------------------
// Lista mejorada de pacientes (Fase 5): foto, folio, edad, última
// consulta, próxima cita, tratamiento activo, saldo, con filtros que
// SÍ afectan la paginación (no solo un post-filtro cosmético) y
// ordenamiento.
// ------------------------------------------------------------

const FILTROS_CRUZADOS = {
  con_saldo: async () => {
    const { data, error } = await supabase.from('v_saldo_pacientes').select('paciente_id').gt('saldo', 0)
    if (error) throw error
    return data.map((r) => r.paciente_id)
  },
  con_tratamiento: async () => {
    const { data, error } = await supabase.from('tratamientos').select('paciente_id').in('estado', ['planeado', 'en_progreso'])
    if (error) throw error
    return [...new Set(data.map((r) => r.paciente_id))]
  },
  con_cita: async () => {
    const { data, error } = await supabase
      .from('citas')
      .select('paciente_id')
      .gte('inicio', new Date().toISOString())
      .not('estado', 'in', '(cancelada,completada,no_asistio)')
    if (error) throw error
    return [...new Set(data.map((r) => r.paciente_id))]
  }
}

export async function buscarPacientesDetallado({
  termino = '',
  filtroEstado = 'activos', // activos | archivados | todos
  filtroExtra = '', // '' | con_saldo | con_tratamiento | con_cita
  orden = 'nombre_completo.asc',
  pagina = 1,
  porPagina = 15
}) {
  let idsPermitidos = null
  if (filtroExtra && FILTROS_CRUZADOS[filtroExtra]) {
    idsPermitidos = await FILTROS_CRUZADOS[filtroExtra]()
    if (idsPermitidos.length === 0) return { pacientes: [], total: 0 }
  }

  let query = supabase
    .from('v_pacientes_seguro')
    .select('id, nombre_completo, numero_expediente, telefono, correo, fecha_nacimiento, archivado_en', { count: 'exact' })

  if (filtroEstado === 'activos') query = query.is('archivado_en', null)
  if (filtroEstado === 'archivados') query = query.not('archivado_en', 'is', null)
  if (idsPermitidos) query = query.in('id', idsPermitidos)
  const terminoLimpio = sanitizarTerminoBusqueda(termino)
  if (terminoLimpio) {
    query = query.or(
      `nombre_completo.ilike.%${terminoLimpio}%,telefono.ilike.%${terminoLimpio}%,correo.ilike.%${terminoLimpio}%,numero_expediente.ilike.%${terminoLimpio}%`
    )
  }

  const [campoOrden, direccion] = orden.split('.')
  query = query.order(campoOrden, { ascending: direccion !== 'desc' })

  const desde = (pagina - 1) * porPagina
  query = query.range(desde, desde + porPagina - 1)

  const { data: pacientes, error, count } = await query
  if (error) throw error
  if (pacientes.length === 0) return { pacientes: [], total: count ?? 0 }

  const ids = pacientes.map((p) => p.id)
  const ahora = new Date().toISOString()

  const [saldosRes, citasPasadasRes, citasFuturasRes, tratamientosRes] = await Promise.all([
    supabase.from('v_saldo_pacientes').select('paciente_id, saldo').in('paciente_id', ids),
    supabase.from('citas').select('paciente_id, inicio').in('paciente_id', ids).lt('inicio', ahora).order('inicio', { ascending: false }),
    supabase.from('citas').select('paciente_id, inicio').in('paciente_id', ids).gte('inicio', ahora).order('inicio', { ascending: true }),
    supabase.from('tratamientos').select('paciente_id, estado').in('paciente_id', ids).in('estado', ['planeado', 'en_progreso'])
  ])

  for (const r of [saldosRes, citasPasadasRes, citasFuturasRes, tratamientosRes]) {
    if (r.error) throw r.error
  }

  const saldoPorId = Object.fromEntries(saldosRes.data.map((s) => [s.paciente_id, Number(s.saldo)]))
  const ultimaConsultaPorId = {}
  for (const c of citasPasadasRes.data) {
    if (!ultimaConsultaPorId[c.paciente_id]) ultimaConsultaPorId[c.paciente_id] = c.inicio
  }
  const proximaCitaPorId = {}
  for (const c of citasFuturasRes.data) {
    if (!proximaCitaPorId[c.paciente_id]) proximaCitaPorId[c.paciente_id] = c.inicio
  }
  const tratamientoActivoPorId = new Set(tratamientosRes.data.map((t) => t.paciente_id))

  const enriquecidos = pacientes.map((p) => ({
    ...p,
    saldo: saldoPorId[p.id] ?? 0,
    ultima_consulta: ultimaConsultaPorId[p.id] ?? null,
    proxima_cita: proximaCitaPorId[p.id] ?? null,
    tratamiento_activo: tratamientoActivoPorId.has(p.id)
  }))

  return { pacientes: enriquecidos, total: count ?? 0 }
}
