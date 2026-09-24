import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { toastExito, toastError } from '../store/useToastStore'
import { listarIncidentes, crearIncidente, actualizarIncidente, ESTADOS_INCIDENTE, SEVERIDADES_INCIDENTE } from '../services/incidentes'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'

const ETIQUETA_ESTADO = {
  detectado: 'Detectado', en_investigacion: 'En investigación', contenido: 'Contenido', resuelto: 'Resuelto', cerrado: 'Cerrado'
}
const COLOR_SEVERIDAD = {
  baja: 'bg-slate-100 text-slate-600', media: 'bg-amber-100 text-amber-800',
  alta: 'bg-orange-100 text-orange-800', critica: 'bg-red-100 text-red-800'
}

export function AdministracionIncidentes() {
  const perfil = useAuthStore((s) => s.perfil)
  const [incidentes, setIncidentes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [expandidoId, setExpandidoId] = useState(null)
  const [modalNuevo, setModalNuevo] = useState(false)

  const recargar = async () => {
    setCargando(true)
    try {
      setIncidentes(await listarIncidentes())
    } catch (err) {
      toastError(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { recargar() }, [])

  if (perfil?.rol !== 'owner') {
    return <p className="text-slate-400">Esta sección solo está disponible para el owner de la clínica.</p>
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Incidentes de seguridad</h1>
        <Button onClick={() => setModalNuevo(true)}>+ Registrar incidente</Button>
      </div>
      <p className="mb-6 text-sm text-slate-400">Uso interno — nunca visible para pacientes ni para roles no autorizados.</p>

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : incidentes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">Sin incidentes registrados.</p>
      ) : (
        <div className="space-y-3">
          {incidentes.map((inc) => (
            <div key={inc.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <button onClick={() => setExpandidoId(expandidoId === inc.id ? null : inc.id)} className="flex w-full items-center justify-between text-left">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{inc.tipo}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_SEVERIDAD[inc.severidad]}`}>{inc.severidad}</span>
                    <span className="rounded-full bg-clinico-azulClaro px-2 py-0.5 text-xs font-medium text-clinico-azul">{ETIQUETA_ESTADO[inc.estado]}</span>
                  </div>
                  <div className="text-xs text-slate-400">{new Date(inc.fecha).toLocaleString('es-MX')}</div>
                </div>
                <span className="text-slate-400">{expandidoId === inc.id ? '▾' : '▸'}</span>
              </button>
              {expandidoId === inc.id && <DetalleIncidente incidente={inc} onActualizado={recargar} />}
            </div>
          ))}
        </div>
      )}

      <ModalNuevoIncidente abierto={modalNuevo} onCerrar={() => setModalNuevo(false)} onCrear={crearIncidente} perfil={perfil} onCreado={recargar} />
    </div>
  )
}

function DetalleIncidente({ incidente, onActualizado }) {
  const [estado, setEstado] = useState(incidente.estado)
  const [resolucion, setResolucion] = useState(incidente.resolucion ?? '')
  const [guardando, setGuardando] = useState(false)

  const handleGuardar = async () => {
    setGuardando(true)
    try {
      await actualizarIncidente(incidente.id, {
        estado,
        resolucion: resolucion.trim() || null,
        fecha_cierre: estado === 'cerrado' ? new Date().toISOString() : null
      })
      toastExito('Incidente actualizado.')
      await onActualizado()
    } catch (err) {
      toastError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-sm">
      <p className="text-slate-600">{incidente.descripcion}</p>
      {incidente.datos_afectados && <p><strong className="text-slate-500">Datos afectados:</strong> {incidente.datos_afectados}</p>}
      {incidente.usuarios_afectados && <p><strong className="text-slate-500">Usuarios/pacientes afectados:</strong> {incidente.usuarios_afectados}</p>}
      {incidente.acciones && <p><strong className="text-slate-500">Acciones tomadas:</strong> {incidente.acciones}</p>}
      {incidente.detector?.nombre && <p><strong className="text-slate-500">Detectado por:</strong> {incidente.detector.nombre}</p>}

      <label className="block">
        <span className="mb-1 block font-medium text-slate-700">Estado</span>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {ESTADOS_INCIDENTE.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO[e]}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block font-medium text-slate-700">Resolución</span>
        <textarea value={resolucion} onChange={(e) => setResolucion(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </label>

      <Button onClick={handleGuardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</Button>
    </div>
  )
}

function ModalNuevoIncidente({ abierto, onCerrar, onCrear, perfil, onCreado }) {
  const [tipo, setTipo] = useState('')
  const [severidad, setSeveridad] = useState('media')
  const [descripcion, setDescripcion] = useState('')
  const [datosAfectados, setDatosAfectados] = useState('')
  const [usuariosAfectados, setUsuariosAfectados] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cerrar = () => {
    setTipo(''); setSeveridad('media'); setDescripcion(''); setDatosAfectados(''); setUsuariosAfectados('')
    onCerrar()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!tipo.trim() || !descripcion.trim()) {
      toastError('Falta el tipo o la descripción.')
      return
    }
    setGuardando(true)
    try {
      await onCrear({
        clinica_id: perfil.clinica_id,
        tipo: tipo.trim(),
        severidad,
        descripcion: descripcion.trim(),
        datos_afectados: datosAfectados.trim() || null,
        usuarios_afectados: usuariosAfectados.trim() || null,
        detectado_por: perfil.id
      })
      toastExito('Incidente registrado.')
      cerrar()
      await onCreado()
    } catch (err) {
      toastError('No se pudo registrar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={cerrar} titulo="Registrar incidente de seguridad">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Tipo" required value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Ej. Acceso no autorizado, fuga de credenciales…" />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Severidad</span>
          <select value={severidad} onChange={(e) => setSeveridad(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {SEVERIDADES_INCIDENTE.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Descripción</span>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <Input label="Datos afectados (opcional)" value={datosAfectados} onChange={(e) => setDatosAfectados(e.target.value)} />
        <Input label="Usuarios/pacientes afectados (opcional)" value={usuariosAfectados} onChange={(e) => setUsuariosAfectados(e.target.value)} />
        <Button type="submit" disabled={guardando} className="w-full">{guardando ? 'Guardando…' : 'Registrar incidente'}</Button>
      </form>
    </Modal>
  )
}
