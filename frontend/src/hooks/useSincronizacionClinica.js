import { useEffect } from 'react'
import { useConexion } from './useConexion'
import { useFuncionalidad } from './useFuncionalidad'
import { useAuthStore } from '../store/useAuthStore'
import { syncClinica } from '../lib/clinicDataSync'
import { programarRevisiones } from '../lib/revisionPeriodica'

export const REVISION_REPLICA_MS = 10 * 60 * 1000

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
    if (!conectado || !perfil || !sincronizacionIncluida) return undefined
    // syncClinica() solo escribe en IndexedDB y tiene su propio candado contra corridas
    // simultáneas: repetirla es barato (pacientes incrementales) y mantiene la lista y la
    // agenda de la clínica al día sin que nadie lo pida. Se repite cada REVISION_REPLICA_MS y
    // al volver a la pestaña, además de al abrir SIRO y al recuperar la conexión.
    const intentar = () => {
      syncClinica().catch(() => {
        // Silencioso a propósito: es conveniencia de fondo; la siguiente revisión reintenta.
      })
    }
    intentar()
    return programarRevisiones(intentar, { intervaloMs: REVISION_REPLICA_MS })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectado, perfil?.id, sincronizacionIncluida])
}
