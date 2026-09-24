import { supabase } from '../lib/supabase'

// Eventos de LECTURA/ACCESO — distintos de los eventos de escritura
// (crear/editar/eliminar), que ya se auditan solos vía triggers en la
// base de datos. Estos SÍ hay que registrarlos explícitamente desde
// donde ocurren, porque un SELECT nunca dispara un trigger.
//
// usuario_id se llena solo (default auth.uid() en la base) — nunca se
// manda aquí, así nadie puede registrar un evento a nombre de otra
// persona ni por accidente ni a propósito.
//
// Nunca lanza si falla: un evento de auditoría que no se pudo guardar
// no debe romper la pantalla que el usuario está viendo en ese
// momento — se registra el error en consola y se sigue.
export async function registrarEvento(accion, { entidad, entidadId, clinicaId, detalle } = {}) {
  try {
    const { error } = await supabase.from('auditoria').insert({
      accion,
      entidad: entidad ?? null,
      entidad_id: entidadId ?? null,
      clinica_id: clinicaId ?? null,
      detalle: detalle ?? null
    })
    if (error) console.error('No se pudo registrar el evento de auditoría:', accion, error.message)
  } catch (err) {
    console.error('No se pudo registrar el evento de auditoría:', accion, err.message)
  }
}
