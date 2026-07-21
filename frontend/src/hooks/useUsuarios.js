import { useCallback, useEffect, useState } from 'react'
import { listarUsuarios, crearUsuario, cambiarActivoUsuario, actualizarUsuario, eliminarUsuario } from '../services/usuarios'

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
