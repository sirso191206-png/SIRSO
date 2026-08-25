import { supabase } from '../lib/supabase'

// El join en vivo también trae rfc/escuela_procedencia — antes solo
// traía nombre/cedula_profesional, así que una receta VIEJA (de antes
// de que existiera el snapshot) no tenía ningún respaldo posible para
// esos dos campos, rompiendo la simetría que sí existía para
// nombre/cédula. Ver imprimirReceta.js (datosProfesionalParaImprimir)
// para cómo se usa este respaldo.
const SELECT_CON_DENTISTA = '*, dentista:usuarios(nombre, cedula_profesional, rfc, escuela_procedencia)'

export async function obtenerRecetas(pacienteId) {
  const { data, error } = await supabase
    .from('recetas')
    .select(SELECT_CON_DENTISTA)
    .eq('paciente_id', pacienteId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export async function crearReceta(receta) {
  const { data, error } = await supabase
    .from('recetas')
    .insert(receta)
    .select(SELECT_CON_DENTISTA)
    .single()
  if (error) throw error
  return data
}
