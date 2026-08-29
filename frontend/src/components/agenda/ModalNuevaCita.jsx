import { useEffect, useState } from 'react'
import { usePacientes } from '../../hooks/usePacientes'
import { useSucursales } from '../../hooks/useSucursales'
import { listarConsultorios, listarSillones } from '../../services/sucursales'
import { useAuthStore } from '../../store/useAuthStore'
import { useSucursalStore } from '../../store/useSucursalStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { ESTADOS_CITA, TIPOS_CONSULTA, DURACIONES_RAPIDAS } from './constantes'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

export function ModalNuevaCita({ abierto, onCerrar, onAgendar, dentistas, fechaInicial }) {
  const perfil = useAuthStore((s) => s.perfil)
  const sucursalActualId = useSucursalStore((s) => s.sucursalActualId)
  const { sucursales } = useSucursales()
  const sucursalesActivas = sucursales.filter((s) => s.activa)

  const [termino, setTermino] = useState('')
  const { pacientes } = usePacientes(termino)

  const [pacienteId, setPacienteId] = useState('')
  const [dentistaId, setDentistaId] = useState(perfil?.rol === 'dentista' ? perfil.id : '')
  const [fecha, setFecha] = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [duracionMin, setDuracionMin] = useState(30)
  const [motivoConsulta, setMotivoConsulta] = useState('')
  const [tipoConsulta, setTipoConsulta] = useState('primera_vez')
  const [estadoInicial, setEstadoInicial] = useState('pendiente_confirmar')
  const [notas, setNotas] = useState('')
  const [consultorio, setConsultorio] = useState('')
  const [recordatorio, setRecordatorio] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorLocal, setErrorLocal] = useState(null)

  // Selección estructurada de sucursal/consultorio/sillón — solo tiene
  // sentido si la clínica ya creó sucursales. Se precarga con la
  // sucursal actualmente elegida en el selector del menú, si hay una.
  const [sucursalId, setSucursalId] = useState(sucursalActualId ?? '')
  const [consultorioId, setConsultorioId] = useState('')
  const [sillonId, setSillonId] = useState('')
  const [consultoriosDeLaSucursal, setConsultoriosDeLaSucursal] = useState([])
  const [sillonesDelConsultorio, setSillonesDelConsultorio] = useState([])

  useEffect(() => {
    if (abierto) setSucursalId(sucursalActualId ?? '')
  }, [abierto, sucursalActualId])

  useEffect(() => {
    setConsultorioId('')
    setSillonesDelConsultorio([])
    if (!sucursalId) return setConsultoriosDeLaSucursal([])
    listarConsultorios(sucursalId).then((c) => setConsultoriosDeLaSucursal(c.filter((x) => x.activo)))
  }, [sucursalId])

  useEffect(() => {
    setSillonId('')
    if (!consultorioId) return setSillonesDelConsultorio([])
    listarSillones(consultorioId).then((s) => setSillonesDelConsultorio(s.filter((x) => x.activo)))
  }, [consultorioId])

  useEffect(() => {
    if (abierto && fechaInicial) {
      const f = new Date(fechaInicial)
      setFecha(f.toISOString().slice(0, 10))
      setHoraInicio(f.toTimeString().slice(0, 5))
    }
  }, [abierto, fechaInicial])

  const limpiar = () => {
    setTermino('')
    setPacienteId('')
    setFecha('')
    setHoraInicio('')
    setDuracionMin(30)
    setMotivoConsulta('')
    setTipoConsulta('primera_vez')
    setEstadoInicial('pendiente_confirmar')
    setNotas('')
    setConsultorio('')
    setRecordatorio(false)
    setSucursalId('')
    setConsultorioId('')
    setSillonId('')
    setErrorLocal(null)
  }

  const cerrarYLimpiar = () => {
    limpiar()
    onCerrar()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorLocal(null)

    if (!pacienteId) return setErrorLocal('Selecciona un paciente.')
    if (!dentistaId) return setErrorLocal('Selecciona un dentista.')
    if (!fecha || !horaInicio) return setErrorLocal('Falta la fecha o el horario.')
    if (duracionMin <= 0) return setErrorLocal('La duración debe ser mayor a 0.')

    const inicioDate = new Date(`${fecha}T${horaInicio}`)
    const finDate = new Date(inicioDate.getTime() + duracionMin * 60000)
    if (finDate <= inicioDate) return setErrorLocal('La hora final debe ser posterior a la inicial.')

    setGuardando(true)
    try {
      await onAgendar({
        paciente_id: pacienteId,
        dentista_id: dentistaId,
        inicio: inicioDate.toISOString(),
        fin: finDate.toISOString(),
        motivo_consulta: motivoConsulta || null,
        tipo_consulta: tipoConsulta,
        estado: estadoInicial,
        notas: notas || null,
        consultorio: consultorio || null,
        recordatorio,
        sucursal_id: sucursalId || null,
        consultorio_id: consultorioId || null,
        sillon_id: sillonId || null
      })
      toastExito('Cita creada correctamente.')
      cerrarYLimpiar()
    } catch (err) {
      toastError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={cerrarYLimpiar} titulo="Nueva cita">
      <form onSubmit={handleSubmit} className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
        <Input
          label="Buscar paciente por nombre o teléfono"
          value={termino}
          onChange={(e) => setTermino(e.target.value)}
          placeholder="Escribe para buscar…"
        />
        <select
          value={pacienteId}
          onChange={(e) => setPacienteId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Selecciona un paciente</option>
          {pacientes.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre_completo} · {p.telefono}</option>
          ))}
        </select>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Dentista</span>
          <select
            value={dentistaId}
            onChange={(e) => setDentistaId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Selecciona un dentista</option>
            {dentistas.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </select>
        </label>

        {sucursalesActivas.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Sucursal</span>
              <select
                value={sucursalId}
                onChange={(e) => setSucursalId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
              >
                <option value="">Sin especificar</option>
                {sucursalesActivas.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Consultorio</span>
              <select
                value={consultorioId}
                onChange={(e) => setConsultorioId(e.target.value)}
                disabled={!sucursalId}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm disabled:opacity-50"
              >
                <option value="">—</option>
                {consultoriosDeLaSucursal.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Sillón</span>
              <select
                value={sillonId}
                onChange={(e) => setSillonId(e.target.value)}
                disabled={!consultorioId}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm disabled:opacity-50"
              >
                <option value="">—</option>
                {sillonesDelConsultorio.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input label="Fecha" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <Input label="Hora de inicio" type="time" required value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Duración</span>
          <div className="flex flex-wrap gap-2">
            {DURACIONES_RAPIDAS.map((d) => (
              <button
                key={d.minutos}
                type="button"
                onClick={() => setDuracionMin(d.minutos)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  duracionMin === d.minutos ? 'border-clinico-azul bg-clinico-azulClaro text-clinico-azul' : 'border-slate-300 text-slate-600'
                }`}
              >
                {d.label}
              </button>
            ))}
            <input
              type="number"
              min="5"
              step="5"
              value={duracionMin}
              onChange={(e) => setDuracionMin(Number(e.target.value))}
              className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              placeholder="Personalizado"
            />
          </div>
        </div>

        <Input label="Motivo de consulta" value={motivoConsulta} onChange={(e) => setMotivoConsulta(e.target.value)} placeholder="Ej. Dolor en pieza 36" />

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Tipo de consulta</span>
            <select value={tipoConsulta} onChange={(e) => setTipoConsulta(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {TIPOS_CONSULTA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Estado inicial</span>
            <select value={estadoInicial} onChange={(e) => setEstadoInicial(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {ESTADOS_CITA.filter((e) => !['completada', 'cancelada', 'no_asistio', 'en_consulta'].includes(e.value)).map((e) => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
          </label>
        </div>

        <Input label="Consultorio o sillón (opcional)" value={consultorio} onChange={(e) => setConsultorio(e.target.value)} placeholder="Ej. Sillón 1" />

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Notas (opcional)</span>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={recordatorio} onChange={(e) => setRecordatorio(e.target.checked)} />
          Enviar recordatorio al paciente
        </label>

        {errorLocal && <p className="text-sm text-clinico-rojo">{errorLocal}</p>}

        <Button type="submit" disabled={guardando} className="w-full">
          {guardando ? 'Agendando…' : 'Agendar'}
        </Button>
      </form>
    </Modal>
  )
}
