import { useCallback, useEffect, useState } from 'react'
import {
  obtenerExpediente,
  obtenerNotasClinicas,
  crearNotaClinica,
  actualizarExpediente
} from '../services/expedientes'

export function useExpediente(pacienteId) {
  const [expediente, setExpediente] = useState(null)
  const [notas, setNotas] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    const exp = await obtenerExpediente(pacienteId)
    const listaNotas = await obtenerNotasClinicas(exp.id)
    setExpediente(exp)
    setNotas(listaNotas)
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    if (pacienteId) recargar()
  }, [pacienteId, recargar])

  const agregarNota = async (nota) => {
    await crearNotaClinica({ ...nota, expediente_id: expediente.id })
    await recargar()
  }

  const guardarAntecedentes = async (cambios) => {
    await actualizarExpediente(expediente.id, cambios)
    await recargar()
  }

  return { expediente, notas, cargando, agregarNota, guardarAntecedentes, recargar }
}
