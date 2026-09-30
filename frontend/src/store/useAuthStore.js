import { create } from 'zustand'
import { supabase, invocarFuncionAutenticada } from '../lib/supabase'
import { registrarSesion, marcarSesionFinalizada } from '../services/sesiones'
import { guardarPerfilOffline, leerPerfilOffline } from '../lib/cacheAuth'
import { obtenerPinDisponible, obtenerEstadoPin, verificarPin, configurarPin, cambiarPin, revocarPin, registrarValidacionOnline } from '../lib/pinOffline'
import { evaluarCierreDeSesion, limpiarDatosLocalesDeSesion, asegurarCacheDeEsteUsuario } from '../lib/cierreSesion'
import { esErrorDeRed } from '../lib/errorDeRed'

const estaConectado = () => typeof navigator === 'undefined' || navigator.onLine !== false

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
  // true cuando la sesión activa es una sesión OFFLINE desbloqueada con
  // PIN: no hay token de Supabase válido, solo la identidad guardada de
  // una sesión anterior. Con internet se renueva contra el servidor (o
  // se descarta si el servidor la rechaza) — el PIN nunca reemplaza a
  // Supabase Auth.
  modoOffline: false,
  // Si no hay sesión pero SÍ hay un PIN utilizable en este equipo:
  // { userId, nombre, duracionMs }. La interfaz muestra la pantalla de
  // desbloqueo en vez de mandar a iniciar sesión.
  desbloqueoOffline: null,

  // Se llama una vez al montar la app
  init: async () => {
    const { data: { session }, error: errorSesion } = await supabase.auth.getSession()
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
      // Sin sesión utilizable. Si fue porque NO SE PUDO hablar con
      // Supabase (token vencido y sin red), y en este equipo hay un PIN
      // vigente, se ofrece desbloquear la sesión offline. Si fue porque
      // simplemente no hay sesión (nunca inició, o cerró), o Supabase la
      // rechazó, se va a iniciar sesión — el PIN no entra en juego.
      const sinRed = esErrorDeRed(errorSesion) || !estaConectado()
      const oferta = sinRed ? await get().prepararDesbloqueoOffline() : null
      set({
        session: null, perfil: null, clinicaNombre: null, clinicaEstado: null,
        desbloqueoOffline: oferta, connectionStatus: sinRed ? 'offline' : 'online', cargando: false
      })
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        get().cargarPerfil(session)
      } else {
        // Un evento "sin sesión" del cliente de Supabase (p. ej. no
        // pudo renovar el token sin red) NO debe tirar una sesión
        // offline que la persona acaba de desbloquear con su PIN.
        if (get().modoOffline) return
        set({ session: null, perfil: null, clinicaNombre: null, clinicaEstado: null, cargando: false })
      }
    })
  },

  // ¿Hay un PIN vigente y un perfil guardado con qué armar la sesión
  // offline? Devuelve la info mínima para la pantalla de desbloqueo.
  prepararDesbloqueoOffline: async () => {
    const pin = await obtenerPinDisponible()
    if (!pin) return null
    const guardado = await leerPerfilOffline(pin.userId, { maxEdadMs: pin.duracionMs })
    if (!guardado) return null
    return { userId: pin.userId, nombre: guardado.perfil?.nombre ?? null, duracionMs: pin.duracionMs, bloqueadoHasta: pin.bloqueadoHasta }
  },

  // La persona prefiere iniciar sesión con contraseña en vez de usar el
  // PIN (p. ej. porque ya recuperó internet): se retira la oferta.
  descartarDesbloqueoOffline: () => set({ desbloqueoOffline: null }),

  // Desbloquea la sesión offline con el PIN. Devuelve el resultado de
  // verificarPin (ok / motivo / intentosRestantes / bloqueadoHasta).
  desbloquearConPin: async (pin) => {
    const oferta = get().desbloqueoOffline
    if (!oferta) return { ok: false, motivo: 'NO_DISPONIBLE' }

    const resultado = await verificarPin(oferta.userId, pin)
    if (!resultado.ok) {
      // Estas tres ya no tienen vuelta atrás sin internet: se quita la
      // oferta y la interfaz cae a "inicia sesión con tu contraseña".
      if (['SIN_PIN', 'EXPIRADO', 'REVOCADO_POR_INTENTOS'].includes(resultado.motivo)) set({ desbloqueoOffline: null })
      return resultado
    }

    const guardado = await leerPerfilOffline(oferta.userId, { maxEdadMs: oferta.duracionMs })
    if (!guardado) {
      set({ desbloqueoOffline: null })
      return { ok: false, motivo: 'SIN_PERFIL_LOCAL' }
    }
    set({
      // Identidad local, NO una sesión de Supabase: no lleva token. Sirve
      // para que la interfaz sepa quién es; el servidor la ignora.
      session: { offline: true, user: { id: oferta.userId } },
      perfil: guardado.perfil,
      clinicaNombre: guardado.clinicaNombre,
      clinicaEstado: guardado.clinicaEstado,
      connectionStatus: 'offline',
      modoOffline: true,
      desbloqueoOffline: null,
      sesionActualId: null,
      cargando: false
    })
    return { ok: true }
  },

  // Al volver la conexión: la sesión offline se renueva contra
  // Supabase Auth. Si el servidor la acepta, seguimos con sesión real.
  // Si la rechaza (token revocado, expirado del todo), la sesión offline
  // termina, el PIN se revoca y hay que iniciar sesión con contraseña —
  // la cola de cambios pendientes se conserva.
  reanudarSesionOnline: async () => {
    if (!get().modoOffline) return { ok: true }
    const { data, error } = await supabase.auth.refreshSession()
    if (error || !data?.session) {
      if (esErrorDeRed(error)) return { ok: false, motivo: 'SIN_RED' } // seguimos offline
      await revocarPin().catch(() => {})
      set({
        session: null, perfil: null, clinicaNombre: null, clinicaEstado: null,
        modoOffline: false, desbloqueoOffline: null, cargando: false
      })
      return { ok: false, motivo: 'SESION_INVALIDA' }
    }
    await get().cargarPerfil(data.session) // deja modoOffline en false
    const sesion = await registrarSesion(data.session.user.id)
    set({ sesionActualId: sesion?.id ?? null })
    return { ok: true }
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
      set({ session, perfil: data ?? null, connectionStatus: 'online', modoOffline: false, desbloqueoOffline: null, cargando: false })

      if (data) {
        // Antes de tocar la caché: ¿es de esta persona? Y la sesión se
        // acaba de confirmar contra el servidor: se desliza la vigencia
        // del PIN (o se elimina el de otra cuenta).
        await asegurarCacheDeEsteUsuario(session.user.id)
        // Se espera: borrar el PIN de la persona anterior es una limpieza
        // de seguridad, no algo que deba quedar pendiente en segundo plano.
        // Si falla (IndexedDB no disponible) no debe impedir iniciar sesión.
        await registrarValidacionOnline(session.user.id).catch(() => {})
      }

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
    try {
      // Sin red, signOut() borra la sesión de este equipo pero no puede
      // revocarla en el servidor; devuelve el error en vez de lanzarlo.
      await supabase.auth.signOut()
    } finally {
      // Sea como sea, lo local se limpia: caché clínica, perfil y PIN. La
      // cola de pendientes NO se toca (ver cierreSesion.js).
      await limpiarDatosLocalesDeSesion()
      set({
        session: null, perfil: null, clinicaNombre: null, clinicaEstado: null, sesionActualId: null,
        modoOffline: false, desbloqueoOffline: null, connectionStatus: 'online'
      })
    }
  },

  // ── Cerrar sesión (iniciado por la persona) ──────────────────────────
  // Distinto de logout(), que es el cierre FORZADO (sesión revocada desde
  // otro dispositivo, clínica suspendida) y no se puede negar. Este se
  // bloquea si hay cambios sin subir o no hay conexión: ver cierreSesion.js
  evaluarCierreSesion: () =>
    evaluarCierreDeSesion({ userId: get().perfil?.id, conectado: estaConectado() }),

  cerrarSesionSegura: async () => {
    const evaluacion = await get().evaluarCierreSesion()
    if (!evaluacion.permitido) return { ok: false, evaluacion }
    await get().logout()
    return { ok: true }
  },

  // ── PIN offline ──────────────────────────────────────────────────────
  // Crear, cambiar o revocar el PIN solo se permite con una sesión REAL
  // de Supabase y con internet: es la única forma de que quien lo activa
  // sea de verdad quien dice ser. Desde una sesión offline (ya
  // desbloqueada con PIN) no se puede ni cambiar ni crear otro.
  motivoSinGestionDePin: () => {
    const { session, modoOffline, perfil } = get()
    if (!session || session.offline || modoOffline || !perfil?.id) return 'REQUIERE_SESION_REAL'
    if (!estaConectado()) return 'REQUIERE_CONEXION'
    return null
  },

  estadoPinOffline: async () => {
    const id = get().perfil?.id
    return id ? obtenerEstadoPin(id) : { configurado: false }
  },

  // Deja guardada una copia fresca del perfil junto con el PIN: sin
  // ella, el desbloqueo no tendría con qué armar la sesión offline.
  configurarPinOffline: async (pin, duracionHoras) => {
    const motivo = get().motivoSinGestionDePin()
    if (motivo) return { ok: false, motivo }
    const { perfil, clinicaNombre, clinicaEstado } = get()
    await guardarPerfilOffline({ userId: perfil.id, perfil, clinicaNombre, clinicaEstado })
    return configurarPin(perfil.id, pin, duracionHoras ? { duracionHoras } : {})
  },

  cambiarPinOffline: async (pinActual, pinNuevo, duracionHoras) => {
    const motivo = get().motivoSinGestionDePin()
    if (motivo) return { ok: false, motivo }
    const { perfil, clinicaNombre, clinicaEstado } = get()
    const r = await cambiarPin(perfil.id, pinActual, pinNuevo, duracionHoras ? { duracionHoras } : {})
    if (r.ok) await guardarPerfilOffline({ userId: perfil.id, perfil, clinicaNombre, clinicaEstado })
    return r
  },

  // No pide el PIN: es la salida de "olvidé mi PIN". Como exige sesión
  // real e internet, no la puede usar quien solo tiene el equipo.
  revocarPinOffline: async () => {
    const motivo = get().motivoSinGestionDePin()
    if (motivo) return { ok: false, motivo }
    await revocarPin()
    return { ok: true }
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
