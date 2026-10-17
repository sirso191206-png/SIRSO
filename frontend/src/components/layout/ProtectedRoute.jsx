import { useCallback, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { useEscucharCierreSesion } from '../../hooks/useEscucharCierreSesion'
import { useConexion } from '../../hooks/useConexion'
import { toastError } from '../../store/useToastStore'
import { mensajeSesionCerrada } from '../../services/sesiones'
import { PantallaDesbloqueoPin } from '../auth/PantallaDesbloqueoPin'
import { AccesoNoAutorizado } from './AccesoNoAutorizado'
import { AvisoSuscripcion } from '../planes/AvisoSuscripcion'
import { CambioPasswordObligatorio } from '../auth/CambioPasswordObligatorio'
import { AceptacionLegalObligatoria } from '../legal/AceptacionLegalObligatoria'
import { puedeEntrarARuta } from '../../lib/accesoPorRol'
import { Sidebar } from './Sidebar'

export function ProtectedRoute({ children }) {
  const { session, perfil, clinicaEstado, cargando, logout, refrescarEstadoClinica, sesionActualId, modoOffline, desbloqueoOffline, reanudarSesionOnline } = useAuthStore()
  const conectado = useConexion()
  const location = useLocation()

  // Si otro dispositivo cierra esta misma sesión (p. ej. "Cerrar todas
  // mis sesiones" desde el iPad), este dispositivo se entera en
  // segundos vía Realtime y cierra sesión local de inmediato — sin
  // esto, seguiría funcionando hasta que su access token expirara por
  // su cuenta. Va antes de cualquier return para respetar las reglas
  // de hooks de React (nunca condicional).
  // logout() es el cierre FORZADO: conserva los cambios pendientes de subir.
  const alCerrarRemota = useCallback((motivo, limite) => {
    toastError(mensajeSesionCerrada(motivo, limite))
    logout()
  }, [logout])
  useEscucharCierreSesion(sesionActualId, alCerrarRemota)

  // Re-consulta el estado de la clínica en cada navegación, para que una
  // suspensión aplicada mientras la sesión ya estaba abierta se note sin
  // esperar a un refresh manual. La protección real vive en RLS y en las
  // Edge Functions; esto es solo para que la UI no se quede desactualizada.
  useEffect(() => {
    if (session) refrescarEstadoClinica()
  }, [location.pathname, session, refrescarEstadoClinica])

  // Sesión offline (desbloqueada con PIN) y ya volvió internet: se renueva
  // contra Supabase Auth. Si el servidor la rechaza, se avisa y la ruta
  // cae a /login (el PIN ya quedó revocado; la cola de cambios se conserva).
  useEffect(() => {
    if (!modoOffline || !conectado) return
    const intentar = () => reanudarSesionOnline().then((r) => {
      if (r.motivo === 'SESION_INVALIDA') {
        toastError('Tu sesión ya no es válida. Inicia sesión con tu contraseña; tus cambios sin subir se conservan.')
      }
    })
    intentar()
    // navigator.onLine puede decir "conectado" con un wifi que aún no sale
    // a internet: mientras siga el modo offline se reintenta cada 30 s.
    const id = setInterval(intentar, 30_000)
    return () => clearInterval(id)
  }, [modoOffline, conectado, reanudarSesionOnline])

  if (cargando) {
    return <div className="flex h-screen items-center justify-center text-slate-400">Cargando…</div>
  }

  if (!session) {
    // Sin internet y con un PIN vigente: se ofrece desbloquear la sesión
    // offline en vez de mandar a un login que no podría completarse.
    if (desbloqueoOffline) return <PantallaDesbloqueoPin />
    return <Navigate to="/login" replace />
  }

  // Clínica suspendida: nadie de la clínica entra, salvo el super admin.
  if (clinicaEstado === 'suspendida' && !perfil?.es_super_admin) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-xl font-semibold text-slate-800">Clínica suspendida</h1>
          <p className="mb-6 text-sm text-slate-500">
            El acceso a esta clínica está temporalmente suspendido. Contacta al
            administrador de SIRO para regularizar tu situación.
          </p>
          <button
            onClick={logout}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  // Contraseña TEMPORAL sin cambiar (usuarios.debe_cambiar_password, migración 103): lo único que se ve es la pantalla de cambio, sea cual sea la URL. Esto es
  // interfaz; el bloqueo real de los datos y de las funciones lo aplican la base de datos y las Edge Functions.
  if (perfil?.debe_cambiar_password === true) return <CambioPasswordObligatorio />

  // Acceso directo por URL: solo las pantallas de su rol (tabla única en lib/accesoPorRol.js). Es
  // protección de interfaz; los datos los protege la base de datos.
  const autorizado = puedeEntrarARuta(location.pathname, perfil)

  // Aceptación de los documentos legales vigentes (migración 106): se solicita si falta; no bloquea el trabajo sin conexión ni ante un error de consulta.
  return (
    <AceptacionLegalObligatoria perfil={perfil} sinConexion={Boolean(modoOffline) || conectado === false}>
      <div className="flex">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-8">
          <AvisoSuscripcion />
          {autorizado ? children : <AccesoNoAutorizado rol={perfil?.rol} />}
        </main>
      </div>
    </AceptacionLegalObligatoria>
  )
}
