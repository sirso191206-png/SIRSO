import { useCallback, useEffect, useState } from 'react'
import {
  obtenerExpediente,
  obtenerNotasClinicas,
  crearNotaClinica,
  actualizarExpediente
} from '../services/expedientes'
import { encolarOperacion, listarOperacionesPendientes } from '../lib/colaOffline'
import { useAuthStore } from '../store/useAuthStore'
import { useSucursalStore } from '../store/useSucursalStore'

export function useExpediente(pacienteId) {
  const [expediente, setExpediente] = useState(null)
  const [notas, setNotas] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    const exp = await obtenerExpediente(pacienteId)
    const listaNotas = await obtenerNotasClinicas(exp.id)
    // Las notas creadas sin conexión y que todavía no se subieron no
    // existen aún en el servidor — se agregan encima para que no
    // desaparezcan de la vista mientras la cola termina de subirlas.
    const pendientes = await listarOperacionesPendientes().catch(() => [])
    const notasPendientes = pendientes
      .filter((op) => op.tipo === 'crear_nota_clinica' && op.payload.expediente_id === exp.id)
      .map((op) => ({ ...op.payload, _pendiente: true }))
    setExpediente(exp)
    setNotas([...notasPendientes, ...listaNotas])
    setCargando(false)
  }, [pacienteId])

  useEffect(() => {
    if (pacienteId) recargar()
  }, [pacienteId, recargar])

  const agregarNota = async (nota) => {
    if (!navigator.onLine) {
      // Sin conexión: se genera el id aquí mismo (no lo asigna la base
      // de datos) y se encola — al reconectar, procesarColaOffline() la
      // sube usando ese mismo id, así que reintentar nunca duplica.
      const id = crypto.randomUUID()
      const notaCompleta = { ...nota, expediente_id: expediente.id, id, creado_en: new Date().toISOString() }
      const perfil = useAuthStore.getState().perfil
      await encolarOperacion({
        id,
        tipo: 'crear_nota_clinica',
        entidad: 'notas_clinicas',
        entidadId: id,
        payload: notaCompleta,
        creado_en: Date.now(),
        usuarioId: perfil?.id ?? null,
        clinicaId: perfil?.clinica_id ?? null,
        sucursalId: useSucursalStore.getState().sucursalActualId,
        claveIdempotencia: id
      })
      await recargar()
      return
    }
    await crearNotaClinica({ ...nota, expediente_id: expediente.id })
    await recargar()
  }

  const guardarAntecedentes = async (cambios) => {
    try {
      await actualizarExpediente(expediente.id, cambios, expediente.actualizado_en)
    } catch (err) {
      // Si alguien más ya lo modificó, se recarga igual — así quien
      // vuelva a intentar guardar ya parte de los datos frescos, no de
      // los que tenía abiertos cuando ocurrió el conflicto.
      await recargar()
      throw err
    }
    await recargar()
  }

  return { expediente, notas, cargando, agregarNota, guardarAntecedentes, recargar }
}
