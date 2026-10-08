import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { obtenerEstadoMiSesion } from '../services/sesiones'
import { programarRevisiones } from '../lib/revisionPeriodica'

export const REVISION_SESION_MS = 60 * 1000

// Revisa si ESTA sesión sigue siendo válida en el servidor (auth.sessions, migración 078): la
// pudieron cerrar desde otro dispositivo, o salir sobrante por el límite del plan. Si ya no vale
// llama a `onCerrada(motivo, limite)`. Un fallo de red NUNCA cierra nada: SIRO trabaja sin
// conexión, y sin red no se puede saber. Devuelve true si se cerró.
export async function revisarSesion(onCerrada, obtener = obtenerEstadoMiSesion) {
  try {
    const estado = await obtener()
    if (estado?.valida === false) {
      onCerrada(estado.motivo, estado.limite)
      return true
    }
  } catch {
    // Sin red, o la función aún no existe en la base: no se toca la sesión.
  }
  return false
}

// Dos vías, cualquiera cierra la sesión local de inmediato:
//  1) Consulta del estado real cada minuto, al volver a la pestaña y al recuperar la conexión.
//     Es la que cubre el caso importante: un dispositivo que estaba sin conexión cuando lo
//     cerraron se entera apenas vuelve. Con el interruptor de la base encendido, además, su token
//     ya no lee ni escribe nada hasta ese momento.
//  2) Realtime sobre el registro `sesiones_usuario` (aviso más rápido cuando el límite se aplica).
export function useEscucharCierreSesion(sesionActualId, onSesionCerradaRemota) {
  useEffect(() => {
    if (!sesionActualId) return undefined

    let enCurso = false
    const intentar = async () => {
      if (enCurso) return
      enCurso = true
      try {
        await revisarSesion(onSesionCerradaRemota)
      } finally {
        enCurso = false
      }
    }
    intentar()
    const detener = programarRevisiones(intentar, { intervaloMs: REVISION_SESION_MS })
    window.addEventListener('online', intentar)

    const canal = supabase
      .channel(`sesion-${sesionActualId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sesiones_usuario', filter: `id=eq.${sesionActualId}` },
        (payload) => {
          if (payload.new?.finalizada_en) onSesionCerradaRemota('excedida')
        }
      )
      .subscribe()

    return () => {
      detener()
      window.removeEventListener('online', intentar)
      supabase.removeChannel(canal)
    }
  }, [sesionActualId, onSesionCerradaRemota])
}
