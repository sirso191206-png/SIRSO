import { supabase } from '../lib/supabase'

export async function obtenerHorariosBloqueados({ desde, hasta }) {
  const { data, error } = await supabase
    .from('horarios_bloqueados')
    .select('*, dentista:usuarios!horarios_bloqueados_dentista_id_fkey(nombre)')
    .gte('fin', desde)
    .lte('inicio', hasta)
    .order('inicio')
  if (error) throw error
  return data
}

export async function crearHorarioBloqueado(bloqueo) {
  const { data, error } = await supabase
    .from('horarios_bloqueados')
    .insert(bloqueo)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function eliminarHorarioBloqueado(id) {
  const { error } = await supabase.from('horarios_bloqueados').delete().eq('id', id)
  if (error) throw error
}
