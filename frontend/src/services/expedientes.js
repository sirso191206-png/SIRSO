import { supabase } from '../lib/supabase'
import { conCacheDeLectura, actualizarCacheDeLectura } from '../lib/cacheLectura'
import { encolarOperacion } from '../lib/colaOffline'
import { verificarConexionReal } from '../lib/conectividadReal'
import { obtenerExpedienteDeReplica } from '../lib/expedientesReplica'
import { ErrorDeDatos, clasificarErrorDeDatos } from '../lib/erroresDatos'
import { haySesionVigente } from './sesionVigente'

export async function obtenerExpediente(pacienteId) {
  try {
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
  } catch (err) {
    // Sin red y este expediente nunca se abrió antes en este equipo:
    // si ya está en la réplica ligera de la clínica
    // (lib/expedientesReplica.js, lib/clinicDataSync.js), se usan esos
    // datos — alergias, enfermedades, medicamentos, antecedentes
    // familiares — aunque notas, odontograma, tratamientos y recetas
    // sigan sin estar disponibles hasta tener internet. `_soloBasico`
    // avisa de esa diferencia, igual que obtenerPaciente().
    const basico = await obtenerExpedienteDeReplica(pacienteId).catch(() => null)
    if (basico) return { ...basico, _soloBasico: true }
    throw err
  }
}

// actualizado_en ya no la pone el frontend a mano — la mantiene un
// trigger (migración 071), que es quien realmente decide cuándo se
// modificó, no el reloj del navegador de quien guarda. Si se pasa
// actualizadoEnEsperado, se agrega como condición extra del UPDATE (no
// reemplaza RLS, se suma a ella): si alguien más ya modificó este
// expediente desde que se abrió el formulario, la condición no
// encuentra ninguna fila, y .single() lanza PGRST116 en vez de guardar
// encima de datos ya desactualizados.
export async function actualizarExpedienteEnServidor(expedienteId, cambios, actualizadoEnEsperado) {
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

// El ejecutor de la cola llama a actualizarExpedienteEnServidor()
// directo — esta versión exportada es la que usa la pantalla de
// antecedentes, y decide sola si hay que encolar. `pacienteId` es
// solo para poder actualizar la caché de lectura optimista (la
// caché de expediente se guarda por paciente, no por expediente_id).
export async function actualizarExpediente(expedienteId, cambios, actualizadoEnEsperado, pacienteId, { usuarioId, clinicaId, sucursalId } = {}) {
  const conexionReal = await verificarConexionReal(supabase)
  if (!conexionReal) {
    const id_op = `actualizar_expediente_${expedienteId}`
    await encolarOperacion({
      id: id_op,
      tipo: 'actualizar_expediente',
      entidad: 'expedientes',
      entidadId: expedienteId,
      payload: { expedienteId, cambios, actualizadoEnEsperado },
      creado_en: Date.now(),
      usuarioId: usuarioId ?? null,
      clinicaId: clinicaId ?? null,
      sucursalId: sucursalId ?? null,
      claveIdempotencia: id_op
    })
    if (pacienteId) {
      // obtenerExpediente ya hace su propia caída a caché si no hay
      // red — no hace falta envolverla otra vez aquí.
      const actual = await obtenerExpediente(pacienteId)
      const optimista = { ...actual, ...cambios, _pendiente: true }
      await actualizarCacheDeLectura(`expediente:${pacienteId}`, optimista)
      return optimista
    }
    return { id: expedienteId, ...cambios, _pendiente: true }
  }
  return actualizarExpedienteEnServidor(expedienteId, cambios, actualizadoEnEsperado)
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
// Las notas clínicas son INMUTABLES a propósito (la migración 001 revoca UPDATE y DELETE a `authenticated`), así que se crean con
// INSERT. Antes era un upsert, que genera `ON CONFLICT DO UPDATE` y exige el privilegio UPDATE: fallaba SIEMPRE con
// "permission denied for table notas_clinicas". Idempotencia: si el id ya existe (un reintento de algo que sí se guardó), se
// devuelve la nota ya guardada — sin duplicar y sin reescribirla.
//
// Por qué NO `upsert(..., { ignoreDuplicates: true })` (ON CONFLICT DO NOTHING, que solo exige INSERT): ante un id repetido
// PostgREST responde 201 con `[]` — sin error y sin filas —, y responde EXACTAMENTE igual si el id es de una nota AJENA que no se
// puede ver. Un `[]` no prueba que la nota quedó guardada. Con INSERT simple el id repetido da un 409 `23505` explícito y se
// VERIFICA leyendo la nota por id (verificar_postgrest.mjs lo comprueba contra un PostgREST real).
//   · primer intento → INSERT; se devuelve la fila creada (nunca se declara éxito sin ella)
//   · id ya existente → se lee la nota por id: si es la MISMA (mismo expediente, cita y contenido) es un reintento de algo que sí
//     se guardó y se devuelve `{ ..., yaExistia: true }`; si es otra → NOTA_CONFLICTO; si no se puede ver → NOTA_NO_VERIFICABLE
//   · permisos, sesión vencida, red → error con su causa; JAMÁS un éxito
export async function crearNotaClinica(nota) {
  // nota: { id?, expediente_id, usuario_id, contenido, tipo }
  const { data, error } = await supabase
    .from('notas_clinicas')
    .insert(nota)
    .select()
    .single()
  if (!error) {
    if (!data) throw new ErrorDeDatos('NOTA_NO_CONFIRMADA', 'No se pudo confirmar que la nota quedó guardada. Revisa el expediente antes de volver a intentarlo.')
    return data
  }
  if (error.code === '23505' && nota?.id) return confirmarNotaExistente(nota)
  throw clasificarErrorDeDatos(error, { haySesion: await haySesionVigente(), entidad: 'la nota' })
}

async function confirmarNotaExistente(nota) {
  const { data: existente, error } = await supabase.from('notas_clinicas').select('id, expediente_id, cita_id, contenido, tipo').eq('id', nota.id).maybeSingle()
  if (error) throw clasificarErrorDeDatos(error, { haySesion: await haySesionVigente(), entidad: 'la nota' }) // no se pudo verificar: error real
  if (!existente) {
    throw new ErrorDeDatos('NOTA_NO_VERIFICABLE', 'No se pudo confirmar que la nota se guardó: ese identificador ya existe pero no puedes ver el registro. No se guardó nada nuevo.')
  }
  const igual = existente.expediente_id === nota.expediente_id && existente.contenido === nota.contenido
    && (nota.tipo == null || existente.tipo === nota.tipo) && (nota.cita_id == null || existente.cita_id === nota.cita_id)
  if (!igual) {
    throw new ErrorDeDatos('NOTA_CONFLICTO', 'Ya existe una nota con ese identificador y contenido distinto. No se sobrescribió: las notas clínicas no se modifican. Guarda esta como una nota nueva.')
  }
  return { ...existente, yaExistia: true }
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
