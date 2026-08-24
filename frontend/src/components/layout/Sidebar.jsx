import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { actualizarMiPerfilProfesional } from '../../services/usuarios'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

// Estructura por secciones, siguiendo el flujo real de trabajo de la
// clínica en vez de una lista plana. Expedientes, odontograma, fotos,
// notas, etc. NO son módulos aquí — viven dentro de la ficha del
// paciente, como ya estaba. Esto solo reorganiza la navegación
// principal; "Consultas", "Finanzas", "Configuración" y "Reportes" se
// agregan cuando esas fases futuras construyan una pantalla real, para
// no dejar enlaces rotos mientras tanto.
const SECCIONES = [
  {
    titulo: null, // Inicio no lleva encabezado, va suelto arriba
    enlaces: [
      { to: '/', label: 'Mi día', roles: ['owner', 'dentista', 'asistente'] }
    ]
  },
  {
    titulo: 'Atención',
    enlaces: [
      { to: '/agenda', label: 'Agenda', roles: ['owner', 'dentista', 'recepcion', 'asistente'] },
      { to: '/pacientes', label: 'Pacientes', roles: ['owner', 'dentista', 'recepcion', 'asistente'] }
    ]
  },
  {
    titulo: 'Gestión',
    enlaces: [
      { to: '/catalogo', label: 'Tratamientos', roles: ['owner', 'dentista'] },
      { to: '/corte-de-caja', label: 'Corte de caja', roles: ['owner', 'recepcion'] },
      { to: '/reportes', label: 'Reportes', roles: ['owner'] }
    ]
  },
  {
    titulo: 'Administración',
    enlaces: [
      { to: '/usuarios', label: 'Usuarios', roles: ['owner'] },
      { to: '/configuracion', label: 'Configuración', roles: ['owner'] }
      // Reporte SIS: oculto del menú — enfoque del producto es clínicas privadas,
      // el reporte SIS/DGIS aplica a unidades médicas de la Secretaría de Salud.
      // La ruta /reporte-sis y todo el módulo siguen intactos, solo no se navega
      // a él desde aquí. Reactivar es agregar de vuelta esta línea:
      // { to: '/reporte-sis', label: 'Reporte SIS', roles: ['owner'] }
    ]
  }
]

const ETIQUETA_ROL = {
  owner: 'Propietario',
  dentista: 'Odontólogo',
  recepcion: 'Recepción',
  asistente: 'Asistente'
}

