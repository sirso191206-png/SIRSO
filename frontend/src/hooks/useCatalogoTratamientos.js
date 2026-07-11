import { useCallback, useEffect, useState } from 'react'
import { obtenerCatalogo, crearItemCatalogo, actualizarItemCatalogo } from '../services/catalogoTratamientos'

export function useCatalogoTratamientos({ soloActivos = true } = {}) {
  const [catalogo, setCatalogo] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    const data = await obtenerCatalogo({ soloActivos })
    setCatalogo(data)
    setCargando(false)
  }, [soloActivos])

  useEffect(() => {
    recargar()
  }, [recargar])

  const agregar = async (item) => {
    await crearItemCatalogo(item)
    await recargar()
  }

  const actualizar = async (id, cambios) => {
    await actualizarItemCatalogo(id, cambios)
    await recargar()
  }

  return { catalogo, cargando, agregar, actualizar }
}
