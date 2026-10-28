import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'

// Cualquier dirección que no existe: antes se veía una página en blanco.
export function PaginaNoEncontrada() {
  const session = useAuthStore((s) => s.session)
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-slate-800">No encontramos esta página</h1>
        <p className="mb-6 text-sm text-slate-500">La dirección no existe o cambió. Tu información no se ve afectada.</p>
        <Link to={session ? '/' : '/login'} className="rounded-lg bg-clinico-azul px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          {session ? 'Ir al inicio' : 'Iniciar sesión'}
        </Link>
      </div>
    </div>
  )
}
