import { useCallback, useEffect, useState } from 'react'
import { useConexion } from './useConexion'
import { listarOperacionesPendientes } from '../lib/colaOffline'
import { procesarColaOffline } from '../lib/procesadorColaOffline'

export function useColaOffline() {
  const conectado = useConexion()
  const [pendientes, setPendientes] = useState(0)

  const actualizarConteo = useCallback(async () => {
    try {
      const lista = await listarOperacionesPendientes()
      setPendientes(lista.length)
    } catch {
      // IndexedDB puede fallar en modo privado de algunos navegadores
      // — no es crítico, solo significa que el contador se queda en 0.
    }
  }, [])

  useEffect(() => { actualizarConteo() }, [actualizarConteo])

  useEffect(() => {
    if (conectado) {
      procesarColaOffline().then(actualizarConteo)
    }
  }, [conectado, actualizarConteo])

  return { pendientes, conectado }
}
