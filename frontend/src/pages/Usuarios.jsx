import { useState } from 'react'
import { useUsuarios } from '../hooks/useUsuarios'
import { useAuthStore } from '../store/useAuthStore'
import { toastExito, toastError } from '../store/useToastStore'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { ConfirmModal } from '../components/ui/ConfirmModal'

const ROLES = [
  { value: 'owner', label: 'Owner' },
  { value: 'dentista', label: 'Dentista' },
  { value: 'recepcion', label: 'Recepción' },
  { value: 'asistente', label: 'Asistente' }
]

export function Usuarios() {
  const perfil = useAuthStore((s) => s.perfil)
  const { usuarios, cargando, crear, cambiarActivo, eliminar } = useUsuarios()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [usuarioAEliminar, setUsuarioAEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)

  if (perfil?.rol !== 'owner') {
    return <p className="text-slate-400">Esta sección solo está disponible para el owner de la clínica.</p>
  }

  const handleCambiarActivo = async (u) => {
    try {
      await cambiarActivo(u.id, !u.activo)
      toastExito(u.activo ? `${u.nombre} desactivado.` : `${u.nombre} reactivado.`)
    } catch (err) {
      toastError(err.message)
    }
  }

  const handleEliminar = async () => {
    setEliminando(true)
    try {
      await eliminar(usuarioAEliminar.id)
      toastExito(`${usuarioAEliminar.nombre} eliminado.`)
      setUsuarioAEliminar(null)
    } catch (err) {
      toastError(err.message)
    } finally {
      setEliminando(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Usuarios</h1>
        <Button onClick={() => setModalAbierto(true)}>+ Nuevo usuario</Button>
      </div>

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Correo</th>
                <th className="px-4 py-2">Rol</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">
                    {u.nombre}
                    {u.id === perfil.id && <span className="ml-2 text-xs text-slate-400">(tú)</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{u.correo}</td>
                  <td className="px-4 py-2 capitalize text-slate-600">{u.rol}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.activo ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {u.id !== perfil.id && (
                      <div className="flex justify-end gap-3 text-xs">
                        <button
                          onClick={() => handleCambiarActivo(u)}
                          className="font-medium text-clinico-azul hover:underline"
                        >
                          {u.activo ? 'Desactivar' : 'Reactivar'}
                        </button>
                        <button
                          onClick={() => setUsuarioAEliminar(u)}
                          className="font-medium text-clinico-rojo hover:underline"
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalNuevoUsuario abierto={modalAbierto} onCerrar={() => setModalAbierto(false)} onCrear={crear} />

      <ConfirmModal
        abierto={!!usuarioAEliminar}
        onCerrar={() => setUsuarioAEliminar(null)}
        onConfirmar={handleEliminar}
        confirmando={eliminando}
        titulo="Eliminar usuario"
        mensaje={`¿Eliminar por completo a ${usuarioAEliminar?.nombre}? Esta acción no se puede deshacer. Si tiene citas, tratamientos o pagos a su nombre, esos registros se conservan pero sin decir quién los hizo.`}
        textoConfirmar="Eliminar"
      />
    </div>
  )
}

function ModalNuevoUsuario({ abierto, onCerrar, onCrear }) {
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [rol, setRol] = useState('recepcion')
  const [nombreClinica, setNombreClinica] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [resultado, setResultado] = useState(null)

  const esNuevoOwner = rol === 'owner'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setGuardando(true)
    try {
      const res = await onCrear({ nombre, correo, rol, nombreClinica: esNuevoOwner ? nombreClinica : undefined })
      setResultado(res)
      toastExito('Usuario creado.')
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const cerrarYLimpiar = () => {
    setNombre('')
    setCorreo('')
    setRol('recepcion')
    setNombreClinica('')
    setResultado(null)
    setError(null)
    onCerrar()
  }

  return (
    <Modal abierto={abierto} onCerrar={cerrarYLimpiar} titulo="Nuevo usuario">
      {resultado ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            Usuario creado. Comparte esta contraseña temporal con <strong>{resultado.correo}</strong> por
            un medio seguro — pídele que la cambie en cuanto entre por primera vez:
          </p>
          <div className="rounded-lg bg-slate-100 p-3 text-center font-mono text-lg tracking-wide">
            {resultado.passwordTemporal}
          </div>
          <p className="text-xs text-slate-400">
            Esta contraseña no se vuelve a mostrar después de cerrar esta ventana.
          </p>
          <Button onClick={cerrarYLimpiar} className="w-full">Listo</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Nombre completo" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Input label="Correo" type="email" required value={correo} onChange={(e) => setCorreo(e.target.value)} />
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Rol</span>
            <select
              value={rol}
              onChange={(e) => setRol(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>

          {esNuevoOwner && (
            <div className="rounded-lg bg-amber-50 p-3">
              <Input
                label="Nombre de la nueva clínica"
                required
                value={nombreClinica}
                onChange={(e) => setNombreClinica(e.target.value)}
                placeholder="Ej. Consultorio Dental García"
              />
              <p className="mt-2 text-xs text-amber-800">
                Un usuario con rol Owner es dueño de su propia clínica, independiente de la tuya.
                No va a ver tus pacientes, citas ni usuarios, y tú tampoco vas a ver los suyos.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-clinico-rojo">{error}</p>}
          <Button type="submit" disabled={guardando} className="w-full">
            {guardando ? 'Creando…' : 'Crear usuario'}
          </Button>
        </form>
      )}
    </Modal>
  )
}
