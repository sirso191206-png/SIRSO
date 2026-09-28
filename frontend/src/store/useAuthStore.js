import { create } from 'zustand'
import { supabase, invocarFuncionAutenticada } from '../lib/supabase'
import { registrarSesion, marcarSesionFinalizada } from '../services/sesiones'
import { guardarPerfilOffline, leerPerfilOffline } from '../lib/cacheAuth'

export const useAuthStore = create((set, get) => ({
  session: null,
  perfil: null, // fila de la tabla `usuarios`: nombre, rol, clinica_id
  clinicaNombre: null,
  clinicaEstado: null, // 'activa' | 'suspendida' — para bloquear acceso
  cargando: true,
  sesionActualId: null,
  // 'online': el último intento de cargar el perfil sí habló con
  // Supabase. 'offline': se está usando el perfil guardado localmente
  // porque Supabase no respondió — la sesión sigue siendo válida (el
  // token la maneja Supabase Auth por su cuenta), pero el perfil que
  // se ve podría no reflejar un cambio muy reciente (p. ej. un cambio
  // de rol) hasta que vuelva la conexión.
  connectionStatus: 'online',

  // Se llama una vez al montar la app
  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      await get().cargarPerfil(session)
      // Sin esto, un dispositivo que reabre la app con una sesión YA
      // existente (restaurada automáticamente, sin volver a escribir
      // la contraseña) nunca obtiene un sesionActualId — y sin eso,
      // "Cerrar todas mis sesiones" no tiene forma de avisarle a ESE
      // dispositivo en particular que debe cerrar sesión: quedaría
      // fuera del listado de sesiones y fuera del mecanismo de cierre
      // remoto por completo, aunque el usuario sí siga con acceso ahí.
      const sesion = await registrarSesion(session.user.id)
      set({ sesionActualId: sesion?.id ?? null })
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
    let data = null
    let fallaDeRed = false
    try {
      const respuesta = await supabase.from('usuarios').select('*').eq('id', session.user.id).single()
      if (respuesta.error) throw respuesta.error
      data = respuesta.data
    } catch (error) {
      console.error('Error cargando perfil de usuario:', error.message)
      fallaDeRed = true
    }

    if (!fallaDeRed) {
      // Se pudo hablar con Supabase — este es el camino normal. Se
      // guarda una copia local del perfil, para el día que SÍ haga
      // falta el respaldo offline.
      set({ session, perfil: data ?? null, connectionStatus: 'online', cargando: false })

      let clinicaNombre = null
      let clinicaEstado = null
      if (data?.clinica_id) {
        const { data: clinica } = await supabase
          .from('clinicas')
          .select('nombre, estado')
          .eq('id', data.clinica_id)
          .single()
        clinicaNombre = clinica?.nombre ?? null
        clinicaEstado = clinica?.estado ?? null
        set({ clinicaNombre, clinicaEstado })
      }

      if (data) {
        guardarPerfilOffline({ userId: session.user.id, perfil: data, clinicaNombre, clinicaEstado })
      }
      return
    }

    // Supabase no respondió — antes de rendirse (perfil en null,
    // como si la sesión no existiera), se busca un perfil guardado de
    // una sincronización anterior. La sesión en sí (el token) la
    // sigue manejando Supabase Auth por su cuenta; esto solo evita que
    // la UI se quede sin saber quién eres ni qué rol tienes.
    const guardado = await leerPerfilOffline(session.user.id)
    if (guardado) {
      set({
        session,
        perfil: guardado.perfil,
        clinicaNombre: guardado.clinicaNombre,
        clinicaEstado: guardado.clinicaEstado,
        connectionStatus: 'offline',
        cargando: false
      })
    } else {
      // Ni Supabase respondió, ni hay nada guardado (o ya expiró, más
      // de 24 horas) — aquí sí no queda otra que pedir reconectar.
      set({ session, perfil: null, connectionStatus: 'offline', cargando: false })
    }
  },

  login: async (correo, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: correo,
      password
    })
    if (error) throw error
    await get().cargarPerfil(data.session)
    const sesion = await registrarSesion(data.session.user.id)
    set({ sesionActualId: sesion?.id ?? null })
    return data
  },

  cambiarPassword: async (nuevaPassword) => {
    // Se pasa por una Edge Function (en vez de supabase.auth.updateUser
    // directo) para que una clínica suspendida no pueda cambiar su
    // contraseña saltándose el estado — ver cambiar-password/index.ts.
    await invocarFuncionAutenticada('cambiar-password', {
      body: { password: nuevaPassword }
    })
  },

  // Vuelve a traer la fila de `usuarios` del usuario actual — para que
  // el sidebar/UI reflejen de inmediato un cambio de perfil (ej. datos
  // profesionales) sin tener que cerrar sesión y volver a entrar.
  recargarPerfil: async () => {
    const session = get().session
    if (session) await get().cargarPerfil(session)
  },

  logout: async () => {
    const sesionActualId = get().sesionActualId
    if (sesionActualId) await marcarSesionFinalizada(sesionActualId).catch(() => {})
    await supabase.auth.signOut()
    set({ session: null, perfil: null, clinicaNombre: null, clinicaEstado: null, sesionActualId: null })
  },

  // Se llama en cada navegación (ver ProtectedRoute) para que, si el
  // super admin suspende la clínica mientras alguien ya tiene la sesión
  // abierta, se entere sin esperar a que refresque manualmente la
  // página. Es una consulta liviana; la protección real (RLS +
  // Edge Functions) no depende de esto.
  refrescarEstadoClinica: async () => {
    const clinicaId = get().perfil?.clinica_id
    if (!clinicaId) return
    try {
      const { data: clinica, error } = await supabase
        .from('clinicas')
        .select('estado')
        .eq('id', clinicaId)
        .single()
      if (error) throw error
      if (clinica?.estado) set({ clinicaEstado: clinica.estado, connectionStatus: 'online' })
    } catch {
      // Sin conexión: se deja el estado de clínica que ya se tenía
      // (de la caché offline, si aplica) — no tiene caso tronar esto
      // en cada navegación solo porque no hay red en este momento.
      set({ connectionStatus: 'offline' })
    }
  },

  // Helpers de permisos usados en toda la UI
  tieneRol: (...roles) => roles.includes(get().perfil?.rol),
  esClinico: () => ['owner', 'dentista'].includes(get().perfil?.rol)
}))
