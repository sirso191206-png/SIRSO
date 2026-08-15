import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { Sidebar } from './Sidebar'

export function ProtectedRoute({ children }) {
  const { session, perfil, clinicaEstado, cargando, logout, refrescarEstadoClinica } = useAuthStore()
  const location = useLocation()

  // Re-consulta el estado de la clínica en cada navegación, para que una
  // suspensión aplicada mientras la sesión ya estaba abierta se note sin
  // esperar a un refresh manual. La protección real vive en RLS y en las
  // Edge Functions; esto es solo para que la UI no se quede desactualizada.
  useEffect(() => {
    if (session) refrescarEstadoClinica()
  }, [location.pathname, session, refrescarEstadoClinica])

  if (cargando) {
    return <div className="flex h-screen items-center justify-center text-slate-400">Cargando…</div>
  }

  if (!session) {
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

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  )
}
