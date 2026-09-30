import { useCallback, useEffect, useState } from 'react'
import { useConexion } from './useConexion'
import { listarOperacionesPendientes, operacionEsDe } from '../lib/colaOffline'
import { useAuthStore } from '../store/useAuthStore'
import { procesarColaOffline } from '../lib/procesadorColaOffline'
import { verificarConexionReal } from '../lib/conectividadReal'
import { supabase } from '../lib/supabase'

// Expone el desglose real de la cola (pendientes/sincronizando/error),
// no solo un número — para el indicador global (sección 14) y para
// poder reintentar manualmente sin esperar a que se recupere la
// conexión sola.
export function useColaOffline() {
  const conectado = useConexion()
  const userId = useAuthStore((s) => s.perfil?.id)
  const [operaciones, setOperaciones] = useState([])
  const [sincronizandoActivo, setSincronizandoActivo] = useState(false)

  const actualizar = useCallback(async () => {
    try {
      // Solo las de esta persona: los cambios pendientes de otra cuenta
      // en el mismo equipo no son suyos ni puede subirlos.
      const lista = await listarOperacionesPendientes()
      setOperaciones(lista.filter((op) => operacionEsDe(op, userId)))
    } catch {
      // IndexedDB puede fallar en modo privado de algunos navegadores
      // — no es crítico, solo significa que el panel se queda vacío.
    }
  }, [userId])

  const sincronizarAhora = useCallback(async () => {
    setSincronizandoActivo(true)
    try {
      await procesarColaOffline()
    } finally {
      setSincronizandoActivo(false)
      await actualizar()
    }
  }, [actualizar])

  useEffect(() => { actualizar() }, [actualizar])

  // La sincronización automática (secciones "no depender de
  // navigator.onLine") no arranca solo porque el navegador reporte
  // `online` — eso puede ser una wifi sin salida real a internet, y
  // lanzar la subida ahí solo generaría un error de sesión confuso.
  // Se confirma primero contra el propio servidor.
  useEffect(() => {
    if (!conectado) return
    let cancelado = false
    verificarConexionReal(supabase).then((real) => {
      if (real && !cancelado) sincronizarAhora()
    })
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectado])

  const errores = operaciones.filter((o) => o.estado === 'error')
  const pendientes = operaciones.length - errores.length

  return {
    operaciones,
    pendientes,
    errores,
    totalPendientes: operaciones.length,
    sincronizando: sincronizandoActivo,
    conectado,
    sincronizarAhora
  }
}
