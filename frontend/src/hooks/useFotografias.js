import { useCallback, useEffect, useState } from 'react'
import { obtenerFotografias, subirFotografia } from '../services/fotografias'

export function useFotografias(pacienteId) {
  const [fotos, setFotos] = useState([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [cargandoMas, setCargandoMas] = useState(false)

  const cargarInicial = useCallback(async () => {
    setCargando(true)
    const { fotos: data, total: totalRegistros } = await obtenerFotografias(pacienteId, { desde: 0 })
    setFotos(data)
    setTotal(totalRegistros)
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    if (pacienteId) cargarInicial()
  }, [pacienteId, cargarInicial])

  const cargarMas = async () => {
    setCargandoMas(true)
    try {
      const { fotos: data } = await obtenerFotografias(pacienteId, { desde: fotos.length })
      setFotos((actuales) => [...actuales, ...data])
    } finally {
      setCargandoMas(false)
    }
  }

  const subir = async ({ archivo, etiqueta, tratamientoId, usuarioId }) => {
    await subirFotografia({ pacienteId, archivo, etiqueta, tratamientoId, usuarioId })
    await cargarInicial() // vuelve a empezar desde la primera página, incluye la nueva
  }

  return { fotos, total, hayMas: fotos.length < total, cargando, cargandoMas, cargarMas, subir }
}
