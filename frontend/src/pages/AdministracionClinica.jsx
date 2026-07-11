import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { verClinica } from '../services/admin'
import { useAuthStore } from '../store/useAuthStore'

export function AdministracionClinica() {
  const perfil = useAuthStore((s) => s.perfil)
  const { clinicaId } = useParams()
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    verClinica(clinicaId)
      .then(setDatos)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false))
  }, [clinicaId])

  if (!perfil?.es_super_admin) {
    return <p className="text-slate-400">No autorizado.</p>
  }

  if (cargando) return <p className="text-slate-400">Cargando…</p>
  if (error) return <p className="text-clinico-rojo">{error}</p>
  if (!datos) return null

  return (
    <div>
      <Link to="/administracion" className="mb-4 inline-block text-sm text-clinico-azul hover:underline">
        ← Todas las clínicas
      </Link>
      <h1 className="mb-6 text-2xl font-semibold text-slate-800">{datos.clinica.nombre}</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-semibold text-slate-700">Usuarios ({datos.usuarios.length})</h2>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Rol</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {datos.usuarios.map((u) => (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{u.nombre}</div>
                      <div className="text-xs text-slate-400">{u.correo}</div>
                    </td>
                    <td className="px-3 py-2 capitalize text-slate-600">{u.rol}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.activo ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'}`}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="mb-3 font-semibold text-slate-700">Pacientes ({datos.pacientes.length})</h2>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Teléfono</th>
                </tr>
              </thead>
              <tbody>
                {datos.pacientes.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-800">{p.nombre_completo}</td>
                    <td className="px-3 py-2 text-slate-600">{p.telefono}</td>
                  </tr>
                ))}
                {datos.pacientes.length === 0 && (
                  <tr><td colSpan={2} className="px-3 py-4 text-center text-slate-400">Sin pacientes todavía.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
