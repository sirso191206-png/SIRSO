import { useCallback, useEffect, useRef, useState } from 'react'
import {
  obtenerExpediente,
  obtenerNotasClinicas,
  crearNotaClinica,
  actualizarExpediente
} from '../services/expedientes'
import { encolarOperacion, listarOperacionesPendientes } from '../lib/colaOffline'
import { esIdOffline } from '../lib/mapeoIdsOffline'
import { useAuthStore } from '../store/useAuthStore'
import { useSucursalStore } from '../store/useSucursalStore'
import { esCeroFilas } from '../lib/erroresDatos'

// Un paciente creado SIN conexión todavía no tiene expediente real —
// lo crea un trigger en el servidor en cuanto el paciente se sube (ver
// lib/procesadorColaOffline.js). Antes de eso no hay `expediente.id`
// que pedirle a Supabase, así que se usa uno local de solo lectura y
// las notas pendientes se filtran por el id del PACIENTE offline, no
// por un expediente que todavía no existe.
function expedienteLocalProvisional(pacienteId) {
  return { id: null, paciente_id: pacienteId, alergias: [], enfermedades: [], _offline: true }
}

export function useExpediente(pacienteId) {
  const [expediente, setExpediente] = useState(null)
  const [notas, setNotas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  // Guardados en fila y con la versión (actualizado_en) más reciente: dos cambios seguidos (una alergia y enseguida una
  // enfermedad) mandaban la misma versión vieja y el segundo se rechazaba como si «otra persona» hubiera modificado el
  // expediente, perdiendo el dato.
  const colaGuardado = useRef(Promise.resolve())
  const versionActual = useRef(null)
  useEffect(() => { versionActual.current = expediente?.actualizado_en ?? null }, [expediente])

  const recargar = useCallback(async () => {
    setCargando(true)

    if (esIdOffline(pacienteId)) {
      const pendientes = await listarOperacionesPendientes().catch(() => [])
      const notasPendientes = pendientes
        .filter((op) => op.tipo === 'crear_nota_clinica' && op.payload.pacienteIdOffline === pacienteId)
        .map((op) => ({ ...op.payload, _pendiente: true }))
      setExpediente(expedienteLocalProvisional(pacienteId))
      setNotas(notasPendientes)
      setCargando(false)
      return
    }

    // H27: para un rol sin acceso clínico (recepción) RLS oculta el expediente y la lectura devuelve «0 filas» (PGRST116): eso NO es
    // un fallo, simplemente no hay expediente visible. Cualquier otro error se expone en `error` (no se oculta) y la carga termina;
    // antes el rechazo quedaba sin capturar y `cargando` nunca volvía a false.
    let exp, listaNotas
    try {
      exp = await obtenerExpediente(pacienteId)
      listaNotas = await obtenerNotasClinicas(exp.id)
    } catch (err) {
      setExpediente(null)
      setNotas([])
      setError(esCeroFilas(err) ? null : err)
      setCargando(false)
      return
    }
    setError(null)
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
    const perfil = useAuthStore.getState().perfil
    const id = crypto.randomUUID()

    if (esIdOffline(pacienteId)) {
      // El expediente de este paciente no existe todavía en ningún
      // lado — ni local ni en el servidor. La nota se encola apuntando
      // al PACIENTE offline (`pacienteIdOffline`, no `expediente_id`) y
      // depende de que ese paciente termine de subirse primero
      // (`dependeDe`); recién entonces el procesador de la cola busca
      // el expediente real y completa `expediente_id` por sí solo.
      const notaCompleta = { ...nota, pacienteIdOffline: pacienteId, id, creado_en: new Date().toISOString() }
      await encolarOperacion({
        id,
        tipo: 'crear_nota_clinica',
        entidad: 'notas_clinicas',
        entidadId: id,
        payload: notaCompleta,
        dependeDe: [pacienteId],
        creado_en: Date.now(),
        usuarioId: perfil?.id ?? null,
        clinicaId: perfil?.clinica_id ?? null,
        sucursalId: useSucursalStore.getState().sucursalActualId,
        claveIdempotencia: id
      })
      await recargar()
      return
    }

    if (!navigator.onLine) {
      // Sin conexión: se genera el id aquí mismo (no lo asigna la base
      // de datos) y se encola — al reconectar, procesarColaOffline() la
      // sube usando ese mismo id, así que reintentar nunca duplica.
      const notaCompleta = { ...nota, expediente_id: expediente.id, id, creado_en: new Date().toISOString() }
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

  const guardarAntecedentes = (cambios) => {
    const tarea = colaGuardado.current.then(() => guardarAntecedentesAhora(cambios))
    colaGuardado.current = tarea.catch(() => {})
    return tarea
  }

  const guardarAntecedentesAhora = async (cambios) => {
    if (esIdOffline(pacienteId)) {
      // Los antecedentes viven en el expediente, que todavía no existe
      // — no hay dónde guardarlos hasta que el paciente se sincronice.
      throw new Error('Este paciente todavía no se ha sincronizado. Los antecedentes se podrán editar en cuanto vuelva la conexión.')
    }
    try {
      const perfil = useAuthStore.getState().perfil
      const guardado = await actualizarExpediente(expediente.id, cambios, versionActual.current ?? expediente.actualizado_en, pacienteId, {
        usuarioId: perfil?.id,
        clinicaId: perfil?.clinica_id,
        sucursalId: useSucursalStore.getState().sucursalActualId
      })
      if (guardado?.actualizado_en && !guardado._pendiente) versionActual.current = guardado.actualizado_en
    } catch (err) {
      // Si alguien más ya lo modificó, se recarga igual — así quien
      // vuelva a intentar guardar ya parte de los datos frescos, no de
      // los que tenía abiertos cuando ocurrió el conflicto.
      await recargar()
      throw err
    }
    await recargar()
  }

  return { expediente, notas, cargando, error, agregarNota, guardarAntecedentes, recargar }
}
