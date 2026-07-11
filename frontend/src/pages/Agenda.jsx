import { useEffect, useMemo, useState } from 'react'
import { useCitas } from '../hooks/useCitas'
import { useHorariosBloqueados } from '../hooks/useHorariosBloqueados'
import { useListaEspera } from '../hooks/useListaEspera'
import { usePacientes } from '../hooks/usePacientes'
import { listarDentistas } from '../services/usuarios'
import { useAuthStore } from '../store/useAuthStore'
import { toastExito, toastError } from '../store/useToastStore'
import { capitalizarPrimeraLetra } from '../lib/texto'
import { ESTADOS_CITA, TIPOS_BLOQUEO } from '../components/agenda/constantes'
import { MiniCalendario } from '../components/agenda/MiniCalendario'
import { CuadriculaCalendario } from '../components/agenda/CuadriculaCalendario'
import { VistaMes } from '../components/agenda/VistaMes'
import { PanelCita } from '../components/agenda/PanelCita'
import { ModalNuevaCita } from '../components/agenda/ModalNuevaCita'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'

function inicioDeSemanaLunes(fecha) {
  const d = new Date(fecha)
  const dia = d.getDay()
  const diff = d.getDate() - dia + (dia === 0 ? -6 : 1)
  d.setHours(0, 0, 0, 0)
  return new Date(d.setDate(diff))
}

function inicioDeMesGrid(fecha) {
  return inicioDeSemanaLunes(new Date(fecha.getFullYear(), fecha.getMonth(), 1))
}

const PUEDE_GESTIONAR = ['owner', 'recepcion']

