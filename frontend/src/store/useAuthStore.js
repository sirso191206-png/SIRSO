import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAuthStore = create((set, get) => ({
  session: null,
  perfil: null, // fila de la tabla `usuarios`: nombre, rol, clinica_id
  clinicaNombre: null,
  clinicaEstado: null, // 'activa' | 'suspendida' — para bloquear acceso
  cargando: true,

  // Se llama una vez al montar la app
  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      await get().cargarPerfil(session)
    } else {
      set({ session: null, perfil: null, clinicaNombre: null, clinicaEstado: null, cargando: false })
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        get().cargarPerfil(session)
      } else {
        set({ session: null, perfil: null, clinicaNombre: null, clinicaEstado: null, cargando: false })
      }
    })
  },

  cargarPerfil: async (session) => {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', session.user.id)
      .single()

    if (error) {
      console.error('Error cargando perfil de usuario:', error.message)
    }

    set({ session, perfil: data ?? null, cargando: false })

    // Nombre de la clínica: se carga aparte para no bloquear el login
    // si por lo que sea tarda o falla.
    if (data?.clinica_id) {
      const { data: clinica } = await supabase
        .from('clinicas')
        .select('nombre, estado')
        .eq('id', data.clinica_id)
        .single()
      set({
        clinicaNombre: clinica?.nombre ?? null,
        clinicaEstado: clinica?.estado ?? null
      })
    }
  },

  login: async (correo, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: correo,
      password
    })
    if (error) throw error
    await get().cargarPerfil(data.session)
    return data
  },

  cambiarPassword: async (nuevaPassword) => {
    const { error } = await supabase.auth.updateUser({ password: nuevaPassword })
    if (error) throw error
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ session: null, perfil: null, clinicaNombre: null, clinicaEstado: null })
  },

  // Helpers de permisos usados en toda la UI
  tieneRol: (...roles) => roles.includes(get().perfil?.rol),
  esClinico: () => ['owner', 'dentista'].includes(get().perfil?.rol)
}))
