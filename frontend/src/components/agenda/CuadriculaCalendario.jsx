import { useEffect, useRef, useState } from 'react'
import { HORA_INICIO, HORA_FIN, ALTO_HORA, infoEstado, ESTADOS_FINALES } from './constantes'
import { capitalizarPrimeraLetra } from '../../lib/texto'

const ALTO_TOTAL = (HORA_FIN - HORA_INICIO) * ALTO_HORA

function horaDecimal(fechaISO) {
  const d = new Date(fechaISO)
  return d.getHours() + d.getMinutes() / 60
}

function snapA15Min(minutosDesdeInicio) {
  return Math.round(minutosDesdeInicio / 15) * 15
}

export function CuadriculaCalendario({ dias, citas, bloqueos, onClickCita, onDropCita, onClickSlot }) {
  const [horaActual, setHoraActual] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setHoraActual(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  const horas = Array.from({ length: HORA_FIN - HORA_INICIO }, (_, i) => HORA_INICIO + i)

  return (
    <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="w-14 shrink-0 border-r border-slate-100">
        <div className="h-12 border-b border-slate-100" />
        {horas.map((h) => (
          <div key={h} style={{ height: ALTO_HORA }} className="relative border-b border-slate-50 text-right">
            <span className="absolute -top-2 right-1 text-[10px] text-slate-400">
              {h.toString().padStart(2, '0')}:00
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-1 overflow-x-auto">
        {dias.map((dia) => (
          <ColumnaDia
            key={dia.toISOString()}
            dia={dia}
            horas={horas}
            citas={citas.filter((c) => new Date(c.inicio).toDateString() === dia.toDateString())}
            bloqueos={bloqueos.filter((b) => {
              const inicioDia = new Date(dia); inicioDia.setHours(0, 0, 0, 0)
              const finDia = new Date(inicioDia); finDia.setDate(finDia.getDate() + 1)
              return new Date(b.inicio) < finDia && new Date(b.fin) > inicioDia
            })}
            horaActual={horaActual}
            onClickCita={onClickCita}
            onDropCita={onDropCita}
            onClickSlot={onClickSlot}
            multiDia={dias.length > 1}
          />
        ))}
      </div>
    </div>
  )
}

function ColumnaDia({ dia, horas, citas, bloqueos, horaActual, onClickCita, onDropCita, onClickSlot, multiDia }) {
  const columnaRef = useRef(null)
  const esHoy = dia.toDateString() === horaActual.toDateString()
  const [arrastrandoSobre, setArrastrandoSobre] = useState(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setArrastrandoSobre(false)
    const citaId = e.dataTransfer.getData('citaId')
    const duracionMin = Number(e.dataTransfer.getData('duracionMin'))
    if (!citaId || !columnaRef.current) return

    const rect = columnaRef.current.getBoundingClientRect()
    const yRelativo = e.clientY - rect.top
    const minutosDesdeInicio = snapA15Min((yRelativo / ALTO_HORA) * 60)
    const nuevaFecha = new Date(dia)
    nuevaFecha.setHours(HORA_INICIO, 0, 0, 0)
    nuevaFecha.setMinutes(nuevaFecha.getMinutes() + minutosDesdeInicio)

    onDropCita(citaId, nuevaFecha, duracionMin)
  }

  const handleClickVacio = (e) => {
    if (e.target !== columnaRef.current) return
    const rect = columnaRef.current.getBoundingClientRect()
    const yRelativo = e.clientY - rect.top
    const minutosDesdeInicio = snapA15Min((yRelativo / ALTO_HORA) * 60)
    const fecha = new Date(dia)
    fecha.setHours(HORA_INICIO, 0, 0, 0)
    fecha.setMinutes(fecha.getMinutes() + minutosDesdeInicio)
    onClickSlot?.(fecha)
  }

  return (
    <div className={`relative flex-1 ${multiDia ? 'min-w-[130px]' : 'min-w-[280px]'} ${esHoy ? 'bg-clinico-azulClaro/20' : ''}`}>
      <div className="flex h-12 flex-col items-center justify-center border-b border-l border-slate-100 text-xs">
        <span className={`font-semibold ${esHoy ? 'text-clinico-azul' : 'text-slate-700'}`}>
          {capitalizarPrimeraLetra(dia.toLocaleDateString('es-MX', { weekday: 'short' }))}
        </span>
        <span className={esHoy ? 'text-clinico-azul' : 'text-slate-400'}>{dia.getDate()}</span>
      </div>

      <div
        ref={columnaRef}
        className={`relative border-l border-slate-100 ${arrastrandoSobre ? 'bg-clinico-azulClaro/40' : ''}`}
        style={{ height: ALTO_TOTAL }}
        onDragOver={(e) => { e.preventDefault(); setArrastrandoSobre(true) }}
        onDragLeave={() => setArrastrandoSobre(false)}
        onDrop={handleDrop}
        onClick={handleClickVacio}
      >
        {horas.map((h, i) => (
          <div key={h} className="absolute left-0 right-0 border-b border-slate-50" style={{ top: i * ALTO_HORA }} />
        ))}

        {bloqueos.map((b) => (
          <BloqueHorarioBloqueado key={b.id} bloqueo={b} dia={dia} />
        ))}

        {citas.map((c) => (
          <BloqueCita key={c.id} cita={c} onClick={() => onClickCita(c)} />
        ))}

        {esHoy && <LineaHoraActual horaActual={horaActual} />}
      </div>
    </div>
  )
}

function BloqueCita({ cita, onClick }) {
  const info = infoEstado(cita.estado)
  const top = (horaDecimal(cita.inicio) - HORA_INICIO) * ALTO_HORA
  const duracionMin = (new Date(cita.fin) - new Date(cita.inicio)) / 60000
  const alto = Math.max((duracionMin / 60) * ALTO_HORA, 22)
  const finalizada = ESTADOS_FINALES.includes(cita.estado)

  return (
    <div
      draggable={!finalizada}
      onDragStart={(e) => {
        e.dataTransfer.setData('citaId', cita.id)
        e.dataTransfer.setData('duracionMin', String(duracionMin))
      }}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{ top, height: alto, backgroundColor: info.fondo, borderLeftColor: info.color }}
      className="absolute left-0.5 right-0.5 z-10 overflow-hidden rounded border-l-4 px-1.5 py-0.5 text-left shadow-sm hover:z-20 hover:shadow-md"
    >
      <div className="truncate text-[11px] font-semibold" style={{ color: info.texto }}>
        {new Date(cita.inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · {cita.paciente?.nombre_completo}
      </div>
      {alto > 34 && (
        <div className="truncate text-[10px]" style={{ color: info.texto }}>
          {cita.motivo_consulta || cita.dentista?.nombre}
        </div>
      )}
    </div>
  )
}

function BloqueHorarioBloqueado({ bloqueo, dia }) {
  const inicioDia = new Date(dia); inicioDia.setHours(HORA_INICIO, 0, 0, 0)
  const finDia = new Date(dia); finDia.setHours(HORA_FIN, 0, 0, 0)

  const inicioEfectivo = new Date(Math.max(new Date(bloqueo.inicio), inicioDia))
  const finEfectivo = new Date(Math.min(new Date(bloqueo.fin), finDia))
  if (finEfectivo <= inicioEfectivo) return null

  const top = (horaDecimal(inicioEfectivo) - HORA_INICIO) * ALTO_HORA
  const alto = (horaDecimal(finEfectivo) - horaDecimal(inicioEfectivo)) * ALTO_HORA

  return (
    <div
      style={{
        top,
        height: alto,
        backgroundImage: 'repeating-linear-gradient(45deg, #F1F5F9, #F1F5F9 6px, #E2E8F0 6px, #E2E8F0 12px)'
      }}
      className="absolute left-0 right-0 z-0 flex items-center justify-center border-y border-slate-200 px-1 text-[10px] text-slate-400"
    >
      {bloqueo.titulo || bloqueo.tipo}
    </div>
  )
}

function LineaHoraActual({ horaActual }) {
  const top = (horaActual.getHours() + horaActual.getMinutes() / 60 - HORA_INICIO) * ALTO_HORA
  if (top < 0 || top > ALTO_TOTAL) return null
  return (
    <div className="absolute left-0 right-0 z-30 flex items-center" style={{ top }}>
      <div className="h-2 w-2 rounded-full bg-clinico-rojo" />
      <div className="h-px flex-1 bg-clinico-rojo" />
    </div>
  )
}
