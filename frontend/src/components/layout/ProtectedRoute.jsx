import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { Sidebar } from './Sidebar'

export function ProtectedRoute({ children }) {
  const { session, cargando } = useAuthStore()

  if (cargando) {
    return <div className="flex h-screen items-center justify-center text-slate-400">Cargando…</div>
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  )
}
