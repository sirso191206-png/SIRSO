import { useCallback, useEffect, useState } from 'react'
import { listarUsuarios, crearUsuario, cambiarActivoUsuario, actualizarUsuario, eliminarUsuario } from '../services/usuarios'
import { useAuthStore } from '../store/useAuthStore'

export function useUsuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    const data = await listarUsuarios()
    setUsuarios(data)
    setCargando(false)
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  const crear = async (datos) => {
    // Si el correo ya es de alguien de este equipo se dice tal cual (el servidor responde con un mensaje genérico a
    // propósito, para no revelar si un correo existe en OTRA clínica).
    const correo = String(datos?.correo ?? '').trim().toLowerCase()
    const existente = usuarios.find((u) => String(u.correo ?? '').toLowerCase() === correo)
    if (existente) {
      const propio = existente.id === useAuthStore.getState().perfil?.id
      throw new Error(propio ? 'Ese es tu propio correo: ya tienes una cuenta.' : `Ese correo ya es de ${existente.nombre}, que ya forma parte de tu equipo.`)
    }
    const resultado = await crearUsuario(datos)
    await recargar()
    return resultado
  }

  const actualizar = async (id, datos) => {
    await actualizarUsuario(id, datos)
    await recargar()
  }

  const cambiarActivo = async (id, activo) => {
    await cambiarActivoUsuario(id, activo)
    await recargar()
  }

  const eliminar = async (id) => {
    await eliminarUsuario(id)
    await recargar()
  }

  return { usuarios, cargando, crear, actualizar, cambiarActivo, eliminar }
}