export function Sidebar() {
  const { perfil, clinicaNombre, logout } = useAuthStore()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [modalPerfilAbierto, setModalPerfilAbierto] = useState(false)

  return (
    <aside className="flex h-screen w-56 flex-col justify-between border-r border-slate-200 bg-white p-4">
      <div className="overflow-y-auto">
        <img src="/Siro_logo.png" alt="SIRO" className="mb-8 h-20 w-full object-contain px-2" />
        <nav className="space-y-4">
          {SECCIONES.map((seccion, i) => {
            const visibles = seccion.enlaces.filter((e) => e.roles.includes(perfil?.rol))
            if (visibles.length === 0) return null
            return (
              <div key={i}>
                {seccion.titulo && (
                  <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {seccion.titulo}
                  </div>
                )}
                <div className="space-y-1">
                  {visibles.map((e) => (
                    <NavLink
                      key={e.to}
                      to={e.to}
                      end={e.to === '/'}
                      className={({ isActive }) =>
                        `block rounded-lg px-3 py-2 text-sm font-medium ${
                          isActive ? 'bg-clinico-azulClaro text-clinico-azul' : 'text-slate-600 hover:bg-slate-50'
                        }`
                      }
                    >
                      {e.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}

          {perfil?.es_super_admin && (
            <div>
              <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Superadministrador
              </div>
              <NavLink
                to="/administracion"
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive ? 'bg-amber-50 text-clinico-ambar' : 'text-clinico-ambar hover:bg-amber-50'
                  }`
                }
              >
                ⚡ Clínicas
              </NavLink>
            </div>
          )}
        </nav>
      </div>

      <div className="border-t border-slate-100 px-2 pt-3">
        <div className="mb-2">
          <div className="text-sm font-medium text-slate-700">{perfil?.nombre}</div>
          <div className="text-xs text-slate-400">
            {ETIQUETA_ROL[perfil?.rol] ?? perfil?.rol}
            {clinicaNombre && ` · ${clinicaNombre}`}
          </div>
        </div>
        <button
          onClick={() => setModalPerfilAbierto(true)}
          className="block text-sm text-slate-400 hover:text-clinico-azul"
        >
          Datos profesionales
        </button>
        <button
          onClick={() => setModalAbierto(true)}
          className="block text-sm text-slate-400 hover:text-clinico-azul"
        >
          Cambiar contraseña
        </button>
        <button onClick={logout} className="mt-1 block text-sm text-slate-400 hover:text-clinico-rojo">
          Cerrar sesión
        </button>
      </div>

      <ModalCambiarPassword abierto={modalAbierto} onCerrar={() => setModalAbierto(false)} />
      <ModalPerfilProfesional abierto={modalPerfilAbierto} onCerrar={() => setModalPerfilAbierto(false)} />
    </aside>
  )
}

function ModalCambiarPassword({ abierto, onCerrar }) {
  const cambiarPassword = useAuthStore((s) => s.cambiarPassword)
  const [nueva, setNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [exito, setExito] = useState(false)

  const cerrarYLimpiar = () => {
    setNueva('')
    setConfirmacion('')
    setError(null)
    setExito(false)
    onCerrar()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (nueva.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (nueva !== confirmacion) {
      setError('Las dos contraseñas no coinciden.')
      return
    }

    setGuardando(true)
    try {
      await cambiarPassword(nueva)
      setExito(true)
      toastExito('Contraseña actualizada.')
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={cerrarYLimpiar} titulo="Cambiar contraseña">
      {exito ? (
        <div className="space-y-3">
          <p className="text-sm text-clinico-verde">✓ Tu contraseña se actualizó correctamente.</p>
          <Button onClick={cerrarYLimpiar} className="w-full">Listo</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nueva contraseña"
            type="password"
            required
            minLength={8}
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            autoFocus
          />
          <Input
            label="Confirmar nueva contraseña"
            type="password"
            required
            minLength={8}
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
          />
          {error && <p className="text-sm text-clinico-rojo">{error}</p>}
          <Button type="submit" disabled={guardando} className="w-full">
            {guardando ? 'Guardando…' : 'Guardar nueva contraseña'}
          </Button>
        </form>
      )}
    </Modal>
  )
}

function ModalPerfilProfesional({ abierto, onCerrar }) {
  const perfil = useAuthStore((s) => s.perfil)
  const recargarPerfil = useAuthStore((s) => s.recargarPerfil)
  const [form, setForm] = useState({ nombre: '', rfc: '', cedulaProfesional: '', escuelaProcedencia: '' })
  const [guardando, setGuardando] = useState(false)

  // Se sincroniza con el perfil real cada vez que se abre — así
  // siempre parte de los datos guardados actuales, no de lo que haya
  // quedado escrito de una apertura anterior.
  useEffect(() => {
    if (abierto && perfil) {
      setForm({
        nombre: perfil.nombre ?? '',
        rfc: perfil.rfc ?? '',
        cedulaProfesional: perfil.cedula_profesional ?? '',
        escuelaProcedencia: perfil.escuela_procedencia ?? ''
      })
    }
  }, [abierto, perfil])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      await actualizarMiPerfilProfesional(perfil.id, form)
      await recargarPerfil()
      toastExito('Datos profesionales actualizados.')
      onCerrar()
    } catch (err) {
      toastError('No se pudo guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Datos profesionales">
      <p className="mb-4 text-sm text-slate-500">
        Esta información aparece automáticamente en tus recetas — no hace falta volver a escribirla
        cada vez. Si la cambias, solo afecta a las recetas nuevas; las que ya emitiste conservan los
        datos con los que se generaron.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nombre completo"
          required
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
        />
        <Input
          label="RFC"
          value={form.rfc}
          onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })}
          maxLength={13}
        />
        <Input
          label="Cédula profesional"
          value={form.cedulaProfesional}
          onChange={(e) => setForm({ ...form, cedulaProfesional: e.target.value })}
        />
        <Input
          label="Universidad / institución de procedencia"
          value={form.escuelaProcedencia}
          onChange={(e) => setForm({ ...form, escuelaProcedencia: e.target.value })}
        />
        <Button type="submit" disabled={guardando} className="w-full">
          {guardando ? 'Guardando…' : 'Guardar datos profesionales'}
        </Button>
      </form>
    </Modal>
  )
}