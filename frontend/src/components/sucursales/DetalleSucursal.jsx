import { useEffect, useState } from 'react'
import { toastExito, toastError } from '../../store/useToastStore'
import {
  listarConsultorios, crearConsultorio, desactivarConsultorio,
  listarSillones, crearSillon, desactivarSillon,
  listarUsuariosDeSucursal, asignarUsuarioASucursal, quitarUsuarioDeSucursal
} from '../../services/sucursales'
import { listarUsuarios } from '../../services/usuarios'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

export function DetalleSucursal({ sucursal }) {
  return (
    <div className="grid gap-6 border-t border-slate-100 pt-4 md:grid-cols-2">
      <BloqueConsultorios sucursalId={sucursal.id} />
      <BloqueUsuarios sucursalId={sucursal.id} />
    </div>
  )
}

function BloqueConsultorios({ sucursalId }) {
  const [consultorios, setConsultorios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const recargar = async () => {
    setCargando(true)
    setConsultorios(await listarConsultorios(sucursalId))
    setCargando(false)
  }

  useEffect(() => { recargar() }, [sucursalId])

  const handleCrear = async (e) => {
    e.preventDefault()
    if (!nombreNuevo.trim()) return
    setGuardando(true)
    try {
      await crearConsultorio(sucursalId, nombreNuevo.trim())
      setNombreNuevo('')
      await recargar()
    } catch (err) {
      toastError('No se pudo crear el consultorio: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  const handleDesactivar = async (consultorio) => {
    try {
      await desactivarConsultorio(consultorio.id)
      toastExito(`Consultorio "${consultorio.nombre}" desactivado.`)
      await recargar()
    } catch (err) {
      toastError(err.message)
    }
  }

  if (cargando) return <p className="text-sm text-slate-400">Cargando consultorios…</p>

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-700">Consultorios</h3>
      <div className="space-y-1.5">
        {consultorios.length === 0 && <p className="text-xs text-slate-400">Sin consultorios registrados todavía.</p>}
        {consultorios.map((c) => (
          <BloqueSillones key={c.id} consultorio={c} onDesactivarConsultorio={() => handleDesactivar(c)} />
        ))}
      </div>
      <form onSubmit={handleCrear} className="mt-3 flex gap-2">
        <Input
          placeholder="Nombre del consultorio (ej. Consultorio 1)"
          value={nombreNuevo}
          onChange={(e) => setNombreNuevo(e.target.value)}
          disabled={guardando}
          className="text-sm"
        />
        <Button type="submit" variante="secundario" disabled={guardando || !nombreNuevo.trim()}>+</Button>
      </form>
    </div>
  )
}

function BloqueSillones({ consultorio, onDesactivarConsultorio }) {
  const [expandido, setExpandido] = useState(false)
  const [sillones, setSillones] = useState([])
  const [cargando, setCargando] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const recargar = async () => {
    setCargando(true)
    setSillones(await listarSillones(consultorio.id))
    setCargando(false)
  }

  const toggle = () => {
    const nuevo = !expandido
    setExpandido(nuevo)
    if (nuevo && sillones.length === 0) recargar()
  }

  const handleCrear = async (e) => {
    e.preventDefault()
    if (!nombreNuevo.trim()) return
    setGuardando(true)
    try {
      await crearSillon(consultorio.id, nombreNuevo.trim())
      setNombreNuevo('')
      await recargar()
    } catch (err) {
      toastError('No se pudo crear el sillón: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  const handleDesactivarSillon = async (sillon) => {
    try {
      await desactivarSillon(sillon.id)
      await recargar()
    } catch (err) {
      toastError(err.message)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center justify-between">
        <button onClick={toggle} className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <span className="text-slate-400">{expandido ? '▾' : '▸'}</span> {consultorio.nombre}
        </button>
        <button onClick={onDesactivarConsultorio} className="text-xs text-red-500 hover:underline">Desactivar</button>
      </div>

      {expandido && (
        <div className="mt-2 space-y-1 border-t border-slate-200 pt-2">
          {cargando ? (
            <p className="text-xs text-slate-400">Cargando sillones…</p>
          ) : (
            <>
              {sillones.length === 0 && <p className="text-xs text-slate-400">Sin sillones registrados todavía.</p>}
              {sillones.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs text-slate-600">
                  <span>🪑 {s.nombre}</span>
                  <button onClick={() => handleDesactivarSillon(s)} className="text-red-500 hover:underline">Desactivar</button>
                </div>
              ))}
              <form onSubmit={handleCrear} className="mt-1.5 flex gap-1.5">
                <Input
                  placeholder="Nombre del sillón"
                  value={nombreNuevo}
                  onChange={(e) => setNombreNuevo(e.target.value)}
                  disabled={guardando}
                  className="py-1 text-xs"
                />
                <Button type="submit" variante="secundario" disabled={guardando || !nombreNuevo.trim()}>+</Button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function BloqueUsuarios({ sucursalId }) {
  const [asignados, setAsignados] = useState([])
  const [todosLosUsuarios, setTodosLosUsuarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [seleccionado, setSeleccionado] = useState('')
  const [guardando, setGuardando] = useState(false)

  const recargar = async () => {
    setCargando(true)
    const [asig, todos] = await Promise.all([listarUsuariosDeSucursal(sucursalId), listarUsuarios()])
    setAsignados(asig)
    setTodosLosUsuarios(todos)
    setCargando(false)
  }

  useEffect(() => { recargar() }, [sucursalId])

  const idsYaAsignados = new Set(asignados.map((a) => a.usuario.id))
  const disponibles = todosLosUsuarios.filter((u) => u.rol !== 'owner' && !idsYaAsignados.has(u.id))

  const handleAsignar = async (e) => {
    e.preventDefault()
    if (!seleccionado) return
    setGuardando(true)
    try {
      await asignarUsuarioASucursal(sucursalId, seleccionado)
      setSeleccionado('')
      await recargar()
    } catch (err) {
      toastError('No se pudo asignar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  const handleQuitar = async (asignacion) => {
    try {
      await quitarUsuarioDeSucursal(asignacion.id)
      toastExito(`${asignacion.usuario.nombre} ya no pertenece a esta sucursal.`)
      await recargar()
    } catch (err) {
      toastError(err.message)
    }
  }

  if (cargando) return <p className="text-sm text-slate-400">Cargando usuarios…</p>

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-700">Usuarios asignados</h3>
      <p className="mb-2 text-xs text-slate-400">
        El owner ve todas las sucursales automáticamente — no hace falta asignarlo aquí.
      </p>
      <div className="space-y-1.5">
        {asignados.length === 0 && <p className="text-xs text-slate-400">Nadie asignado todavía.</p>}
        {asignados.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
            <span>{a.usuario.nombre} <span className="text-xs text-slate-400">· {a.usuario.rol}</span></span>
            <button onClick={() => handleQuitar(a)} className="text-xs text-red-500 hover:underline">Quitar</button>
          </div>
        ))}
      </div>
      {disponibles.length > 0 && (
        <form onSubmit={handleAsignar} className="mt-3 flex gap-2">
          <select
            value={seleccionado}
            onChange={(e) => setSeleccionado(e.target.value)}
            disabled={guardando}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Elegir usuario…</option>
            {disponibles.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre} — {u.rol}</option>
            ))}
          </select>
          <Button type="submit" variante="secundario" disabled={guardando || !seleccionado}>Asignar</Button>
        </form>
      )}
    </div>
  )
}