export function Agenda() {
  const perfil = useAuthStore((s) => s.perfil)
  const puedeGestionar = PUEDE_GESTIONAR.includes(perfil?.rol)

  const [vista, setVista] = useState('semana') // dia | semana | mes
  const [fechaBase, setFechaBase] = useState(new Date())
  const [filtroDentista, setFiltroDentista] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [dentistas, setDentistas] = useState([])

  const [modalNuevaCita, setModalNuevaCita] = useState(false)
  const [fechaParaNuevaCita, setFechaParaNuevaCita] = useState(null)
  const [citaSeleccionada, setCitaSeleccionada] = useState(null)
  const [modalBloqueo, setModalBloqueo] = useState(false)
  const [modalListaEspera, setModalListaEspera] = useState(false)

  useEffect(() => {
    listarDentistas().then(setDentistas)
  }, [])

  // Rango visible según la vista activa
  const { dias, desde, hasta, titulo } = useMemo(() => {
    if (vista === 'dia') {
      const inicio = new Date(fechaBase)
      inicio.setHours(0, 0, 0, 0)
      const fin = new Date(inicio)
      fin.setDate(fin.getDate() + 1)
      return {
        dias: [inicio],
        desde: inicio.toISOString(),
        hasta: fin.toISOString(),
        titulo: capitalizarPrimeraLetra(inicio.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
      }
    }
    if (vista === 'semana') {
      const inicio = inicioDeSemanaLunes(fechaBase)
      const diasSemana = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(inicio)
        d.setDate(d.getDate() + i)
        return d
      })
      const fin = new Date(inicio)
      fin.setDate(fin.getDate() + 7)
      const finSemana = diasSemana[6]
      const mismoMes = inicio.getMonth() === finSemana.getMonth()
      const tituloRango = mismoMes
        ? `${inicio.getDate()} – ${finSemana.getDate()} de ${capitalizarPrimeraLetra(finSemana.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }))}`
        : `${inicio.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} – ${finSemana.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}`
      return { dias: diasSemana, desde: inicio.toISOString(), hasta: fin.toISOString(), titulo: capitalizarPrimeraLetra(tituloRango) }
    }
    // mes
    const inicioGrid = inicioDeMesGrid(fechaBase)
    const finGrid = new Date(inicioGrid)
    finGrid.setDate(finGrid.getDate() + 42)
    return {
      dias: [],
      desde: inicioGrid.toISOString(),
      hasta: finGrid.toISOString(),
      titulo: capitalizarPrimeraLetra(fechaBase.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }))
    }
  }, [vista, fechaBase])

  const { citas, error, agendar, reagendar, cambiarEstado, desagendar } = useCitas({
    dentistaId: filtroDentista || undefined,
    estado: filtroEstado || undefined,
    desde,
    hasta
  })
  const { bloqueos, agregar: agregarBloqueo } = useHorariosBloqueados({ desde, hasta })
  const { lista: listaEspera, agregar: agregarListaEspera, marcarAtendido } = useListaEspera()

  const cambiarPeriodo = (direccion) => {
    const nueva = new Date(fechaBase)
    if (vista === 'dia') nueva.setDate(nueva.getDate() + direccion)
    else if (vista === 'semana') nueva.setDate(nueva.getDate() + direccion * 7)
    else nueva.setMonth(nueva.getMonth() + direccion)
    setFechaBase(nueva)
  }

  const handleDropCita = async (citaId, nuevoInicio, duracionMin) => {
    const nuevoFin = new Date(nuevoInicio.getTime() + duracionMin * 60000)
    try {
      await reagendar(citaId, { inicio: nuevoInicio.toISOString(), fin: nuevoFin.toISOString() })
      toastExito('Cita movida.')
    } catch (err) {
      toastError(err.message)
    }
  }

  const handleClickSlot = (fecha) => {
    if (!puedeGestionar) return
    setFechaParaNuevaCita(fecha)
    setModalNuevaCita(true)
  }

  const handleClickDiaMes = (dia) => {
    setFechaBase(dia)
    setVista('dia')
  }

  return (
    <div className="flex gap-6">
      <div className="hidden w-56 shrink-0 space-y-4 lg:block">
        <MiniCalendario
          mesVisible={fechaBase}
          fechaSeleccionada={fechaBase}
          onSeleccionar={(d) => { setFechaBase(d); if (vista === 'mes') setVista('dia') }}
          onCambiarMes={(dir) => {
            const n = new Date(fechaBase)
            n.setMonth(n.getMonth() + dir)
            setFechaBase(n)
          }}
        />

        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <label className="block text-xs font-medium text-slate-500">Dentista</label>
          <select
            value={filtroDentista}
            onChange={(e) => setFiltroDentista(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {dentistas.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>

          <label className="block text-xs font-medium text-slate-500">Estado</label>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {ESTADOS_CITA.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </div>

        {puedeGestionar && (
          <div className="space-y-2">
            <button onClick={() => setModalBloqueo(true)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50">
              + Bloquear horario
            </button>
            <button onClick={() => setModalListaEspera(true)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50">
              Lista de espera {listaEspera.length > 0 && `(${listaEspera.length})`}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-800">{titulo}</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-slate-300">
              {[['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setVista(v)}
                  className={`px-3 py-1.5 text-sm font-medium ${vista === v ? 'bg-clinico-azul text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button variante="secundario" onClick={() => cambiarPeriodo(-1)}>←</Button>
            <Button variante="secundario" onClick={() => setFechaBase(new Date())}>Hoy</Button>
            <Button variante="secundario" onClick={() => cambiarPeriodo(1)}>→</Button>
            {puedeGestionar && (
              <Button onClick={() => { setFechaParaNuevaCita(null); setModalNuevaCita(true) }}>+ Nueva cita</Button>
            )}
          </div>
        </div>

        {error && <p className="mb-3 text-sm text-clinico-rojo">{error}</p>}

        {vista === 'mes' ? (
          <VistaMes mes={fechaBase} citas={citas} onClickDia={handleClickDiaMes} />
        ) : (
          <CuadriculaCalendario
            dias={dias}
            citas={citas}
            bloqueos={bloqueos}
            onClickCita={setCitaSeleccionada}
            onDropCita={handleDropCita}
            onClickSlot={puedeGestionar ? handleClickSlot : undefined}
          />
        )}
      </div>

      {citaSeleccionada && (
        <PanelCita
          cita={citas.find((c) => c.id === citaSeleccionada.id) ?? citaSeleccionada}
          onCerrar={() => setCitaSeleccionada(null)}
          onCambiarEstado={cambiarEstado}
          onReagendar={reagendar}
          onDesagendar={desagendar}
        />
      )}

      <ModalNuevaCita
        abierto={modalNuevaCita}
        onCerrar={() => setModalNuevaCita(false)}
        onAgendar={agendar}
        dentistas={dentistas}
        fechaInicial={fechaParaNuevaCita}
      />

      <ModalBloqueoHorario
        abierto={modalBloqueo}
        onCerrar={() => setModalBloqueo(false)}
        onGuardar={agregarBloqueo}
        dentistas={dentistas}
      />

      <ModalListaEspera
        abierto={modalListaEspera}
        onCerrar={() => setModalListaEspera(false)}
        lista={listaEspera}
        onAgregar={agregarListaEspera}
        onMarcarAtendido={marcarAtendido}
        dentistas={dentistas}
      />
    </div>
  )
}

function ModalBloqueoHorario({ abierto, onCerrar, onGuardar, dentistas }) {
  const [tipo, setTipo] = useState('comida')
  const [titulo, setTitulo] = useState('')
  const [dentistaId, setDentistaId] = useState('')
  const [fecha, setFecha] = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFin, setHoraFin] = useState('')
  const [guardando, setGuardando] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const inicio = new Date(`${fecha}T${horaInicio}`)
      const fin = new Date(`${fecha}T${horaFin}`)
      await onGuardar({
        tipo,
        titulo: titulo || null,
        dentista_id: dentistaId || null,
        inicio: inicio.toISOString(),
        fin: fin.toISOString()
      })
      toastExito('Horario bloqueado.')
      onCerrar()
    } catch (err) {
      toastError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Bloquear horario">
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {TIPOS_BLOQUEO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <Input label="Título (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Dentista (opcional — vacío = toda la clínica)</span>
          <select value={dentistaId} onChange={(e) => setDentistaId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Toda la clínica</option>
            {dentistas.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        </label>
        <Input label="Fecha" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Desde" type="time" required value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
          <Input label="Hasta" type="time" required value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
        </div>
        <Button type="submit" disabled={guardando} className="w-full">
          {guardando ? 'Guardando…' : 'Bloquear'}
        </Button>
      </form>
    </Modal>
  )
}

function ModalListaEspera({ abierto, onCerrar, lista, onAgregar, onMarcarAtendido, dentistas }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [termino, setTermino] = useState('')
  const { pacientes } = usePacientes(termino)
  const [pacienteId, setPacienteId] = useState('')
  const [dentistaId, setDentistaId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [disponibilidad, setDisponibilidad] = useState('')
  const [guardando, setGuardando] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!pacienteId) return
    setGuardando(true)
    try {
      await onAgregar({ paciente_id: pacienteId, dentista_id: dentistaId || null, motivo, disponibilidad })
      toastExito('Agregado a la lista de espera.')
      setMostrarForm(false)
      setPacienteId('')
      setMotivo('')
      setDisponibilidad('')
    } catch (err) {
      toastError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Lista de espera">
      <div className="space-y-3">
        {lista.length === 0 && !mostrarForm && <p className="text-sm text-slate-400">Nadie en espera por el momento.</p>}

        {lista.map((l) => (
          <div key={l.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
            <div>
              <div className="font-medium text-slate-800">{l.paciente?.nombre_completo}</div>
              <div className="text-xs text-slate-500">{l.motivo} {l.dentista?.nombre && `· ${l.dentista.nombre}`}</div>
              {l.disponibilidad && <div className="text-xs text-slate-400">Disponibilidad: {l.disponibilidad}</div>}
            </div>
            <button onClick={() => onMarcarAtendido(l.id)} className="text-xs font-medium text-clinico-azul hover:underline">
              Ya se agendó
            </button>
          </div>
        ))}

        {mostrarForm ? (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-200 p-3">
            <Input label="Buscar paciente" value={termino} onChange={(e) => setTermino(e.target.value)} />
            <select value={pacienteId} onChange={(e) => setPacienteId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Selecciona un paciente</option>
              {pacientes.map((p) => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}
            </select>
            <select value={dentistaId} onChange={(e) => setDentistaId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Cualquier dentista</option>
              {dentistas.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
            <Input label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <Input label="Disponibilidad" placeholder="Ej. Lunes y miércoles por la tarde" value={disponibilidad} onChange={(e) => setDisponibilidad(e.target.value)} />
            <Button type="submit" disabled={guardando} className="w-full">{guardando ? 'Guardando…' : 'Agregar'}</Button>
          </form>
        ) : (
          <Button variante="secundario" onClick={() => setMostrarForm(true)} className="w-full">+ Agregar a la lista</Button>
        )}
      </div>
    </Modal>
  )
}
