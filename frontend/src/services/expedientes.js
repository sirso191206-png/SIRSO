import { supabase } from '../lib/supabase'
import { conCacheDeLectura } from '../lib/cacheLectura'

export async function obtenerExpediente(pacienteId) {
  const { datos } = await conCacheDeLectura(`expediente:${pacienteId}`, async () => {
    const { data, error } = await supabase
      .from('expedientes')
      .select('*')
      .eq('paciente_id', pacienteId)
      .single()
    if (error) throw error
    return data
  })
  return datos
}

// actualizado_en ya no la pone el frontend a mano — la mantiene un
// trigger (migración 071), que es quien realmente decide cuándo se
// modificó, no el reloj del navegador de quien guarda. Si se pasa
// actualizadoEnEsperado, se agrega como condición extra del UPDATE (no
// reemplaza RLS, se suma a ella): si alguien más ya modificó este
// expediente desde que se abrió el formulario, la condición no
// encuentra ninguna fila, y .single() lanza PGRST116 en vez de guardar
// encima de datos ya desactualizados.
export async function actualizarExpediente(expedienteId, cambios, actualizadoEnEsperado) {
  let query = supabase.from('expedientes').update(cambios).eq('id', expedienteId)
  if (actualizadoEnEsperado) {
    query = query.eq('actualizado_en', actualizadoEnEsperado)
  }
  const { data, error } = await query.select().single()
  if (error) {
    if (error.code === 'PGRST116' && actualizadoEnEsperado) {
      throw new Error('CONFLICTO_CONCURRENCIA')
    }
    throw error
  }
  return data
}

export async function obtenerNotasClinicas(expedienteId) {
  const { datos } = await conCacheDeLectura(`notas_clinicas:${expedienteId}`, () => _obtenerNotasClinicasReal(expedienteId))
  return datos
}

async function _obtenerNotasClinicasReal(expedienteId) {
  const { data, error } = await supabase
    .from('notas_clinicas')
    .select('*, usuario:usuarios(nombre)')
    .eq('expediente_id', expedienteId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

// Si `nota.id` viene definido (lo genera el navegador con
// crypto.randomUUID() para las notas creadas sin conexión), se usa
// upsert en vez de insert — así, si la subida se reintenta después de
// un fallo parcial (la escritura sí llegó pero la respuesta se perdió
// por la red), no se crea una nota duplicada.
export async function crearNotaClinica(nota) {
  // nota: { id?, expediente_id, usuario_id, contenido, tipo }
  const { data, error } = await supabase
    .from('notas_clinicas')
    .upsert(nota)
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
// Sin parámetro de clínica porque RLS ya lo acota solo — una sola
// clave de caché por usuario/navegador es suficiente, dado que nunca
// va a ver los diagnósticos de una clínica que no es la suya.
export async function obtenerDiagnosticosFrecuentes() {
  const { datos } = await conCacheDeLectura('diagnosticos_frecuentes', async () => {
    const { data, error } = await supabase
      .from('notas_clinicas')
      .select('diagnostico')
      .not('diagnostico', 'is', null)
      .limit(200)
    if (error) throw error
    return [...new Set(data.map((d) => d.diagnostico).filter(Boolean))].slice(0, 20)
  })
  return datos
}
