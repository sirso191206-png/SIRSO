import { useCallback, useEffect, useState } from 'react'
import {
  obtenerListaEspera,
  agregarListaEspera,
  marcarAtendidoListaEspera
} from '../services/listaEspera'

export function useListaEspera() {
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    const data = await obtenerListaEspera()
    setLista(data)
    setCargando(false)
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  const agregar = async (registro) => {
    await agregarListaEspera(registro)
    await recargar()
  }

  const marcarAtendido = async (id) => {
    await marcarAtendidoListaEspera(id)
    await recargar()
  }

  return { lista, cargando, agregar, marcarAtendido }
}
