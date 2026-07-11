import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listarTodasLasClinicas } from '../services/admin'
import { useAuthStore } from '../store/useAuthStore'

export function Administracion() {
  const perfil = useAuthStore((s) => s.perfil)
  const navigate = useNavigate()
  const [clinicas, setClinicas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    listarTodasLasClinicas()
      .then(setClinicas)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  if (!perfil?.es_super_admin) {
    return <p className="text-slate-400">No autorizado.</p>
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-slate-800">Administración</h1>
      <p className="mb-6 text-sm text-slate-500">
        Todas las clínicas registradas en el sistema. Solo tú puedes ver esta pantalla.
      </p>

      {error && <p className="text-clinico-rojo">{error}</p>}
      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clinicas.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(`/administracion/${c.id}`)}
              className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-clinico-azul hover:shadow-sm"
            >
              <div className="mb-2 font-semibold text-slate-800">{c.nombre}</div>
              <div className="flex gap-4 text-sm text-slate-500">
                <span>{c.totalPacientes} pacientes</span>
                <span>{c.totalUsuarios} usuarios</span>
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Creada {new Date(c.creado_en).toLocaleDateString('es-MX')}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
