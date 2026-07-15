import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { obtenerPaciente, archivarPaciente, restaurarPaciente } from '../services/pacientes'
import { actualizarCita } from '../services/citas'
import { supabase } from '../lib/supabase'
import { useExpediente } from '../hooks/useExpediente'
import { useAuthStore } from '../store/useAuthStore'
import { toastExito, toastError } from '../store/useToastStore'
import { Odontograma } from '../components/odontograma/Odontograma'
import { TabExpediente } from '../components/expediente/TabExpediente'
import { TabTratamientos } from '../components/tratamientos/TabTratamientos'
import { TabResumen } from '../components/paciente/TabResumen'
import { TabHistorial } from '../components/paciente/TabHistorial'
import { TabArchivos } from '../components/paciente/TabArchivos'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { ConfirmModal } from '../components/ui/ConfirmModal'

const TODAS_LAS_TABS = [
  { nombre: 'Resumen', roles: ['owner', 'dentista'] },
  { nombre: 'Historial', roles: ['owner', 'dentista'] },
  { nombre: 'Odontograma', roles: ['owner', 'dentista'] },
  { nombre: 'Plan', roles: ['owner', 'dentista', 'recepcion', 'asistente'] },
  { nombre: 'Archivos', roles: ['owner', 'dentista'] }
]

const ESTADOS_INICIABLES = ['pendiente_confirmar', 'agendada', 'confirmada', 'en_espera']

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null
  const hoy = new Date()
  const nacimiento = new Date(fechaNacimiento)
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const m = hoy.getMonth() - nacimiento.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--
  return edad
}

