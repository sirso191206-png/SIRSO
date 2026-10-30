import { supabase } from '../lib/supabase'

/**
 * Trae todas las citas COMPLETADAS de un mes/año dado, con paciente,
 * dentista y su nota clínica asociada (vía cita_id — migración 033).
 * Los signos vitales NO tienen enlace directo a la cita (se capturan
 * aparte, por paciente); se resuelven por separado en
 * `obtenerEntradasMapeoSisPeriodo` tomando el registro más cercano
 * (y anterior) a la fecha de la cita para ese paciente — el mismo
 * criterio best-effort que ya documenta sis-mapper.ts.
 */
export async function obtenerCitasCompletadasPeriodo(anio, mes) {
  const inicioPeriodo = new Date(anio, mes - 1, 1).toISOString()
  const finPeriodo = new Date(anio, mes, 1).toISOString() // primer día del mes siguiente

  // Solo columnas que EXISTEN y que el rol puede leer: la CURP del paciente y la del profesional están protegidas por
  // columna (migración 121) y se leen aparte, por sus vías permitidas. Los demás campos SIS que la base aún no guarda
  // (país/entidad de nacimiento, género, derechohabiencia…) el mapeador los trata como no capturados.
  const { data, error } = await supabase
    .from('citas')
    .select(`
      id, inicio, motivo_consulta,
      paciente:pacientes(id, nombre_completo, sexo, fecha_nacimiento, primer_apellido, segundo_apellido),
      dentista:usuarios!citas_dentista_id_fkey(id, nombre, cedula_profesional),
      notaClinica:notas_clinicas(diagnostico_cie10_codigo, hallazgos, accion_salud_bucal)
    `)
    .eq('estado', 'completada')
    .gte('inicio', inicioPeriodo)
    .lt('inicio', finPeriodo)
    .order('inicio', { ascending: true })

  if (error) throw error

  const curpPacientes = await curpsDePacientes([...new Set(data.map((c) => c.paciente?.id).filter(Boolean))])
  const curpEquipo = await curpsDelEquipo()

  // notaClinica viene como arreglo (relación 1-a-muchos declarada por FK) —
  // nos quedamos con la más reciente si hubiera más de una para la misma cita.
  return data.map((c) => ({
    ...c,
    paciente: c.paciente ? { ...c.paciente, curp: curpPacientes.get(c.paciente.id) ?? null } : c.paciente,
    dentista: c.dentista ? { ...c.dentista, curp: curpEquipo.get(c.dentista.id) ?? null } : c.dentista,
    notaClinica: Array.isArray(c.notaClinica) && c.notaClinica.length > 0
      ? c.notaClinica[c.notaClinica.length - 1]
      : null,
  }))
}

// CURP de pacientes por la vista segura (la entrega a quien puede verla; a los demás, vacía).
async function curpsDePacientes(ids) {
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase.from('v_pacientes_seguro').select('id, curp').in('id', ids)
  if (error) throw error
  return new Map(data.map((p) => [p.id, p.curp]))
}

// CURP del equipo: el propietario la lee de todos (datos_privados_equipo); cualquier otro rol, solo la suya.
async function curpsDelEquipo() {
  const equipo = await supabase.rpc('datos_privados_equipo')
  const filas = equipo.error ? [] : equipo.data ?? []
  if (filas.length > 0) return new Map(filas.map((u) => [u.id, u.curp]))
  const [{ data: sesion }, propio] = await Promise.all([supabase.auth.getUser(), supabase.rpc('mi_perfil_privado')])
  const miCurp = propio.error ? null : propio.data?.[0]?.curp
  return new Map(sesion?.user?.id && miCurp ? [[sesion.user.id, miCurp]] : [])
}

/** Todos los signos_vitales de los pacientes dados, para correlacionar por fecha en el cliente. */
export async function obtenerSignosVitalesPorPacientes(pacienteIds) {
  if (pacienteIds.length === 0) return []
  const { data, error } = await supabase
    .from('signos_vitales')
    .select('paciente_id, creado_en, presion_arterial, presion_sistolica, presion_diastolica, peso, estatura, temperatura, frecuencia_cardiaca')
    .in('paciente_id', pacienteIds)
    .order('creado_en', { ascending: true })
  if (error) throw error
  return data
}

/** El registro de signos vitales más reciente en o antes de `fechaLimite` para un paciente, si existe. */
export function signosVitalesMasCercanos(todosLosSignos, pacienteId, fechaLimite) {
  const limite = new Date(fechaLimite).getTime()
  let mejor = null
  for (const sv of todosLosSignos) {
    if (sv.paciente_id !== pacienteId) continue
    const t = new Date(sv.creado_en).getTime()
    if (t <= limite && (!mejor || t > new Date(mejor.creado_en).getTime())) mejor = sv
  }
  return mejor
}

/** La CLUES de la clínica del usuario actual (ya guardada en Configuración). */
export async function obtenerClinicaPropia() {
  const { data, error } = await supabase
    .from('clinicas')
    .select('id, nombre, clave_unidad_medica')
    .single()
  if (error) throw error
  return data
}
