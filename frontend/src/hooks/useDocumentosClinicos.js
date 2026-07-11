import { useCallback, useEffect, useState } from 'react'
import { obtenerDocumentos, subirDocumento } from '../services/documentosClinicos'

export function useDocumentosClinicos(pacienteId) {
  const [documentos, setDocumentos] = useState([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [cargandoMas, setCargandoMas] = useState(false)

  const cargarInicial = useCallback(async () => {
    setCargando(true)
    const { documentos: data, total: totalRegistros } = await obtenerDocumentos(pacienteId, { desde: 0 })
    setDocumentos(data)
    setTotal(totalRegistros)
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    if (pacienteId) cargarInicial()
  }, [pacienteId, cargarInicial])

  const cargarMas = async () => {
    setCargandoMas(true)
    try {
      const { documentos: data } = await obtenerDocumentos(pacienteId, { desde: documentos.length })
      setDocumentos((actuales) => [...actuales, ...data])
    } finally {
      setCargandoMas(false)
    }
  }

  const subir = async (datos) => {
    await subirDocumento({ ...datos, pacienteId })
    await cargarInicial()
  }

  return { documentos, total, hayMas: documentos.length < total, cargando, cargandoMas, cargarMas, subir }
}
