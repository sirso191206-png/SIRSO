import { useCallback, useEffect, useState } from 'react'
import { obtenerConsentimientos, crearConsentimiento, revocarConsentimiento } from '../services/consentimientos'

export function useConsentimientos(pacienteId) {
  const [consentimientos, setConsentimientos] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    const data = await obtenerConsentimientos(pacienteId)
    setConsentimientos(data)
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    if (pacienteId) recargar()
  }, [pacienteId, recargar])

  const agregar = async (consentimiento) => {
    const nuevo = await crearConsentimiento({ ...consentimiento, paciente_id: pacienteId })
    await recargar()
    return nuevo
  }

  const revocar = async (id, datos) => {
    const actualizado = await revocarConsentimiento(id, datos)
    await recargar()
    return actualizado
  }

  return { consentimientos, cargando, agregar, revocar }
}
