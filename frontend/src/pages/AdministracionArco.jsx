import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { toastExito, toastError } from '../store/useToastStore'
import { listarSolicitudesDeClinica, actualizarSolicitudArco, marcarIdentidadVerificada, crearSolicitudArco, ESTADOS_ARCO } from '../services/arco'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'

const ETIQUETA_ESTADO = {
  recibida: 'Recibida', en_revision: 'En revisión', requiere_informacion: 'Requiere información',
  aprobada: 'Aprobada', rechazada: 'Rechazada', atendida: 'Atendida', cerrada: 'Cerrada'
}

const ETIQUETA_TIPO = { acceso: 'Acceso', rectificacion: 'Rectificación', cancelacion: 'Cancelación', oposicion: 'Oposición' }

export function AdministracionArco() {
  const perfil = useAuthStore((s) => s.perfil)
  const [solicitudes, setSolicitudes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [expandidaId, setExpandidaId] = useState(null)
  const [modalNueva, setModalNueva] = useState(false)

  const recargar = async () => {
    setCargando(true)
    try {
      setSolicitudes(await listarSolicitudesDeClinica())
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
        <h1 className="text-2xl font-semibold text-slate-800">Derechos ARCO</h1>
        <Button onClick={() => setModalNueva(true)}>+ Registrar solicitud</Button>
      </div>
      <p className="mb-6 text-sm text-slate-400">
        Solicitudes de Acceso, Rectificación, Cancelación u Oposición recibidas para tu clínica — ya sea por el
        formulario público, o registradas aquí manualmente cuando alguien la hace por teléfono o correo.
      </p>

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : solicitudes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          No hay solicitudes registradas todavía.
        </p>
      ) : (
        <div className="space-y-3">
          {solicitudes.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <button onClick={() => setExpandidaId(expandidaId === s.id ? null : s.id)} className="flex w-full items-center justify-between text-left">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{s.solicitante_nombre}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{ETIQUETA_TIPO[s.tipo]}</span>
                    <span className="rounded-full bg-clinico-azulClaro px-2 py-0.5 text-xs font-medium text-clinico-azul">{ETIQUETA_ESTADO[s.estado]}</span>
                  </div>
                  <div className="text-xs text-slate-400">{s.solicitante_correo} · {new Date(s.creado_en).toLocaleDateString('es-MX')}</div>
                </div>
                <span className="text-slate-400">{expandidaId === s.id ? '▾' : '▸'}</span>
              </button>

              {expandidaId === s.id && (
                <DetalleSolicitud solicitud={s} onActualizado={recargar} />
              )}
            </div>
          ))}
        </div>
      )}

      <ModalNuevaSolicitud
        abierto={modalNueva}
        onCerrar={() => setModalNueva(false)}
        clinicaId={perfil.clinica_id}
        onCreada={recargar}
      />
    </div>
  )
}

function ModalNuevaSolicitud({ abierto, onCerrar, clinicaId, onCreada }) {
  const [tipo, setTipo] = useState('acceso')
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cerrar = () => {
    setTipo('acceso'); setNombre(''); setCorreo(''); setDescripcion('')
    onCerrar()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!nombre.trim() || !correo.trim() || !descripcion.trim()) {
      toastError('Completa nombre, correo y descripción.')
      return
    }
    setGuardando(true)
    try {
      // usuario_id se deja sin mandar (queda null) a propósito — esta
      // solicitud es de la persona que llamó o escribió, no del owner
      // que la está registrando por ella.
      await crearSolicitudArco({
        tipo,
        solicitante_nombre: nombre.trim(),
        solicitante_correo: correo.trim(),
        descripcion: descripcion.trim(),
        clinica_id: clinicaId
      })
      toastExito('Solicitud registrada.')
      cerrar()
      await onCreada()
    } catch (err) {
      toastError('No se pudo registrar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={cerrar} titulo="Registrar solicitud ARCO">
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="acceso">Acceso</option>
            <option value="rectificacion">Rectificación</option>
            <option value="cancelacion">Cancelación</option>
            <option value="oposicion">Oposición</option>
          </select>
        </label>
        <Input label="Nombre de quien solicita" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <Input label="Correo de contacto" type="email" required value={correo} onChange={(e) => setCorreo(e.target.value)} />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Descripción</span>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Qué te pidió, tal como te lo dijo…" />
        </label>
        <Button type="submit" disabled={guardando} className="w-full">{guardando ? 'Registrando…' : 'Registrar solicitud'}</Button>
      </form>
    </Modal>
  )
}

function DetalleSolicitud({ solicitud, onActualizado }) {
  const perfil = useAuthStore((s) => s.perfil)
  const [estado, setEstado] = useState(solicitud.estado)
  const [respuesta, setRespuesta] = useState(solicitud.respuesta ?? '')
  const [metodoVerificacion, setMetodoVerificacion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [verificando, setVerificando] = useState(false)

  const handleVerificar = async () => {
    if (!metodoVerificacion.trim()) {
      toastError('Describe cómo verificaste la identidad (ej. "Llamada al teléfono registrado").')
      return
    }
    setVerificando(true)
    try {
      await marcarIdentidadVerificada(solicitud.id, { usuarioId: perfil.id, metodo: metodoVerificacion.trim() })
      toastExito('Identidad marcada como verificada.')
      await onActualizado()
    } catch (err) {
      toastError(err.message)
    } finally {
      setVerificando(false)
    }
  }

  const handleGuardar = async () => {
    setGuardando(true)
    try {
      await actualizarSolicitudArco(solicitud.id, {
        estado,
        respuesta: respuesta.trim() || null,
        fecha_respuesta: respuesta.trim() ? new Date().toISOString() : null
      })
      toastExito('Solicitud actualizada.')
      await onActualizado()
    } catch (err) {
      // La base de datos rechaza (no solo el frontend) marcar como
      // aprobada/atendida sin verificar identidad primero — este
      // mensaje es exactamente el que la propia base de datos genera.
      toastError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
      <p className="text-sm text-slate-600">{solicitud.descripcion}</p>

      <div className={`rounded-lg border p-3 text-sm ${solicitud.identidad_verificada ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
        {solicitud.identidad_verificada ? (
          <div className="text-green-800">
            ✓ Identidad verificada{solicitud.metodo_verificacion ? ` — ${solicitud.metodo_verificacion}` : ''}
            {solicitud.identidad_verificada_en && ` (${new Date(solicitud.identidad_verificada_en).toLocaleDateString('es-MX')})`}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-amber-800">
              ⚠ Identidad sin verificar. No podrás marcar esta solicitud como "Aprobada" ni "Atendida" hasta
              confirmar que verificaste quién es realmente el solicitante (por teléfono, en persona, u otro medio
              propio de la clínica — SIRO no hace esta verificación automáticamente).
            </p>
            <Input
              placeholder='Ej. "Llamada al teléfono registrado del paciente"'
              value={metodoVerificacion}
              onChange={(e) => setMetodoVerificacion(e.target.value)}
              className="text-sm"
            />
            <Button variante="secundario" onClick={handleVerificar} disabled={verificando}>
              {verificando ? 'Guardando…' : 'Marcar identidad como verificada'}
            </Button>
          </div>
        )}
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Estado</span>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {ESTADOS_ARCO.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO[e]}</option>)}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Respuesta</span>
        <textarea
          value={respuesta}
          onChange={(e) => setRespuesta(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Lo que le comunicaste al solicitante…"
        />
      </label>

      <Button onClick={handleGuardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</Button>
    </div>
  )
}
