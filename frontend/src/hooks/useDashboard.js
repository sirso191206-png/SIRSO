import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { inicioDeHoy, finDeHoy, inicioDeMesActual, finDeMesActual } from '../lib/fechas'
import * as dash from '../services/dashboard'

const ROLES_FINANZAS = ['owner', 'recepcion']

export function useDashboard() {
  const perfil = useAuthStore((s) => s.perfil)
  const puedeVerFinanzas = ROLES_FINANZAS.includes(perfil?.rol)
  const esOwner = perfil?.rol === 'owner'

  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!perfil) return
    let activo = true
    setCargando(true)
    setError(null)

    const tareas = {
      citasHoy: dash.obtenerCitasHoy(),
      proximasCitas: dash.obtenerProximasCitas(),
      citasSinConfirmar: dash.obtenerCitasSinConfirmar(),
      tratamientosPendientes: dash.obtenerTratamientosPendientes(),
      tratamientosActivos: dash.contarTratamientosActivos(),
      pacientesAtendidosHoy: dash.contarPacientesAtendidosHoy(),
      pacientesEnEspera: dash.contarPacientesEnEspera(),
      citasPendientesConfirmar: dash.contarCitasPendientesConfirmar(),
      citasPorSemana: dash.obtenerCitasPorSemana(),
      citasCompletadasCanceladas: dash.obtenerCitasCompletadasCanceladas(),
      tratamientosMasRealizados: dash.obtenerTratamientosMasRealizados(),
      pacientesNuevosPorMes: dash.obtenerPacientesNuevosPorMes()
    }

    if (puedeVerFinanzas) {
      tareas.ingresosHoy = dash.obtenerIngresos(inicioDeHoy(), finDeHoy())
      tareas.ingresosMes = dash.obtenerIngresos(inicioDeMesActual(), finDeMesActual())
      tareas.pagosRecientes = dash.obtenerPagosRecientes()
      tareas.pacientesConSaldo = dash.obtenerPacientesConSaldo()
      tareas.saldosPendientes = dash.sumaSaldosPendientes()
      tareas.ingresosPorMes = dash.obtenerIngresosPorMes()
    }

    if (esOwner) {
      tareas.actividadReciente = dash.obtenerActividadReciente()
    }

    const claves = Object.keys(tareas)
    Promise.all(Object.values(tareas))
      .then((resultados) => {
        if (!activo) return
        const obj = {}
        claves.forEach((k, i) => { obj[k] = resultados[i] })
        setDatos(obj)
      })
      .catch((err) => { if (activo) setError(err.message) })
      .finally(() => { if (activo) setCargando(false) })

    return () => { activo = false }
  }, [perfil, puedeVerFinanzas, esOwner])

  return { datos, cargando, error, puedeVerFinanzas, esOwner }
}
