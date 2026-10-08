import { useEffect, useState } from 'react'
import * as dash from '../services/dashboard'
import { mesesDelPeriodo, validarRango } from '../lib/reportes'

// Series de las gráficas, que dependen de los filtros. Se vuelven a pedir cuando un filtro cambia; un rango
// personalizado inválido NO consulta nada y devuelve el motivo. Los datos salen de la base de la clínica
// (RLS): los filtros solo acotan, nunca amplían.
export function useReportesSeries(filtros, { puedeVerFinanzas }) {
  const [series, setSeries] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const errorRango = filtros.periodo === 'rango' ? (validarRango(filtros.desde, filtros.hasta).ok ? null : validarRango(filtros.desde, filtros.hasta).mensaje) : null

  useEffect(() => {
    if (errorRango) { setCargando(false); return undefined }
    let activo = true
    setCargando(true)
    setError(null)
    const meses = mesesDelPeriodo(filtros.periodo, { desde: filtros.desde, hasta: filtros.hasta })
    const tareas = {
      citasPorSemana: dash.obtenerCitasPorSemana({ semanas: filtros.semanas, dentistaId: filtros.dentistaId || undefined, sucursalId: filtros.sucursalId || undefined }),
      citasDelMes: dash.obtenerCitasDelMes({ dentistaId: filtros.dentistaId || undefined, sucursalId: filtros.sucursalId || undefined }),
      tratamientosMasRealizados: dash.obtenerTratamientosMasRealizados({ periodo: filtros.periodoRanking, estado: filtros.estadoTratamiento || undefined, dentistaId: filtros.dentistaId || undefined }),
      pacientesNuevosPorMes: dash.obtenerPacientesNuevosPorMes({ meses })
    }
    if (puedeVerFinanzas) tareas.ingresosPorMes = dash.obtenerIngresosPorMes({ meses, sucursalId: filtros.sucursalId || undefined })
    const claves = Object.keys(tareas)
    Promise.all(Object.values(tareas))
      .then((r) => { if (activo) setSeries(Object.fromEntries(claves.map((k, i) => [k, r[i]]))) })
      .catch((err) => { if (activo) { setError('No se pudieron cargar las gráficas. Intenta de nuevo.'); console.error(err) } })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [filtros.periodo, filtros.desde, filtros.hasta, filtros.semanas, filtros.dentistaId, filtros.sucursalId, filtros.periodoRanking, filtros.estadoTratamiento, puedeVerFinanzas, errorRango])

  return { series, cargando, error, errorRango }
}
