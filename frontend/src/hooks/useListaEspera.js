import { useCallback, useEffect, useState } from 'react'
import {
  obtenerListaEspera,
  agregarListaEspera,
  marcarAtendidoListaEspera
} from '../services/listaEspera'
import { encolarOperacion } from '../lib/colaOffline'
import { actualizarCacheDeLectura } from '../lib/cacheLectura'
import { useAuthStore } from '../store/useAuthStore'
import { useSucursalStore } from '../store/useSucursalStore'

export function useListaEspera() {
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    const data = await obtenerListaEspera()
    setLista(data)
    setCargando(false)
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  const agregar = async (registro) => {
    if (!navigator.onLine) {
      // Id generado en el navegador, upsert-safe — mismo patrón que
      // pacientes/citas/tratamientos: reintentar nunca duplica.
      const id = crypto.randomUUID()
      const registroCompleto = { ...registro, id, atendido: false, creado_en: new Date().toISOString() }
      const perfil = useAuthStore.getState().perfil
      await encolarOperacion({
        id,
        tipo: 'crear_lista_espera',
        entidad: 'lista_espera',
        entidadId: id,
        payload: registroCompleto,
        dependeDe: [],
        creado_en: Date.now(),
        usuarioId: perfil?.id ?? null,
        clinicaId: perfil?.clinica_id ?? null,
        sucursalId: useSucursalStore.getState().sucursalActualId,
        claveIdempotencia: id
      })
      // obtenerListaEspera() SÍ está cacheado — se actualiza esa misma
      // caché con el registro optimista para que cualquier recarga
      // (esta pantalla u otra) lo vea de inmediato, sin esperar a subir.
      const listaActual = await obtenerListaEspera()
      await actualizarCacheDeLectura('lista-espera', [...listaActual, { ...registroCompleto, _pendiente: true }])
      await recargar()
      return
    }
    await agregarListaEspera(registro)
    await recargar()
  }

  const marcarAtendido = async (id) => {
    if (!navigator.onLine) {
      const idOp = crypto.randomUUID()
      const perfil = useAuthStore.getState().perfil
      await encolarOperacion({
        id: idOp,
        tipo: 'marcar_atendido_lista_espera',
        entidad: 'lista_espera',
        entidadId: id,
        payload: { id },
        dependeDe: [],
        creado_en: Date.now(),
        usuarioId: perfil?.id ?? null,
        clinicaId: perfil?.clinica_id ?? null,
        sucursalId: useSucursalStore.getState().sucursalActualId,
        claveIdempotencia: idOp
      })
      // obtenerListaEspera() solo trae atendido:false — se quita de la
      // caché a mano para que desaparezca de la vista de inmediato.
      const listaActual = await obtenerListaEspera()
      await actualizarCacheDeLectura('lista-espera', listaActual.filter((r) => r.id !== id))
      await recargar()
      return
    }
    await marcarAtendidoListaEspera(id)
    await recargar()
  }

  return { lista, cargando, agregar, marcarAtendido }
}
