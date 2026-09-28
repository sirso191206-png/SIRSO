import { useCallback, useEffect, useState } from 'react'
import { useConexion } from './useConexion'
import { listarOperacionesPendientes } from '../lib/colaOffline'
import { procesarColaOffline } from '../lib/procesadorColaOffline'

// Expone el desglose real de la cola (pendientes/sincronizando/error),
// no solo un número — para el indicador global (sección 14) y para
// poder reintentar manualmente sin esperar a que se recupere la
// conexión sola.
export function useColaOffline() {
  const conectado = useConexion()
  const [operaciones, setOperaciones] = useState([])
  const [sincronizandoActivo, setSincronizandoActivo] = useState(false)

  const actualizar = useCallback(async () => {
    try {
      const lista = await listarOperacionesPendientes()
      setOperaciones(lista)
    } catch {
      // IndexedDB puede fallar en modo privado de algunos navegadores
      // — no es crítico, solo significa que el panel se queda vacío.
    }
  }, [])

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

  useEffect(() => {
    if (conectado) sincronizarAhora()
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
