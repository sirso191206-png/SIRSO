import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { useMiDia } from '../hooks/useMiDia'
import { toastExito, toastError } from '../store/useToastStore'
import { capitalizarPrimeraLetra } from '../lib/texto'
import { ColaDeEspera } from '../components/ColaDeEspera'
import { ModalNuevaUrgencia } from '../components/ModalNuevaUrgencia'
import { Button } from '../components/ui/Button'

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
        <h1 className="mb-6 text-2xl font-semibold text-slate-800">
          {saludo()}, {perfil?.nombre?.split(' ')[0]}
        </h1>
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">
            {saludo()}, {perfil?.nombre?.split(' ')[0]}
          </h1>
          <p className="text-sm text-slate-500">{fechaHoy}</p>
        </div>
        <div className="flex gap-2">
          <Button variante="secundario" onClick={() => navigate('/pacientes')}>+ Nuevo paciente</Button>
          <Button variante="secundario" onClick={() => navigate('/agenda')}>+ Nueva cita</Button>
          <Button onClick={() => setModalUrgenciaAbierto(true)}>+ Nueva urgencia</Button>
        </div>
      </div>

      <PacienteActualCard
        cita={datos.pacienteActual}
        alertas={datos.alertasPacienteActual}
        ultimaConsulta={datos.ultimaConsultaPacienteActual}
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

function PacienteActualCard({ cita, alertas, ultimaConsulta, onFinalizar }) {
  const navigate = useNavigate()
  const [procesando, setProcesando] = useState(false)

  if (!cita) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
        No hay ningún paciente en consulta en este momento.
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
    <div className="rounded-xl border-2 border-clinico-azul bg-clinico-azulClaro/40 p-5">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-clinico-azul">Paciente actual</div>
      <h2 className="text-xl font-semibold text-slate-800">{cita.paciente?.nombre_completo}</h2>

      <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-2">
        <span>
          Horario: {new Date(cita.inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} – {new Date(cita.fin).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {cita.motivo_consulta && <span>Motivo: {cita.motivo_consulta}</span>}
        {ultimaConsulta && <span>Última consulta: {new Date(ultimaConsulta).toLocaleDateString('es-MX')}</span>}
      </div>

      {(alergias.length > 0 || enfermedades.length > 0) && (
        <div className="mt-3 rounded-lg bg-white p-3 text-sm">
          {alergias.map((a, i) => (
            <div key={`a-${i}`} className="text-clinico-rojo">⚠ Alergia: {a.sustancia} ({a.severidad})</div>
          ))}
          {enfermedades.map((e, i) => (
            <div key={`e-${i}`} className="text-clinico-ambar">{e}</div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variante="secundario" onClick={() => navigate(`/pacientes/${cita.paciente_id}`)}>Ver expediente</Button>
        <Button variante="secundario" onClick={() => navigate(`/consulta/${cita.id}`)}>Continuar consulta</Button>
        <Button onClick={handleFinalizar} disabled={procesando}>{procesando ? 'Guardando…' : 'Finalizar consulta'}</Button>
      </div>
    </div>
  )
}

function ResumenDelDia({ resumen }) {
  const items = [
    { etiqueta: 'Citas totales', valor: resumen.total },
    { etiqueta: 'Pacientes atendidos', valor: resumen.atendidos },
    { etiqueta: 'Pacientes en espera', valor: resumen.enEspera },
    { etiqueta: 'Citas por confirmar', valor: resumen.porConfirmar },
    { etiqueta: 'Citas restantes', valor: resumen.restantes }
  ]

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Resumen del día</h2>
      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.etiqueta} className="flex justify-between text-sm">
            <span className="text-slate-500">{it.etiqueta}</span>
            <span className="font-semibold text-slate-800">{it.valor}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
