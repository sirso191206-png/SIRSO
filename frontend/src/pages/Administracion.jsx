import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listarTodasLasClinicas, crearClinicaConOwner } from '../services/admin'
import { useAuthStore } from '../store/useAuthStore'

const FORM_VACIO = { nombreClinica: '', ownerNombre: '', ownerCorreo: '' }

export function Administracion() {
  const perfil = useAuthStore((s) => s.perfil)
  const navigate = useNavigate()
  const [clinicas, setClinicas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  // Alta de clínica
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [formError, setFormError] = useState(null)
  const [resultado, setResultado] = useState(null) // { correo, passwordTemporal }

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      setClinicas(await listarTodasLasClinicas())
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  function cambiar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  function cerrarForm() {
    setMostrarForm(false)
    setForm(FORM_VACIO)
    setFormError(null)
  }

  async function enviar(e) {
    e.preventDefault()
    setGuardando(true)
    setFormError(null)
    try {
      const data = await crearClinicaConOwner(form)
      setResultado({ correo: data.correo, passwordTemporal: data.passwordTemporal })
      cerrarForm()
      await cargar()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (!perfil?.es_super_admin) {
    return <p className="text-slate-400">No autorizado.</p>
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-2xl font-semibold text-slate-800">Administración</h1>
          <p className="text-sm text-slate-500">
            Todas las clínicas registradas en el sistema. Solo tú puedes ver esta pantalla.
          </p>
        </div>
        <button
          onClick={() => {
            setResultado(null)
            setMostrarForm(true)
          }}
          className="shrink-0 rounded-lg bg-clinico-azul px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Nueva clínica
        </button>
      </div>

      {/* Resultado: contraseña temporal para entregar al dueño */}
      {resultado && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="mb-1 font-semibold text-emerald-800">Clínica creada</div>
          <p className="mb-3 text-sm text-emerald-700">
            Entrega estos datos al dueño para su primer inicio de sesión. La contraseña
            temporal no se volverá a mostrar.
          </p>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-white px-3 py-2">
              <div className="text-xs text-slate-400">Correo</div>
              <div className="font-mono text-slate-800">{resultado.correo}</div>
            </div>
            <div className="rounded-lg bg-white px-3 py-2">
              <div className="text-xs text-slate-400">Contraseña temporal</div>
              <div className="font-mono text-slate-800">{resultado.passwordTemporal}</div>
            </div>
          </div>
          <button
            onClick={() => setResultado(null)}
            className="mt-3 text-sm font-medium text-emerald-700 hover:underline"
          >
            Entendido
          </button>
        </div>
      )}

      {/* Formulario de alta */}
      {mostrarForm && (
        <form
          onSubmit={enviar}
          className="mb-6 rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="mb-3 font-semibold text-slate-800">Nueva clínica y su dueño</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">Nombre de la clínica</span>
              <input
                value={form.nombreClinica}
                onChange={(e) => cambiar('nombreClinica', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                placeholder="Clínica Dental Ejemplo"
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">Nombre del dueño</span>
              <input
                value={form.ownerNombre}
                onChange={(e) => cambiar('ownerNombre', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                placeholder="Dr. Juan Pérez"
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">Correo del dueño</span>
              <input
                type="email"
                value={form.ownerCorreo}
                onChange={(e) => cambiar('ownerCorreo', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                placeholder="dueno@clinica.com"
                required
              />
            </label>
          </div>

          {formError && <p className="mt-3 text-sm text-clinico-rojo">{formError}</p>}

          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-clinico-azul px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {guardando ? 'Creando…' : 'Crear clínica'}
            </button>
            <button
              type="button"
              onClick={cerrarForm}
              disabled={guardando}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-clinico-rojo">{error}</p>}
      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : clinicas.length === 0 ? (
        <p className="text-slate-400">Aún no hay clínicas registradas.</p>
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
