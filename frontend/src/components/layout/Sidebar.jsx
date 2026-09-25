import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { actualizarMiPerfilProfesional } from '../../services/usuarios'
import { SelectorSucursal } from '../sucursales/SelectorSucursal'
import { PadFirma } from '../PadFirma'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

export function etiquetaPacientesPorRol(rol) {
  return {
    owner: 'Pacientes',
    dentista: 'Mis pacientes',
    asistente: 'Pacientes asignados',
    recepcion: 'Buscar pacientes'
  }[rol] ?? 'Pacientes'
}

// Íconos SVG inline — sin librerías, sin emojis. Los 9 primeros son
// los del sistema de diseño; los últimos 5 (shield, alertTriangle,
// briefcase, scale, logOut) se agregaron con el mismo lenguaje visual
// exacto (viewBox 24, stroke 1.75, currentColor) para los ítems reales
// que ya existen en SIRO (ARCO, Incidentes, Superadministrador, cerrar
// sesión) y que el documento de diseño no llegó a mapear.
const props = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' }

const Icon = {
  home: () => (<svg {...props}><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" /><path d="M9 21V12h6v9" /></svg>),
  calendar: () => (<svg {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>),
  users: () => (<svg {...props}><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>),
  sparkles: () => (<svg {...props}><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" /><path d="M19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75L19 13z" /></svg>),
  card: () => (<svg {...props}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>),
  chart: () => (<svg {...props}><path d="M4 19V9M12 19V5M20 19v-7" /></svg>),
  user: () => (<svg {...props}><path d="M16 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="10" cy="7" r="4" /></svg>),
  building: () => (<svg {...props}><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" /></svg>),
  settings: () => (<svg {...props}><circle cx="12" cy="12" r="3" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>),
  shield: () => (<svg {...props}><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3z" /><path d="M9 12l2 2 4-4" /></svg>),
  alertTriangle: () => (<svg {...props}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>),
  briefcase: () => (<svg {...props}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" /></svg>),
  scale: () => (<svg {...props}><path d="M12 3v18M9 21h6M5 7h14" /><path d="M5 7l-3 7a3 3 0 006 0L5 7z" /><path d="M19 7l-3 7a3 3 0 006 0l-3-7z" /></svg>),
  logOut: () => (<svg {...props}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>)
}

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
      { to: '/', label: 'Mi día', icon: 'home', roles: ['owner', 'dentista', 'asistente'] }
    ]
  },
  {
    titulo: 'Atención',
    enlaces: [
      { to: '/agenda', label: 'Agenda', icon: 'calendar', roles: ['owner', 'dentista', 'recepcion', 'asistente'] },
      // Pacientes: la etiqueta cambia según el rol para que la
      // navegación refleje lo que RLS ya filtra en la base — no es
      // decorativo, "Mis pacientes" para un dentista son literalmente
      // los únicos que la base le va a devolver.
      {
        to: '/pacientes',
        label: (rol) => etiquetaPacientesPorRol(rol),
        icon: 'users',
        roles: ['owner', 'dentista', 'recepcion', 'asistente']
      }
    ]
  },
  {
    titulo: 'Gestión',
    enlaces: [
      { to: '/catalogo', label: 'Tratamientos', icon: 'sparkles', roles: ['owner', 'dentista'] },
      { to: '/corte-de-caja', label: 'Corte de caja', icon: 'card', roles: ['owner', 'recepcion'] },
      { to: '/reportes', label: 'Reportes', icon: 'chart', roles: ['owner'] }
    ]
  },
  {
    titulo: 'Administración',
    enlaces: [
      { to: '/usuarios', label: 'Usuarios', icon: 'user', roles: ['owner'] },
      { to: '/sucursales', label: 'Sucursales', icon: 'building', roles: ['owner'] },
      { to: '/configuracion', label: 'Configuración', icon: 'settings', roles: ['owner'] },
      { to: '/administracion/arco', label: 'Derechos ARCO', icon: 'shield', roles: ['owner'] },
      { to: '/administracion/incidentes', label: 'Incidentes de seguridad', icon: 'alertTriangle', roles: ['owner'] }
    ]
  }
]

const ETIQUETA_ROL = {
  owner: 'Propietario',
  dentista: 'Odontólogo',
  recepcion: 'Recepción',
  asistente: 'Asistente'
}

// Badge de rol — colores propios, distintos del Badge de estados
// clínicos (que ya sirve a tratamientos/citas y no debía tocarse).
const COLOR_ROL = {
  owner: 'bg-violet-100 text-violet-800',
  dentista: 'bg-sky-100 text-sky-800',
  recepcion: 'bg-emerald-100 text-emerald-800',
  asistente: 'bg-amber-100 text-amber-800'
}

function iniciales(nombre) {
  if (!nombre) return '?'
  const partes = nombre.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase()
}

function ItemNav({ to, icon, children, end = false, tonoAmbar = false }) {
  const IconoComponente = Icon[icon]
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all duration-150 ease-out active:scale-[0.98] ${
          isActive
            ? tonoAmbar
              ? 'bg-amber-50 text-clinico-ambar'
              : 'bg-clinico-azul text-white shadow-sm shadow-clinico-azul/25'
            : tonoAmbar
              ? 'text-clinico-ambar hover:bg-amber-50'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? 'text-white' : tonoAmbar ? 'text-clinico-ambar' : 'text-slate-400 transition-colors duration-150 group-hover:text-slate-600'}>
            {IconoComponente && <IconoComponente />}
          </span>
          {children}
        </>
      )}
    </NavLink>
  )
}

export function Sidebar() {
  const { perfil, clinicaNombre, logout } = useAuthStore()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [modalPerfilAbierto, setModalPerfilAbierto] = useState(false)

  return (
    <aside className="flex h-screen w-60 flex-col justify-between border-r border-slate-200/80 bg-white p-4">
      <div className="overflow-y-auto">
        <div className="flex h-[72px] items-center justify-center">
          <img src="/Siro_logo.png" alt="SIRO" className="h-16 w-full object-contain px-2" />
        </div>
        <nav className="space-y-4">
          {SECCIONES.map((seccion, i) => {
            const visibles = seccion.enlaces.filter((e) => e.roles.includes(perfil?.rol))
            if (visibles.length === 0) return null
            return (
              <div key={i}>
                {seccion.titulo && (
                  <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    {seccion.titulo}
                  </div>
                )}
                <div className="space-y-1">
                  {visibles.map((e) => (
                    <ItemNav key={e.to} to={e.to} icon={e.icon} end={e.to === '/'}>
                      {typeof e.label === 'function' ? e.label(perfil?.rol) : e.label}
                    </ItemNav>
                  ))}
                </div>
              </div>
            )
          })}

          {perfil?.es_super_admin && (
            <div>
              <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Superadministrador
              </div>
              <div className="space-y-1">
                <ItemNav to="/administracion" icon="briefcase" tonoAmbar>Clínicas</ItemNav>
                <ItemNav to="/admin/legal" icon="scale" tonoAmbar>Legal</ItemNav>
              </div>
            </div>
          )}
        </nav>
      </div>

      <div className="border-t border-slate-100 px-1 pt-3">
        <SelectorSucursal />

        <div className="mb-3 flex items-center gap-2.5 px-1.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-clinico-azulClaro text-xs font-semibold text-clinico-azul">
            {iniciales(perfil?.nombre)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-slate-700">{perfil?.nombre}</div>
            <div className="flex items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${COLOR_ROL[perfil?.rol] ?? 'bg-slate-100 text-slate-600'}`}>
                {ETIQUETA_ROL[perfil?.rol] ?? perfil?.rol}
              </span>
              {clinicaNombre && <span className="truncate text-[11px] text-slate-400">{clinicaNombre}</span>}
            </div>
          </div>
        </div>

        <div className="space-y-0.5">
          <button
            onClick={() => setModalPerfilAbierto(true)}
            className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-[13px] text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800"
          >
            Datos profesionales
          </button>
          <button
            onClick={() => setModalAbierto(true)}
            className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-[13px] text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800"
          >
            Cambiar contraseña
          </button>
          <NavLink
            to="/configuracion/seguridad"
            className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-[13px] text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800"
          >
            Sesiones activas
          </NavLink>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-[13px] text-slate-500 transition-colors duration-150 hover:bg-red-50 hover:text-clinico-rojo"
          >
            <Icon.logOut />
            Cerrar sesión
          </button>
        </div>
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
          <p className="text-sm text-clinico-verde">Tu contraseña se actualizó correctamente.</p>
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
  const [firmaPng, setFirmaPng] = useState(undefined) // undefined = sin tocar, usa la guardada
  const [refirmando, setRefirmando] = useState(false)
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
      setFirmaPng(undefined)
      setRefirmando(false)
    }
  }, [abierto, perfil])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      // Si firmaPng nunca se tocó (undefined), se conserva la firma que
      // ya estaba guardada — no se manda nada y no se borra por
      // accidente solo por abrir y cerrar este modal sin firmar de nuevo.
      const datosGuardar = { ...form }
      if (firmaPng !== undefined) datosGuardar.firmaPng = firmaPng
      else datosGuardar.firmaPng = perfil.firma_png
      await actualizarMiPerfilProfesional(perfil.id, datosGuardar)
      await recargarPerfil()
      toastExito('Datos profesionales actualizados.')
      onCerrar()
    } catch (err) {
      toastError('No se pudo guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  const mostrarFirmaGuardada = perfil?.firma_png && !refirmando

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

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Firma</span>
          <p className="mb-2 text-xs text-slate-400">
            Se dibuja una sola vez aquí y se copia automáticamente a cada receta nueva que generes — no
            es una firma electrónica con validez legal formal, es el equivalente digital de firmar a
            mano.
          </p>
          {mostrarFirmaGuardada ? (
            <div className="rounded-lg border border-slate-200 p-2">
              <img src={perfil.firma_png} alt="Tu firma guardada" className="h-20 w-full object-contain" />
              <button type="button" onClick={() => setRefirmando(true)} className="mt-1 text-xs text-clinico-azul hover:underline">
                Firmar de nuevo
              </button>
            </div>
          ) : (
            <PadFirma onCambiar={setFirmaPng} />
          )}
        </div>

        <Button type="submit" disabled={guardando} className="w-full">
          {guardando ? 'Guardando…' : 'Guardar datos profesionales'}
        </Button>
      </form>
    </Modal>
  )
}
