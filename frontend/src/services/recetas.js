import { supabase } from '../lib/supabase'
import { conCacheDeLectura } from '../lib/cacheLectura'

// El join en vivo también trae rfc/escuela_procedencia — antes solo
// traía nombre/cedula_profesional, así que una receta VIEJA (de antes
// de que existiera el snapshot) no tenía ningún respaldo posible para
// esos dos campos, rompiendo la simetría que sí existía para
// nombre/cédula. Ver imprimirReceta.js (datosProfesionalParaImprimir)
// para cómo se usa este respaldo.
const SELECT_CON_DENTISTA = '*, dentista:usuarios(nombre, cedula_profesional, rfc, escuela_procedencia)'

export async function obtenerRecetas(pacienteId) {
  const { datos } = await conCacheDeLectura(`recetas:${pacienteId}`, async () => {
    const { data, error } = await supabase
      .from('recetas')
      .select(SELECT_CON_DENTISTA)
      .eq('paciente_id', pacienteId)
      .order('creado_en', { ascending: false })
    if (error) throw error
    return data
  })
  return datos
}

// Si receta.id viene definido (lo genera el navegador con
// crypto.randomUUID() para las recetas creadas sin conexión), se usa
// upsert en vez de insert — reintentar la subida después de un fallo
// parcial nunca duplica la receta.
export async function crearReceta(receta) {
  const { data, error } = await supabase
    .from('recetas')
    .upsert(receta)
    .select(SELECT_CON_DENTISTA)
    .single()
  if (error) throw error
  return data
}
