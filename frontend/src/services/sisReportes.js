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

  const { data, error } = await supabase
    .from('citas')
    .select(`
      id, inicio, motivo_consulta,
      paciente:pacientes(
        id, nombre_completo, curp, sexo, fecha_nacimiento,
        primer_apellido, segundo_apellido, pais_nacimiento, entidad_nacimiento,
        sexo_biologico, genero, se_autodenomina_afromexicano, se_considera_indigena,
        migrante, pais_procedencia, derechohabiencia
      ),
      dentista:usuarios!citas_dentista_id_fkey(
        id, nombre, cedula_profesional, curp, primer_apellido, segundo_apellido,
        tipo_personal_sis, pais_nacimiento, programa_smym_g
      ),
      notaClinica:notas_clinicas(
        diagnostico_cie10_codigo, hallazgos, accion_salud_bucal
      )
    `)
    .eq('estado', 'completada')
    .gte('inicio', inicioPeriodo)
    .lt('inicio', finPeriodo)
    .order('inicio', { ascending: true })

  if (error) throw error

  // notaClinica viene como arreglo (relación 1-a-muchos declarada por FK) —
  // nos quedamos con la más reciente si hubiera más de una para la misma cita.
  return data.map((c) => ({
    ...c,
    notaClinica: Array.isArray(c.notaClinica) && c.notaClinica.length > 0
      ? c.notaClinica[c.notaClinica.length - 1]
      : null,
  }))
}

/** Todos los signos_vitales de los pacientes dados, para correlacionar por fecha en el cliente. */
export async function obtenerSignosVitalesPorPacientes(pacienteIds) {
  if (pacienteIds.length === 0) return []
  const { data, error } = await supabase
    .from('signos_vitales')
    .select('paciente_id, registrado_en, presion_arterial, presion_sistolica, presion_diastolica, peso, estatura, temperatura, frecuencia_cardiaca')
    .in('paciente_id', pacienteIds)
    .order('registrado_en', { ascending: true })
  if (error) throw error
  return data
}

/** El registro de signos vitales más reciente en o antes de `fechaLimite` para un paciente, si existe. */
export function signosVitalesMasCercanos(todosLosSignos, pacienteId, fechaLimite) {
  const limite = new Date(fechaLimite).getTime()
  let mejor = null
  for (const sv of todosLosSignos) {
    if (sv.paciente_id !== pacienteId) continue
    const t = new Date(sv.registrado_en).getTime()
    if (t <= limite && (!mejor || t > new Date(mejor.registrado_en).getTime())) mejor = sv
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
