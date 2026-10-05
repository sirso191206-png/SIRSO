import { useEffect } from 'react'
import { useConexion } from './useConexion'
import { useFuncionalidad } from './useFuncionalidad'
import { useAuthStore } from '../store/useAuthStore'
import { useSucursalStore } from '../store/useSucursalStore'
import { verificarConexionReal } from '../lib/conectividadReal'
import { supabase } from '../lib/supabase'
import { sincronizarMiDia, obtenerUltimaSincronizacion } from '../services/sincronizacionDia'

export function esHoy(iso) {
  if (!iso) return false
  const d = new Date(iso)
  const ahora = new Date()
  return d.getFullYear() === ahora.getFullYear() && d.getMonth() === ahora.getMonth() && d.getDate() === ahora.getDate()
}

// "Sincronizar mi día" (lib/sincronizacionDia.js) ya hace exactamente
// lo que se necesita para trabajar offline sin pensarlo: precarga Mi
// día, la Agenda del día, horarios bloqueados, lista de espera y
// dentistas. Lo único que le faltaba era no requerir un clic manual.
// Este hook NO reimplementa nada de esa lógica — solo la dispara sola,
// una vez por día, cuando hay sesión y conexión real confirmada (al
// abrir SIRO ya conectado, o al recuperar la conexión). El botón
// "Sincronizar ahora" sigue disponible como respaldo manual — para
// forzarlo de nuevo el mismo día, o si esto falla silenciosamente.
export function usePrecargaAutomaticaDelDia() {
  const conectado = useConexion()
  const perfil = useAuthStore((s) => s.perfil)
  // Las réplicas locales dependen de la funcionalidad "sincronizacion" del plan.
  // Subir los cambios pendientes (la cola) NUNCA se apaga por plan: sería perder datos.
  const sincronizacionIncluida = useFuncionalidad('sincronizacion')

  useEffect(() => {
    if (!conectado || !perfil || !sincronizacionIncluida) return
    let cancelado = false

    verificarConexionReal(supabase).then(async (real) => {
      if (!real || cancelado) return
      const ultima = await obtenerUltimaSincronizacion().catch(() => null)
      if (esHoy(ultima?.sincronizadoEn)) return // ya se precargó hoy, no repetir en cada reconexión

      const dentistaId = perfil.rol === 'dentista' ? perfil.id : undefined
      const sucursalId = useSucursalStore.getState().sucursalActualId || undefined
      try {
        await sincronizarMiDia({ dentistaId, perfil, sucursalId })
      } catch {
        // Silencioso a propósito: es una precarga de conveniencia, no
        // una acción que la persona pidió — un fallo aquí no debe
        // interrumpir ni alarmar. El botón manual sigue ahí si hace falta.
      }
    })

    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectado, perfil?.id, sincronizacionIncluida])
}
