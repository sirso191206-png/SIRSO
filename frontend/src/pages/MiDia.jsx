import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { useMiDia } from '../hooks/useMiDia'
import { toastExito, toastError } from '../store/useToastStore'
import { capitalizarPrimeraLetra } from '../lib/texto'
import { ColaDeEspera } from '../components/ColaDeEspera'
import { ModalNuevaUrgencia } from '../components/ModalNuevaUrgencia'
import { Button } from '../components/ui/Button'

// Mismo lenguaje visual que el Sidebar: SVG inline, sin librerías,
// sin emojis en botones de acción — solo se permite un emoji puntual
// en alertas clínicas (⚠), tal como pide el sistema de diseño.
const svgProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' }
const Icon = {
  userPlus: () => (<svg {...svgProps}><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>),
  calendarPlus: () => (<svg {...svgProps}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M12 14v4M10 16h4" /></svg>),
  zap: () => (<svg {...svgProps}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>),
  clock: () => (<svg {...svgProps}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>),
  folder: () => (<svg {...svgProps}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>),
  play: () => (<svg {...svgProps}><path d="M6 4l14 8-14 8V4z" /></svg>),
  check: () => (<svg {...svgProps}><path d="M5 12l5 5L20 7" /></svg>),
  sparkles: () => (<svg {...svgProps}><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" /><path d="M19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75L19 13z" /></svg>),
  dollar: () => (<svg {...svgProps}><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>),
  inbox: () => (<svg {...svgProps}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" /></svg>)
}

function saludo() {
  const hora = new Date().getHours()
  if (hora < 12) return 'Buenos días'
  if (hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export function MiDia() {
  const perfil = useAuthStore((s) => s.perfil)
  const navigate = useNavigate()
  const { datos, cargando, error, iniciarConsulta, finalizarConsulta } = useMiDia()
  const [modalUrgenciaAbierto, setModalUrgenciaAbierto] = useState(false)
  const [colaVersion, setColaVersion] = useState(0)

  // Recepción no tiene "Mi día" en su flujo (ver menú) — si llega aquí
  // directo por URL, se le manda a donde sí trabaja.
  if (perfil?.rol === 'recepcion') {
    return <Navigate to="/agenda" replace />
  }

  if (cargando || !datos) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-slate-800">
          {saludo()}, {perfil?.nombre?.split(' ')[0]}
        </h1>
        <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    )
  }

  if (error) return <p className="text-clinico-rojo">No se pudo cargar Mi día: {error}</p>

  const fechaHoy = capitalizarPrimeraLetra(
    new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
  )

  const handleIniciarDesdeColaDeEspera = async (turno) => {
    await iniciarConsulta(turno.id)
    navigate(`/consulta/${turno.id}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800">
            {saludo()}, {perfil?.nombre?.split(' ')[0]}
          </h1>
          <p className="text-sm text-slate-500">{fechaHoy}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variante="secundario" onClick={() => navigate('/pacientes')} className="inline-flex items-center gap-1.5">
            <Icon.userPlus /> Nuevo paciente
          </Button>
          <Button variante="secundario" onClick={() => navigate('/agenda')} className="inline-flex items-center gap-1.5">
            <Icon.calendarPlus /> Nueva cita
          </Button>
          <Button onClick={() => setModalUrgenciaAbierto(true)} className="inline-flex items-center gap-1.5">
            <Icon.zap /> Nueva urgencia
          </Button>
        </div>
      </div>

      <PacienteActualCard
        cita={datos.pacienteActual}
        alertas={datos.alertasPacienteActual}
        ultimaConsulta={datos.ultimaConsultaPacienteActual}
        tratamientoActivo={datos.tratamientoActivoPacienteActual}
        saldo={datos.saldoPacienteActual}
        onFinalizar={finalizarConsulta}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ColaDeEspera key={colaVersion} onIniciarConsulta={handleIniciarDesdeColaDeEspera} />
        </div>
        <ResumenDelDia resumen={datos.resumen} />
      </div>

      <ModalNuevaUrgencia
        abierto={modalUrgenciaAbierto}
        onCerrar={() => setModalUrgenciaAbierto(false)}
        onCreada={() => setColaVersion((v) => v + 1)}
      />
    </div>
  )
}

function PacienteActualCard({ cita, alertas, ultimaConsulta, tratamientoActivo, saldo, onFinalizar }) {
  const navigate = useNavigate()
  const [procesando, setProcesando] = useState(false)

  if (!cita) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm">
        <span className="text-slate-300"><Icon.inbox /></span>
        <p className="text-sm text-slate-400">No hay ningún paciente en consulta en este momento.</p>
      </div>
    )
  }

  const handleFinalizar = async () => {
    setProcesando(true)
    try {
      await onFinalizar(cita.id)
      toastExito('Consulta finalizada.')
    } catch (err) {
      toastError(err.message)
    } finally {
      setProcesando(false)
    }
  }

  const alergias = alertas?.alergias ?? []
  const enfermedades = alertas?.enfermedades ?? []

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex items-center gap-2 bg-clinico-azul px-5 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white">
        <span className="h-1.5 w-1.5 rounded-full bg-white" />
        En consulta
        <span className="ml-auto inline-flex items-center gap-1.5 font-medium normal-case tracking-normal text-white/90">
          <Icon.clock />
          {new Date(cita.inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} – {new Date(cita.fin).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="p-5">
        <h2 className="text-xl font-semibold tracking-tight text-slate-800">{cita.paciente?.nombre_completo}</h2>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-slate-500">
          {cita.motivo_consulta && <span>{cita.motivo_consulta}</span>}
          {ultimaConsulta && <span>Última consulta: {new Date(ultimaConsulta).toLocaleDateString('es-MX')}</span>}
        </div>

        {(alergias.length > 0 || enfermedades.length > 0) && (
          <div className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm">
            {alergias.map((a, i) => (
              <div key={`a-${i}`} className="text-clinico-rojo">⚠ Alergia: {a.sustancia} ({a.severidad})</div>
            ))}
            {enfermedades.map((e, i) => (
              <div key={`e-${i}`} className="text-clinico-ambar">{e}</div>
            ))}
          </div>
        )}

        {(tratamientoActivo || saldo) && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {tratamientoActivo && (
              <div className="rounded-xl bg-slate-50/80 p-3 text-sm">
                <div className="flex items-center gap-1.5 text-xs text-slate-400"><Icon.sparkles /> Tratamiento</div>
                <div className="font-medium text-slate-700">{tratamientoActivo.descripcion}</div>
                <div className="text-xs text-slate-400">
                  Sesión {tratamientoActivo.sesiones_completadas} de {tratamientoActivo.numero_sesiones}
                </div>
              </div>
            )}
            {saldo && Number(saldo.total_tratamientos) > 0 && (
              <div className="rounded-xl bg-slate-50/80 p-3 text-sm">
                <div className="flex items-center gap-1.5 text-xs text-slate-400"><Icon.dollar /> Saldo</div>
                <div className={`font-semibold ${saldo.saldo > 0 ? 'text-clinico-ambar' : 'text-clinico-verde'}`}>
                  {saldo.saldo > 0 ? `$${Number(saldo.saldo).toFixed(2)} pendiente` : 'Al corriente'}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variante="secundario" onClick={() => navigate(`/pacientes/${cita.paciente_id}`)} className="inline-flex items-center gap-1.5">
            <Icon.folder /> Ver expediente
          </Button>
          <Button variante="secundario" onClick={() => navigate(`/consulta/${cita.id}`)} className="inline-flex items-center gap-1.5">
            <Icon.play /> Continuar
          </Button>
          <Button onClick={handleFinalizar} disabled={procesando} className="inline-flex items-center gap-1.5">
            <Icon.check /> {procesando ? 'Guardando…' : 'Finalizar consulta'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ResumenDelDia({ resumen }) {
  const items = [
    { etiqueta: 'Citas totales', valor: resumen.total, accionable: false },
    { etiqueta: 'Pacientes atendidos', valor: resumen.atendidos, accionable: false },
    { etiqueta: 'Pacientes en espera', valor: resumen.enEspera, accionable: true },
    { etiqueta: 'Citas por confirmar', valor: resumen.porConfirmar, accionable: true },
    { etiqueta: 'Citas restantes', valor: resumen.restantes, accionable: false }
  ]
  const porcentaje = resumen.total > 0 ? Math.round((resumen.atendidos / resumen.total) * 100) : 0

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold tracking-tight text-slate-800">Resumen del día</h2>

      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
          <span>Atendidos</span>
          <span className="font-medium text-slate-700">{resumen.atendidos} de {resumen.total}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-clinico-azul transition-all duration-150" style={{ width: `${porcentaje}%` }} />
        </div>
      </div>

      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.etiqueta} className="flex items-center justify-between text-sm">
            <span className="text-slate-500">{it.etiqueta}</span>
            <span
              className={
                it.accionable && it.valor > 0
                  ? 'rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800'
                  : 'font-semibold text-slate-800'
              }
            >
              {it.valor}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
