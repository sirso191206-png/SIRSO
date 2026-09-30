import { useEffect, useRef, useState } from 'react'
import { useConexion } from './useConexion'
import { useColaOffline } from './useColaOffline'
import { supabase } from '../lib/supabase'
import { verificarConexionReal } from '../lib/conectividadReal'

// Combina la señal del navegador con la cola offline en un solo
// estado para el banner/indicador (secciones 13-14):
//   OFFLINE       — el navegador dice que no hay red
//   RECONNECTING  — el navegador dice que ya hay red, pero todavía se
//                   está confirmando que Supabase responde de verdad
//                   (navigator.onLine puede decir "conectado" en una
//                   red sin salida real a internet)
//   SYNC_ERROR    — hay operaciones que ya se intentaron subir y
//                   fallaron (no son solo "pendientes", necesitan
//                   atención)
//   SYNCING       — la cola se está subiendo en este momento
//   SYNC_PENDING  — hay cambios en la cola, esperando a subir
//   ONLINE        — todo al día
export function useEstadoConexion() {
  const conectadoNavegador = useConexion()
  const cola = useColaOffline()
  const [verificando, setVerificando] = useState(false)
  const eraOfflineRef = useRef(!conectadoNavegador)

  useEffect(() => {
    const veniaDeOffline = eraOfflineRef.current
    eraOfflineRef.current = !conectadoNavegador

    // Solo se verifica de verdad contra Supabase al RECUPERAR la señal
    // (transición sin-conexión -> con-conexión) — no en cada montaje
    // de la app ni mientras ya se sabía que había red.
    if (!conectadoNavegador || !veniaDeOffline) return

    let cancelado = false
    setVerificando(true)
    verificarConexionReal(supabase).finally(() => { if (!cancelado) setVerificando(false) })
    return () => { cancelado = true }
  }, [conectadoNavegador])

  let estado = 'ONLINE'
  if (!conectadoNavegador) estado = 'OFFLINE'
  else if (verificando) estado = 'RECONNECTING'
  else if (cola.errores.length > 0) estado = 'SYNC_ERROR'
  else if (cola.sincronizando) estado = 'SYNCING'
  else if (cola.totalPendientes > 0) estado = 'SYNC_PENDING'

  return { estado, ...cola }
}
