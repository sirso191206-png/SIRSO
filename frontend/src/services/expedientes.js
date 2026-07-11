import { supabase } from '../lib/supabase'

export async function obtenerExpediente(pacienteId) {
  const { data, error } = await supabase
    .from('expedientes')
    .select('*')
    .eq('paciente_id', pacienteId)
    .single()
  if (error) throw error
  return data
}

export async function actualizarExpediente(expedienteId, cambios) {
  const { data, error } = await supabase
    .from('expedientes')
    .update({ ...cambios, actualizado_en: new Date().toISOString() })
    .eq('id', expedienteId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function obtenerNotasClinicas(expedienteId) {
  const { data, error } = await supabase
    .from('notas_clinicas')
    .select('*, usuario:usuarios(nombre)')
    .eq('expediente_id', expedienteId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export async function crearNotaClinica(nota) {
  // nota: { expediente_id, usuario_id, contenido, tipo }
  const { data, error } = await supabase
    .from('notas_clinicas')
    .insert(nota)
    .select()
    .single()
  if (error) throw error
  return data
}

// "Editar" = crear una nota nueva enlazada a la anterior (append-only real:
// la tabla tiene revocado UPDATE/DELETE a nivel de BD). El flag `editado`
// de la nota anterior lo pone automáticamente un trigger en la BD.
export async function corregirNotaClinica(notaAnteriorId, notaNueva) {
  const { data, error } = await supabase
    .from('notas_clinicas')
    .insert({ ...notaNueva, version_anterior_id: notaAnteriorId })
    .select()
    .single()
  if (error) throw error
  return data
}

// Diagnósticos que ya se han escrito antes en esta clínica, para
// autocompletar en la consulta unificada (datalist, no una tabla nueva).
export async function obtenerDiagnosticosFrecuentes() {
  const { data, error } = await supabase
    .from('notas_clinicas')
    .select('diagnostico')
    .not('diagnostico', 'is', null)
    .limit(200)
  if (error) throw error
  return [...new Set(data.map((d) => d.diagnostico).filter(Boolean))].slice(0, 20)
}
