import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { verClinica, actualizarClinica } from '../services/admin'
import { useAuthStore } from '../store/useAuthStore'

const PLANES = [
  { valor: 'basico', etiqueta: 'Básico' },
  { valor: 'profesional', etiqueta: 'Profesional' },
  { valor: 'clinica', etiqueta: 'Clínica' }
]

function numeroOVacio(v) {
  return v === '' || v === null || v === undefined ? '' : String(v)
}

export function AdministracionClinica() {
  const perfil = useAuthStore((s) => s.perfil)
  const { clinicaId } = useParams()
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  // Panel de permisos
  const [form, setForm] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [permisoError, setPermisoError] = useState(null)
  const [guardado, setGuardado] = useState(false)

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      const d = await verClinica(clinicaId)
      setDatos(d)
      setForm({
        estado: d.clinica.estado ?? 'activa',
        plan: d.clinica.plan ?? 'basico',
        limiteUsuarios: numeroOVacio(d.clinica.limite_usuarios),
        limitePacientes: numeroOVacio(d.clinica.limite_pacientes)
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [clinicaId])

  async function guardarPermisos() {
    setGuardando(true)
    setPermisoError(null)
    setGuardado(false)
    try {
      await actualizarClinica(clinicaId, {
        estado: form.estado,
        plan: form.plan,
        limiteUsuarios: form.limiteUsuarios === '' ? null : Number(form.limiteUsuarios),
        limitePacientes: form.limitePacientes === '' ? null : Number(form.limitePacientes)
      })
      setGuardado(true)
      await cargar()
    } catch (err) {
      setPermisoError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (!perfil?.es_super_admin) {
    return <p className="text-slate-400">No autorizado.</p>
  }

  if (cargando) return <p className="text-slate-400">Cargando…</p>
  if (error) return <p className="text-clinico-rojo">{error}</p>
  if (!datos || !form) return null

  const suspendida = datos.clinica.estado === 'suspendida'

  return (
    <div>
      <Link to="/administracion" className="mb-4 inline-block text-sm text-clinico-azul hover:underline">
        ← Todas las clínicas
      </Link>
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-slate-800">{datos.clinica.nombre}</h1>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            suspendida ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
          }`}
        >
          {suspendida ? 'Suspendida' : 'Activa'}
        </span>
      </div>

      {/* Panel de permisos / plan */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 font-semibold text-slate-700">Plan y permisos</div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Estado</span>
            <select
              value={form.estado}
              onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              <option value="activa">Activa</option>
              <option value="suspendida">Suspendida</option>
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Plan</span>
            <select
              value={form.plan}
              onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              {PLANES.map((p) => (
                <option key={p.valor} value={p.valor}>{p.etiqueta}</option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Límite de usuarios</span>
            <input
              type="number"
              min="0"
              value={form.limiteUsuarios}
              onChange={(e) => setForm((f) => ({ ...f, limiteUsuarios: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              placeholder="Ilimitado"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Límite de pacientes</span>
            <input
              type="number"
              min="0"
              value={form.limitePacientes}
              onChange={(e) => setForm((f) => ({ ...f, limitePacientes: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              placeholder="Ilimitado"
            />
          </label>
        </div>

        <p className="mt-2 text-xs text-slate-400">
          Deja un límite vacío para dejarlo ilimitado. Suspender una clínica impide que
          sus usuarios entren (el super admin no se ve afectado).
        </p>

        {permisoError && <p className="mt-3 text-sm text-clinico-rojo">{permisoError}</p>}
        {guardado && <p className="mt-3 text-sm text-green-700">Cambios guardados.</p>}

        <button
          onClick={guardarPermisos}
          disabled={guardando}
          className="mt-4 rounded-lg bg-clinico-azul px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>

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
