import { supabase } from '../lib/supabase'

// Todas las asignaciones de la clínica, con los nombres ya resueltos —
// para mostrar en una pantalla de administración sin pedir uno por uno.
export async function listarAsignaciones() {
  const { data, error } = await supabase
    .from('asistente_dentista_asignaciones')
    .select('id, asistente:usuarios!asistente_dentista_asignaciones_asistente_id_fkey(id, nombre), dentista:usuarios!asistente_dentista_asignaciones_dentista_id_fkey(id, nombre)')
    .order('creado_en')
  if (error) throw error
  return data
}

export async function asignarAsistenteADentista(asistenteId, dentistaId, clinicaId) {
  const { data, error } = await supabase
    .from('asistente_dentista_asignaciones')
    .insert({ asistente_id: asistenteId, dentista_id: dentistaId, clinica_id: clinicaId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function quitarAsignacion(id) {
  const { error } = await supabase.from('asistente_dentista_asignaciones').delete().eq('id', id)
  if (error) throw error
}
