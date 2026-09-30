import { supabase } from '../lib/supabase'
import { conCacheDeLectura } from '../lib/cacheLectura'

// Los bloqueos forman parte de "qué horarios están libres": una agenda
// sin conexión que muestre las citas pero NO los bloqueos parecería tener
// espacio donde no lo hay. Por eso se guardan igual que las citas.
export async function obtenerHorariosBloqueados({ desde, hasta }) {
  const { datos } = await conCacheDeLectura(`horarios-bloqueados:${JSON.stringify({ desde, hasta })}`, async () => {
    const { data, error } = await supabase
      .from('horarios_bloqueados')
      .select('*, dentista:usuarios!horarios_bloqueados_dentista_id_fkey(nombre)')
      .gte('fin', desde)
      .lte('inicio', hasta)
      .order('inicio')
    if (error) throw error
    return data
  })
  return datos
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
