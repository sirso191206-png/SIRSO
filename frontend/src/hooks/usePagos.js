import { useCallback, useEffect, useState } from 'react'
import { obtenerPagos, registrarPago } from '../services/pagos'
import { obtenerSaldo } from '../services/pacientes'

export function usePagos(pacienteId) {
  const [pagos, setPagos] = useState([])
  const [saldo, setSaldo] = useState({ total_tratamientos: 0, total_pagado: 0, saldo: 0 })
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    const [listaPagos, saldoActual] = await Promise.all([
      obtenerPagos(pacienteId),
      obtenerSaldo(pacienteId)
    ])
    setPagos(listaPagos)
    setSaldo(saldoActual)
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    if (pacienteId) recargar()
  }, [pacienteId, recargar])

  const agregar = async (pago) => {
    await registrarPago({ ...pago, paciente_id: pacienteId })
    await recargar()
  }

  return { pagos, saldo, cargando, agregar }
}
