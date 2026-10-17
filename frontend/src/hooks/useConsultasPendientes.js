import { useCallback, useEffect, useState } from 'react'
import { listarConsultasSinNota } from '../services/consultas'

// Citas ya COMPLETADAS que no tienen nota clínica (p. ej. se completaron antes de que la regla "solo se completa finalizando la
// consulta" existiera). La función del servidor (fn_consultas_sin_nota) ya aplica roles, plan, clínica y sucursal: para quien no
// puede completar notas devuelve una lista vacía. Sin conexión o ante un error NO se inventa una lista: se queda vacía y se
// expone el error (la consulta pendiente sigue existiendo; solo no se muestra hasta poder comprobarla).
export function useConsultasPendientes(dias = 30, habilitado = true) {
  const [pendientes, setPendientes] = useState([])
  const [cargando, setCargando] = useState(habilitado)
  const [error, setError] = useState(null)

  const recargar = useCallback(async () => {
    if (!habilitado) { setPendientes([]); setCargando(false); return }
    setCargando(true)
    try {
      setPendientes(await listarConsultasSinNota(dias))
      setError(null)
    } catch (err) {
      setPendientes([])
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }, [dias, habilitado])

  useEffect(() => { recargar() }, [recargar])
  return { pendientes, cargando, error, recargar }
}