export function PacienteDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [paciente, setPaciente] = useState(null)
  const [modalArchivar, setModalArchivar] = useState(false)
  const [modalExpedienteCompleto, setModalExpedienteCompleto] = useState(false)
  const [menuAcciones, setMenuAcciones] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [iniciandoConsulta, setIniciandoConsulta] = useState(false)
  const perfil = useAuthStore((s) => s.perfil)
  const { expediente } = useExpediente(id)

  const tabsVisibles = TODAS_LAS_TABS.filter((t) => t.roles.includes(perfil?.rol))
  const [tab, setTab] = useState(null)

  useEffect(() => {
    if (!tab && tabsVisibles.length > 0) {
      setTab(tabsVisibles[0].nombre)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil?.rol])

  const recargarPaciente = () => obtenerPaciente(id).then(setPaciente)

  useEffect(() => {
    recargarPaciente()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleArchivar = async () => {
    setProcesando(true)
    try {
      await archivarPaciente(id)
      toastExito('Paciente archivado. Su historial sigue intacto, solo se ocultó de la lista.')
      navigate('/pacientes')
    } catch (err) {
      toastError('No se pudo archivar: ' + err.message)
    } finally {
      setProcesando(false)
      setModalArchivar(false)
    }
  }

  const handleRestaurar = async () => {
    setProcesando(true)
    try {
      await restaurarPaciente(id)
      toastExito('Paciente restaurado.')
      await recargarPaciente()
    } catch (err) {
      toastError('No se pudo restaurar: ' + err.message)
    } finally {
      setProcesando(false)
    }
  }

  const handleIniciarConsulta = async () => {
    setIniciandoConsulta(true)
    try {
      const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0)
      const finHoy = new Date(inicioHoy); finHoy.setDate(finHoy.getDate() + 1)
      const { data: citasHoy, error } = await supabase
        .from('citas')
        .select('id, estado')
        .eq('paciente_id', id)
        .gte('inicio', inicioHoy.toISOString())
        .lt('inicio', finHoy.toISOString())
        .order('inicio')
      if (error) throw error

      const citaIniciable = citasHoy.find((c) => ESTADOS_INICIABLES.includes(c.estado))
      if (!citaIniciable) {
        toastError('Este paciente no tiene una cita agendada para hoy.')
        return
      }
      await actualizarCita(citaIniciable.id, { estado: 'en_consulta' })
      toastExito('Consulta iniciada.')
      navigate(`/consulta/${citaIniciable.id}`)
    } catch (err) {
      toastError(err.message)
    } finally {
      setIniciandoConsulta(false)
    }
  }

  if (!paciente || !tab) return <SkeletonFichaPaciente />

  const edad = calcularEdad(paciente.fecha_nacimiento)
  const alergias = expediente?.alergias ?? []
  const puedeIniciarConsulta = ['owner', 'dentista'].includes(perfil?.rol)

  return (
    <div>
      {paciente.archivado_en && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-600">
          <span>Este paciente está archivado desde el {new Date(paciente.archivado_en).toLocaleDateString('es-MX')}.</span>
          {perfil?.rol === 'owner' && (
            <button onClick={handleRestaurar} disabled={procesando} className="font-medium text-clinico-azul hover:underline">
              {procesando ? 'Restaurando…' : 'Restaurar'}
            </button>
          )}
        </div>
      )}

      {/* Encabezado permanente */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">{paciente.nombre_completo}</h1>
            <p className="text-sm text-slate-500">
              {paciente.numero_expediente && <span className="font-mono text-slate-400">{paciente.numero_expediente}</span>}
              {edad !== null && ` · ${edad} años`}
              {' · '}{paciente.telefono}
            </p>
            {alergias.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {alergias.map((a, i) => (
                  <span key={i} className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-clinico-rojo">
                    ⚠ {a.sustancia}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {puedeIniciarConsulta && (
              <Button onClick={handleIniciarConsulta} disabled={iniciandoConsulta}>
                {iniciandoConsulta ? 'Iniciando…' : 'Iniciar consulta'}
              </Button>
            )}
            <Button variante="secundario" onClick={() => navigate('/agenda')}>Nueva cita</Button>
            <Button variante="secundario" onClick={() => setTab('Plan')}>Registrar pago</Button>
            <div className="relative">
              <Button variante="secundario" onClick={() => setMenuAcciones(!menuAcciones)}>Más acciones ▾</Button>
              {menuAcciones && (
                <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  {puedeIniciarConsulta && (
                    <button
                      onClick={() => { setModalExpedienteCompleto(true); setMenuAcciones(false) }}
                      className="block w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
                    >
                      Ver expediente completo
                    </button>
                  )}
                  {perfil?.rol === 'owner' && !paciente.archivado_en && (
                    <button
                      onClick={() => { setModalArchivar(true); setMenuAcciones(false) }}
                      className="block w-full px-3 py-2 text-left text-sm text-clinico-rojo hover:bg-red-50"
                    >
                      Archivar paciente
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 flex gap-2 border-b border-slate-200">
        {tabsVisibles.map((t) => (
          <button
            key={t.nombre}
            onClick={() => setTab(t.nombre)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t.nombre ? 'border-b-2 border-clinico-azul text-clinico-azul' : 'text-slate-500'
            }`}
          >
            {t.nombre}
          </button>
        ))}
      </div>

      {tab === 'Resumen' && (
        <TabResumen
          pacienteId={id}
          onIrA={setTab}
          onNuevaConsulta={puedeIniciarConsulta ? handleIniciarConsulta : undefined}
          iniciandoConsulta={iniciandoConsulta}
        />
      )}
      {tab === 'Historial' && <TabHistorial pacienteId={id} />}
      {tab === 'Odontograma' && <Odontograma pacienteId={id} />}
      {tab === 'Plan' && <TabTratamientos pacienteId={id} paciente={paciente} />}
      {tab === 'Archivos' && <TabArchivos pacienteId={id} />}

      <Modal abierto={modalExpedienteCompleto} onCerrar={() => setModalExpedienteCompleto(false)} titulo="Expediente completo" ancho="grande">
        <TabExpediente pacienteId={id} />
      </Modal>

      <ConfirmModal
        abierto={modalArchivar}
        onCerrar={() => setModalArchivar(false)}
        onConfirmar={handleArchivar}
        confirmando={procesando}
        titulo="Archivar paciente"
        mensaje={`¿Seguro que deseas archivar a ${paciente.nombre_completo}? Su expediente, tratamientos, pagos y archivos se conservan intactos — solo deja de aparecer en la lista de pacientes. Puedes restaurarlo cuando quieras.`}
        textoConfirmar="Archivar"
      />
    </div>
  )
}

function SkeletonFichaPaciente() {
  return (
    <div>
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="mb-6 flex gap-4 border-b border-slate-200 pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-4 w-16 animate-pulse rounded bg-slate-100" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
    </div>
  )
}
