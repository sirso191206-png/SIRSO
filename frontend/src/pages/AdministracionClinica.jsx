import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { verClinica, eliminarClinica } from '../services/admin'
import { useAuthStore } from '../store/useAuthStore'
import { toastExito, toastError } from '../store/useToastStore'
import { Modal } from '../components/ui/Modal'
import { Icon } from '../components/ui/Icon'
import { Button } from '../components/ui/Button'
import { PanelSuscripcionClinica } from '../components/planes/PanelSuscripcionClinica'

export function AdministracionClinica() {
  const perfil = useAuthStore((s) => s.perfil)
  const { clinicaId } = useParams()
  const navigate = useNavigate()
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  // Eliminar clínica (irreversible)
  const [modalEliminar, setModalEliminar] = useState(false)
  const [confirmarNombre, setConfirmarNombre] = useState('')
  const [eliminando, setEliminando] = useState(false)

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      const d = await verClinica(clinicaId)
      setDatos(d)
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [clinicaId])

  async function handleEliminar() {
    setEliminando(true)
    try {
      const resultado = await eliminarClinica(clinicaId, confirmarNombre)
      if (resultado.advertencias?.length > 0) {
        toastExito(`Clínica eliminada, con ${resultado.advertencias.length} advertencia(s) — revisa la consola.`)
        console.warn('Advertencias al eliminar clínica:', resultado.advertencias)
      } else {
        toastExito('Clínica eliminada por completo.')
      }
      navigate('/administracion')
    } catch (err) {
      toastError('No se pudo eliminar la clínica: ' + err.message)
    } finally {
      setEliminando(false)
      setModalEliminar(false)
    }
  }

  if (!perfil?.es_super_admin) {
    return <p className="text-slate-400">No autorizado.</p>
  }

  if (cargando) return <p className="text-slate-400">Cargando…</p>
  if (error) return <p className="text-clinico-rojo">{error}</p>
  if (!datos) return null

  const suspendida = datos.clinica.estado === 'suspendida'

  return (
    <div>
      <Link to="/administracion" className="mb-4 inline-flex items-center gap-1 text-sm text-clinico-azul hover:underline">
        <Icon.chevronLeft /> Todas las clínicas
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

      {/* Suscripción: plan contratado, límites, funcionalidades, cambio de plan y suspensión.
          El plan y los límites ya NO se editan aquí directo (ver admin-actualizar-clinica). */}
      <PanelSuscripcionClinica clinicaId={clinicaId} onCambio={cargar} />

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

      <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="mb-1 font-semibold text-clinico-rojo">Zona de peligro</div>
        <p className="mb-4 text-sm text-red-800">
          Eliminar una clínica borra <strong>todo</strong>: sus usuarios (cuentas incluidas), pacientes,
          expedientes, citas, tratamientos, pagos, fotografías, documentos y consentimientos. No se puede
          deshacer. Si solo quieres impedir el acceso temporalmente, usa "Suspendida" arriba en vez de esto.
        </p>
        <button
          onClick={() => { setConfirmarNombre(''); setModalEliminar(true) }}
          className="rounded-lg border border-clinico-rojo px-4 py-2 text-sm font-medium text-clinico-rojo hover:bg-red-100"
        >
          Eliminar esta clínica
        </button>
      </div>

      <Modal abierto={modalEliminar} onCerrar={() => !eliminando && setModalEliminar(false)} titulo="Eliminar clínica — no se puede deshacer">
        <p className="mb-4 text-sm text-slate-600">
          Esto elimina <strong>{datos.clinica.nombre}</strong> por completo: {datos.usuarios.length} usuario(s),
          {' '}{datos.pacientes.length} paciente(s) y todo su historial clínico. Para confirmar, escribe el
          nombre exacto de la clínica:
        </p>
        <input
          type="text"
          value={confirmarNombre}
          onChange={(e) => setConfirmarNombre(e.target.value)}
          placeholder={datos.clinica.nombre}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          autoFocus
        />
        <div className="flex gap-3">
          <Button variante="secundario" onClick={() => setModalEliminar(false)} className="flex-1" disabled={eliminando}>
            Cancelar
          </Button>
          <Button
            variante="peligro"
            onClick={handleEliminar}
            className="flex-1"
            disabled={eliminando || confirmarNombre !== datos.clinica.nombre}
          >
            {eliminando ? 'Eliminando…' : 'Eliminar definitivamente'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
