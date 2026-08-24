import { create } from 'zustand'
import { supabase } from '../lib/supabase'

async function extraerMensajeError(error) {
  try {
    if (error?.context && typeof error.context.json === 'function') {
      const cuerpo = await error.context.json()
      if (cuerpo?.error) return cuerpo.error
    }
  } catch {
    // si no se pudo leer el cuerpo, cae al mensaje genérico de abajo
  }
  return error?.message ?? 'Ocurrió un error inesperado.'
}

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
    // Se pasa por una Edge Function (en vez de supabase.auth.updateUser
    // directo) para que una clínica suspendida no pueda cambiar su
    // contraseña saltándose el estado — ver cambiar-password/index.ts.
    const { data, error } = await supabase.functions.invoke('cambiar-password', {
      body: { password: nuevaPassword }
    })
    if (error) throw new Error(await extraerMensajeError(error))
    if (data?.error) throw new Error(data.error)
  },

  // Vuelve a traer la fila de `usuarios` del usuario actual — para que
  // el sidebar/UI reflejen de inmediato un cambio de perfil (ej. datos
  // profesionales) sin tener que cerrar sesión y volver a entrar.
  recargarPerfil: async () => {
    const session = get().session
    if (session) await get().cargarPerfil(session)
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ session: null, perfil: null, clinicaNombre: null, clinicaEstado: null })
  },

  // Se llama en cada navegación (ver ProtectedRoute) para que, si el
  // super admin suspende la clínica mientras alguien ya tiene la sesión
  // abierta, se entere sin esperar a que refresque manualmente la
  // página. Es una consulta liviana; la protección real (RLS +
  // Edge Functions) no depende de esto.
  refrescarEstadoClinica: async () => {
    const clinicaId = get().perfil?.clinica_id
    if (!clinicaId) return
    const { data: clinica } = await supabase
      .from('clinicas')
      .select('estado')
      .eq('id', clinicaId)
      .single()
    if (clinica?.estado) set({ clinicaEstado: clinica.estado })
  },

  // Helpers de permisos usados en toda la UI
  tieneRol: (...roles) => roles.includes(get().perfil?.rol),
  esClinico: () => ['owner', 'dentista'].includes(get().perfil?.rol)
}))
