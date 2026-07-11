import { useCallback, useEffect, useState } from 'react'
import {
  obtenerHorariosBloqueados,
  crearHorarioBloqueado,
  eliminarHorarioBloqueado
} from '../services/horariosBloqueados'

export function useHorariosBloqueados({ desde, hasta }) {
  const [bloqueos, setBloqueos] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    const data = await obtenerHorariosBloqueados({ desde, hasta })
    setBloqueos(data)
    setCargando(false)
  }, [desde, hasta])

  useEffect(() => {
    recargar()
  }, [recargar])

  const agregar = async (bloqueo) => {
    await crearHorarioBloqueado(bloqueo)
    await recargar()
  }

  const eliminar = async (id) => {
    await eliminarHorarioBloqueado(id)
    await recargar()
  }

  return { bloqueos, cargando, agregar, eliminar }
}
