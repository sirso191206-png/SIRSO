import { supabase } from '../lib/supabase'

export async function obtenerListaEspera() {
  const { data, error } = await supabase
    .from('lista_espera')
    .select('*, paciente:pacientes(nombre_completo, telefono), dentista:usuarios!lista_espera_dentista_id_fkey(nombre)')
    .eq('atendido', false)
    .order('creado_en')
  if (error) throw error
  return data
}

export async function agregarListaEspera(registro) {
  const { data, error } = await supabase
    .from('lista_espera')
    .insert(registro)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function marcarAtendidoListaEspera(id) {
  const { error } = await supabase
    .from('lista_espera')
    .update({ atendido: true })
    .eq('id', id)
  if (error) throw error
}
