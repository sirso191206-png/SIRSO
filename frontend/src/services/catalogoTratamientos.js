import { supabase } from '../lib/supabase'

export async function obtenerCatalogo({ soloActivos = true } = {}) {
  let query = supabase.from('catalogo_tratamientos').select('*').order('categoria').order('nombre')
  if (soloActivos) query = query.eq('activo', true)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function crearItemCatalogo(item) {
  const { data, error } = await supabase.from('catalogo_tratamientos').insert(item).select().single()
  if (error) throw error
  return data
}

export async function actualizarItemCatalogo(id, cambios) {
  const { data, error } = await supabase.from('catalogo_tratamientos').update(cambios).eq('id', id).select().single()
  if (error) throw error
  return data
}
