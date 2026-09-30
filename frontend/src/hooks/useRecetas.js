import { useCallback, useEffect, useState } from 'react'
import { obtenerRecetas, crearReceta } from '../services/recetas'
import { encolarOperacion, listarOperacionesPendientes } from '../lib/colaOffline'
import { esIdOffline } from '../lib/mapeoIdsOffline'
import { useAuthStore } from '../store/useAuthStore'
import { useSucursalStore } from '../store/useSucursalStore'

// La receta ya toma todo lo que necesita (nombre, cédula, firma) del
// propio perfil al momento de crearla — perfil que ya se cachea
// aparte (cacheAuth.js) — así que crear una receta sin conexión no
// depende de ningún catálogo ni consulta adicional.
export function useRecetas(pacienteId) {
  const [recetas, setRecetas] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)

    if (esIdOffline(pacienteId)) {
      // Un paciente que todavía no existe en el servidor no puede
      // tener recetas reales que pedirle — solo las que ya se
      // encolaron para él.
      const pendientes = await listarOperacionesPendientes().catch(() => [])
      const recetasPendientes = pendientes
        .filter((op) => op.tipo === 'crear_receta' && op.payload.paciente_id === pacienteId)
        .map((op) => ({ ...op.payload, estado_sync: op.estado === 'error' ? 'ERROR_SYNC' : 'PENDIENTE_SYNC' }))
      setRecetas(recetasPendientes)
      setCargando(false)
      return
    }

    const data = await obtenerRecetas(pacienteId)
    // Recetas creadas sin conexión y todavía no subidas: se agregan
    // encima para que no desaparezcan de la vista, marcadas según el
    // estado real de su operación en la cola (PENDIENTE_SYNC mientras
    // espera, ERROR_SYNC si ya se intentó y chocó con algo).
    const pendientes = await listarOperacionesPendientes().catch(() => [])
    const recetasPendientes = pendientes
      .filter((op) => op.tipo === 'crear_receta' && op.payload.paciente_id === pacienteId)
      .map((op) => ({
        ...op.payload,
        estado_sync: op.estado === 'error' ? 'ERROR_SYNC' : 'PENDIENTE_SYNC'
      }))
    setRecetas([...recetasPendientes, ...data])
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    if (pacienteId) recargar()
  }, [pacienteId, recargar])

  const agregar = async (receta) => {
    // Un paciente offline SIEMPRE se encola, incluso si en este
    // instante hay internet — su fila todavía no existe en el
    // servidor, así que crearla ahí directo fallaría de cualquier forma.
    if (!navigator.onLine || esIdOffline(pacienteId)) {
      // Mismo patrón que las notas clínicas: id generado en el
      // navegador, upsert-safe — reintentar la subida nunca duplica.
      const id = crypto.randomUUID()
      const recetaCompleta = { ...receta, id, paciente_id: pacienteId, creado_en: new Date().toISOString() }
      const perfil = useAuthStore.getState().perfil
      await encolarOperacion({
        id,
        tipo: 'crear_receta',
        entidad: 'recetas',
        entidadId: id,
        payload: recetaCompleta,
        dependeDe: esIdOffline(pacienteId) ? [pacienteId] : [],
        creado_en: Date.now(),
        usuarioId: perfil?.id ?? null,
        clinicaId: perfil?.clinica_id ?? null,
        sucursalId: useSucursalStore.getState().sucursalActualId,
        claveIdempotencia: id
      })
      await recargar()
      return { ...recetaCompleta, estado_sync: 'PENDIENTE_SYNC' }
    }
    const nueva = await crearReceta({ ...receta, paciente_id: pacienteId })
    await recargar()
    return { ...nueva, estado_sync: 'SINCRONIZADA' }
  }

  return { recetas, cargando, agregar }
}
