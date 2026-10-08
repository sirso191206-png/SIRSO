import { supabase } from '../lib/supabase'
import { obtenerMiClinica } from './clinicas'

async function contar(tabla) {
  const { count, error } = await supabase.from(tabla).select('id', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

// Lo que hace falta para saber qué pasos de la guía ya están hechos. Todo sale de la base de la clínica del usuario
// (RLS): el conteo es de SU clínica, nunca de otra.
export async function obtenerDatosOnboarding(clinicaId) {
  const [clinica, pacientes, citas] = await Promise.all([obtenerMiClinica(clinicaId), contar('pacientes'), contar('citas')])
  return { clinica, totales: { pacientes, citas } }
}
