import { useEffect, useState } from 'react'
import { SeccionDesplegable } from '../ui/SeccionDesplegable'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { toastExito, toastError } from '../../store/useToastStore'
import { useFuncionalidad, useFuncionalidadDeLaClinica } from '../../hooks/useFuncionalidad'
import {
  obtenerConfigReserva, guardarConfigReserva, listarServiciosReserva,
  crearServicioReserva, actualizarServicioReserva, eliminarServicioReserva
} from '../../services/reservaEnLinea'
import {
  CONFIG_RESERVA_INICIAL, DIAS_SEMANA, INTERVALOS_RESERVA, ZONAS_HORARIAS_MX, LIMITES_RESERVA,
  validarConfigReserva, validarServicioReserva, sugerirSlug, enlacePublicoReserva
} from '../../lib/reservaEnLinea'

const SELECT = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm'
const hhmm = (t) => (t ?? '').slice(0, 5)

// Configuración de la reserva en línea (solo el owner; la base de datos lo exige igual). Las solicitudes que llegan se
// confirman o rechazan desde la Agenda.
export function SeccionReservaEnLinea({ clinicaId, nombreClinica }) {
  const disponible = useFuncionalidad('reserva_en_linea')
  const incluidaEnLaClinica = useFuncionalidadDeLaClinica('reserva_en_linea')
  const [abierta, setAbierta] = useState(false)
  const [cfg, setCfg] = useState(null)
  const [guardada, setGuardada] = useState(false)
  const [servicios, setServicios] = useState([])
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [nuevo, setNuevo] = useState({ nombre: '', duracion_min: 30 })
  const [erroresServicio, setErroresServicio] = useState({})

  useEffect(() => {
    if (!abierta || !disponible || cfg) return
    Promise.all([obtenerConfigReserva(), listarServiciosReserva()])
      .then(([c, s]) => {
        setGuardada(!!c)
        setCfg(c
          ? { ...c, hora_apertura: hhmm(c.hora_apertura), hora_cierre: hhmm(c.hora_cierre), mensaje: c.mensaje ?? '' }
          : { ...CONFIG_RESERVA_INICIAL, slug: sugerirSlug(nombreClinica) })
        setServicios(s)
      })
      .catch((err) => toastError('No se pudo cargar la reserva en línea: ' + err.message))
  }, [abierta, disponible, cfg, nombreClinica])

  const resumen = !disponible
    ? 'No incluida en tu plan'
    : cfg?.activa && guardada ? `Activa — ${enlacePublicoReserva(cfg.slug)}` : 'Tus pacientes solicitan cita desde un enlace; tú la confirmas en la Agenda'

  const cambiar = (campo) => (e) => setCfg((c) => ({ ...c, [campo]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const alternarDia = (valor) => setCfg((c) => ({
    ...c, dias_semana: c.dias_semana.includes(valor) ? c.dias_semana.filter((d) => d !== valor) : [...c.dias_semana, valor]
  }))

  const guardar = async (e) => {
    e.preventDefault()
    const nuevos = validarConfigReserva(cfg)
    setErrores(nuevos)
    if (Object.keys(nuevos).length > 0) return
    if (cfg.activa && !servicios.some((s) => s.activo)) {
      setErrores({ servicios: 'Agrega al menos un servicio activo antes de activar la reserva en línea.' })
      return
    }
    setGuardando(true)
    try {
      const g = await guardarConfigReserva(clinicaId, cfg)
      setCfg({ ...g, hora_apertura: hhmm(g.hora_apertura), hora_cierre: hhmm(g.hora_cierre), mensaje: g.mensaje ?? '' })
      setGuardada(true)
      toastExito(g.activa ? 'Reserva en línea activa.' : 'Configuración guardada (la reserva en línea está desactivada).')
    } catch (err) {
      toastError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const agregarServicio = async (e) => {
    e.preventDefault()
    const nuevos = validarServicioReserva(nuevo)
    setErroresServicio(nuevos)
    if (Object.keys(nuevos).length > 0) return
    try {
      const s = await crearServicioReserva(nuevo)
      setServicios((l) => [...l, s])
      setNuevo({ nombre: '', duracion_min: 30 })
    } catch (err) {
      toastError(err.message)
    }
  }

  const alternarServicio = async (s) => {
    try {
      await actualizarServicioReserva(s.id, { activo: !s.activo })
      setServicios((l) => l.map((x) => (x.id === s.id ? { ...x, activo: !s.activo } : x)))
    } catch (err) {
      toastError(err.message)
    }
  }

  const quitarServicio = async (s) => {
    try {
      await eliminarServicioReserva(s.id)
      setServicios((l) => l.filter((x) => x.id !== s.id))
    } catch (err) {
      toastError(err.message)
    }
  }

  const copiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(enlacePublicoReserva(cfg.slug))
      toastExito('Enlace copiado.')
    } catch {
      toastError('No se pudo copiar; selecciónalo y cópialo a mano.')
    }
  }

  return (
    <SeccionDesplegable id="reserva-en-linea" titulo="Reserva en línea" resumen={resumen} abierta={abierta} onCambiar={setAbierta}>
      {!disponible && (
        <p className="text-sm text-slate-500">
          Tu plan actual no incluye la reserva en línea. Con ella tus pacientes eligen día y hora libres desde un enlace y tú
          confirmas la cita desde la Agenda.
        </p>
      )}
      {disponible && !incluidaEnLaClinica && (
        // Solo lo ve el superadmin (que puede configurarla aunque el plan no la incluya): sin la funcionalidad, el enlace
        // público responde «no disponible» aunque aquí esté activa.
        <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          El plan de esta clínica no incluye la reserva en línea: el enlace público mostrará «no disponible». Actívala para
          esta clínica en Administración → la clínica → Ajustar condiciones (Funcionalidades), o cambia su plan.
        </p>
      )}
      {disponible && !cfg && <p className="text-sm text-slate-400">Cargando…</p>}
      {disponible && cfg && (
        <div className="max-w-xl space-y-6">
          <form onSubmit={guardar} className="space-y-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={!!cfg.activa} onChange={cambiar('activa')} />
              Aceptar solicitudes de cita en línea
            </label>

            <div>
              <Input label="Enlace público" value={cfg.slug} onChange={cambiar('slug')} maxLength={LIMITES_RESERVA.slug} placeholder="mi-clinica" />
              <p className="mt-1 break-all text-xs text-slate-500">{enlacePublicoReserva(cfg.slug || '…')}</p>
              {errores.slug && <p className="mt-1 text-xs text-clinico-rojo">{errores.slug}</p>}
              {guardada && cfg.activa && (
                <button type="button" onClick={copiarEnlace} className="mt-1 text-xs font-medium text-clinico-azul hover:underline">Copiar enlace</button>
              )}
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Días de atención</span>
              <div className="flex flex-wrap gap-2">
                {DIAS_SEMANA.map((d) => (
                  <label key={d.valor} className="flex items-center gap-1 text-sm text-slate-700">
                    <input type="checkbox" checked={cfg.dias_semana.includes(d.valor)} onChange={() => alternarDia(d.valor)} /> {d.corto}
                  </label>
                ))}
              </div>
              {errores.dias_semana && <p className="mt-1 text-xs text-clinico-rojo">{errores.dias_semana}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input label="Abre" type="time" value={cfg.hora_apertura} onChange={cambiar('hora_apertura')} />
              <Input label="Cierra" type="time" value={cfg.hora_cierre} onChange={cambiar('hora_cierre')} />
            </div>
            {errores.horario && <p className="text-xs text-clinico-rojo">{errores.horario}</p>}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Horarios cada</span>
                <select value={cfg.intervalo_min} onChange={cambiar('intervalo_min')} className={SELECT}>
                  {INTERVALOS_RESERVA.map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </label>
              <Input label="Aviso mínimo (horas)" type="number" min={0} max={720} value={cfg.anticipacion_min_horas} onChange={cambiar('anticipacion_min_horas')} />
              <Input label="Hasta (días adelante)" type="number" min={1} max={180} value={cfg.anticipacion_max_dias} onChange={cambiar('anticipacion_max_dias')} />
            </div>
            {(errores.anticipacion_min_horas || errores.anticipacion_max_dias) && (
              <p className="text-xs text-clinico-rojo">{errores.anticipacion_min_horas || errores.anticipacion_max_dias}</p>
            )}

            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Zona horaria</span>
              <select value={cfg.zona_horaria} onChange={cambiar('zona_horaria')} className={SELECT}>
                {ZONAS_HORARIAS_MX.map((z) => <option key={z.valor} value={z.valor}>{z.etiqueta}</option>)}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Mensaje para el paciente (opcional)</span>
              <textarea value={cfg.mensaje} onChange={cambiar('mensaje')} maxLength={LIMITES_RESERVA.mensaje} rows={2}
                placeholder="Ej. Llega 10 minutos antes y trae tu identificación." className={SELECT} />
            </label>

            {errores.servicios && <p className="text-xs text-clinico-rojo">{errores.servicios}</p>}
            <Button type="submit" disabled={guardando} className="w-full">{guardando ? 'Guardando…' : 'Guardar reserva en línea'}</Button>
          </form>

          <div className="border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Servicios que se pueden reservar</p>
            {servicios.length === 0 && <p className="mb-2 text-sm text-slate-400">Aún no hay servicios.</p>}
            <ul className="mb-3 space-y-2">
              {servicios.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className={s.activo ? 'text-slate-700' : 'text-slate-400 line-through'}>{s.nombre} · {s.duracion_min} min</span>
                  <span className="flex gap-3">
                    <button type="button" onClick={() => alternarServicio(s)} className="text-xs font-medium text-clinico-azul hover:underline">
                      {s.activo ? 'Pausar' : 'Reactivar'}
                    </button>
                    <button type="button" onClick={() => quitarServicio(s)} className="text-xs font-medium text-clinico-rojo hover:underline">Quitar</button>
                  </span>
                </li>
              ))}
            </ul>
            <form onSubmit={agregarServicio} className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
              <Input label="Servicio" value={nuevo.nombre} maxLength={LIMITES_RESERVA.servicio} onChange={(e) => setNuevo((n) => ({ ...n, nombre: e.target.value }))} placeholder="Limpieza dental" />
              <Input label="Minutos" type="number" min={10} max={240} value={nuevo.duracion_min} onChange={(e) => setNuevo((n) => ({ ...n, duracion_min: e.target.value }))} />
              <Button type="submit" variante="secundario">Agregar</Button>
            </form>
            {(erroresServicio.nombre || erroresServicio.duracion_min) && (
              <p className="mt-1 text-xs text-clinico-rojo">{erroresServicio.nombre || erroresServicio.duracion_min}</p>
            )}
          </div>
        </div>
      )}
    </SeccionDesplegable>
  )
}
