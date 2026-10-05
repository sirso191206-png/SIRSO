import { useEffect } from 'react'
import { useConexion } from './useConexion'
import { useFuncionalidad } from './useFuncionalidad'
import { useAuthStore } from '../store/useAuthStore'
import { syncClinica } from '../lib/clinicDataSync'

// Mantiene la réplica local de la LISTA DE PACIENTES de toda la
// clínica al día — a diferencia de usePrecargaAutomaticaDelDia (que
// solo cubre el día de hoy), esto hace que cualquier paciente de la
// clínica se pueda buscar y abrir sin conexión, se haya visto antes o
// no (ver lib/clinicDataSync.js). Se dispara en los mismos dos
// momentos que el resto de la sincronización automática (abrir SIRO
// ya conectado, recuperar la conexión) — a diferencia de la precarga
// del día, no se limita a una vez por día: al ser incremental
// (lib/clinicDataSync.js solo pide lo modificado desde el cursor
// guardado), repetirla en cada reconexión es barato y mantiene la
// lista más al corriente.
export function useSincronizacionClinica() {
  const conectado = useConexion()
  const perfil = useAuthStore((s) => s.perfil)
  // Depende de la funcionalidad "sincronizacion" del plan (solo las réplicas de
  // lectura; la cola de cambios pendientes se sube siempre).
  const sincronizacionIncluida = useFuncionalidad('sincronizacion')

  useEffect(() => {
    if (!conectado || !perfil || !sincronizacionIncluida) return
    // No hay estado local que limpiar al desmontar — syncClinica()
    // solo escribe en IndexedDB, nunca en el estado de este hook.
    syncClinica().catch(() => {
      // Silencioso a propósito, igual que la precarga del día: es
      // conveniencia de fondo, no algo que la persona pidió.
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectado, perfil?.id, sincronizacionIncluida])
}
