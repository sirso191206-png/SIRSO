import { useEffect } from 'react'
import { useConexion } from './useConexion'
import { useFuncionalidad } from './useFuncionalidad'
import { useAuthStore } from '../store/useAuthStore'
import { useSucursalStore } from '../store/useSucursalStore'
import { verificarConexionReal } from '../lib/conectividadReal'
import { programarRevisiones } from '../lib/revisionPeriodica'
import { supabase } from '../lib/supabase'
import { sincronizarMiDia, obtenerUltimaSincronizacion } from '../services/sincronizacionDia'

// Cuánto dura "al día" lo precargado, y cada cuánto se revisa si hace falta renovarlo.
export const PRECARGA_VIGENCIA_MS = 30 * 60 * 1000
export const REVISION_PRECARGA_MS = 5 * 60 * 1000

export function esHoy(iso) {
  if (!iso) return false
  const d = new Date(iso)
  const ahora = new Date()
  return d.getFullYear() === ahora.getFullYear() && d.getMonth() === ahora.getMonth() && d.getDate() === ahora.getDate()
}

// ¿Lo precargado sigue sirviendo? Sí solo si es de HOY, de ESTA sucursal y de hace menos de
// PRECARGA_VIGENCIA_MS. Nunca antes de la primera vez, ni al cruzar la medianoche, ni al
// cambiar de sucursal, ni si el reloj quedó en el futuro.
export function precargaVigente(ultima, sucursalId, ahora = Date.now()) {
  if (!ultima?.sincronizadoEn || !esHoy(ultima.sincronizadoEn)) return false
  if ((ultima.sucursalId ?? null) !== (sucursalId ?? null)) return false
  const edad = ahora - new Date(ultima.sincronizadoEn).getTime()
  return edad >= 0 && edad < PRECARGA_VIGENCIA_MS
}

// Deja listos Mi día, la Agenda del día, los pacientes de hoy con su expediente/odontograma/etc.
// para trabajar sin internet — usando el mismo `sincronizarMiDia` de siempre. Nadie lo pide:
// se dispara sola (ver el hook). Devuelve qué pasó; NUNCA lanza (es de fondo y no debe
// alarmar). Si falla no se marca como hecha, así la siguiente revisión lo vuelve a intentar.
export async function precargarSiHaceFalta({ perfil, sucursalId }) {
  if (!(await verificarConexionReal(supabase))) return 'sin_conexion'
  const ultima = await obtenerUltimaSincronizacion().catch(() => null)
  if (precargaVigente(ultima, sucursalId)) return 'vigente'
  const dentistaId = perfil.rol === 'dentista' ? perfil.id : undefined
  try {
    await sincronizarMiDia({ dentistaId, perfil, sucursalId })
    return 'hecha'
  } catch {
    return 'fallo'
  }
}

// Se monta una vez (Sidebar). Mientras haya sesión y conexión: precarga al abrir SIRO y al
// recuperar la conexión, y la mantiene al día — al volver a la pestaña, al cambiar de
// sucursal y cada REVISION_PRECARGA_MS (eso cubre también el cambio de día con SIRO abierto y
// los reintentos tras un fallo). Así, cuando el internet se va a media jornada, lo de hoy ya
// está guardado y reciente. Depende de la funcionalidad "sincronizacion" del plan; subir los
// cambios pendientes (la cola) NUNCA se apaga por plan: sería perder datos.
export function usePrecargaAutomaticaDelDia() {
  const conectado = useConexion()
  const perfil = useAuthStore((s) => s.perfil)
  const sincronizacionIncluida = useFuncionalidad('sincronizacion')

  useEffect(() => {
    if (!conectado || !perfil || !sincronizacionIncluida) return undefined
    let cancelado = false
    let enCurso = false
    const intentar = async () => {
      if (cancelado || enCurso) return
      enCurso = true
      try {
        await precargarSiHaceFalta({ perfil, sucursalId: useSucursalStore.getState().sucursalActualId || undefined })
      } finally {
        enCurso = false
      }
    }
    intentar()
    const detener = programarRevisiones(intentar, { intervaloMs: REVISION_PRECARGA_MS })
    const dejarDeVerSucursal = useSucursalStore.subscribe((estado, previo) => {
      if (estado.sucursalActualId !== previo.sucursalActualId) intentar()
    })
    return () => {
      cancelado = true
      detener()
      dejarDeVerSucursal()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectado, perfil?.id, sincronizacionIncluida])
}
