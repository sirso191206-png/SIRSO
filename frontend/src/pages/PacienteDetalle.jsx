import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { calcularEdad } from '../lib/fechas'
import { usePacienteDetalle } from '../hooks/usePacienteDetalle'
import { useExpediente } from '../hooks/useExpediente'
import { useAuthStore } from '../store/useAuthStore'
import { Odontograma } from '../components/odontograma/Odontograma'
import { TabExpediente } from '../components/expediente/TabExpediente'
import { TabTratamientos } from '../components/tratamientos/TabTratamientos'
import { TabResumen } from '../components/paciente/TabResumen'
import { TabDatosGenerales } from '../components/paciente/TabDatosGenerales'
import { TabHistorial } from '../components/paciente/TabHistorial'
import { TabArchivos } from '../components/paciente/TabArchivos'
import { TabDocumentosClinicos } from '../components/documentos/TabDocumentosClinicos'
import { imprimirExpedienteCompleto } from '../components/expediente/imprimirExpedienteCompleto'
import { toastError } from '../store/useToastStore'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { ConfirmModal } from '../components/ui/ConfirmModal'

const TODAS_LAS_TABS = [
  { nombre: 'Resumen', roles: ['owner', 'dentista'] },
  { nombre: 'Datos generales', roles: ['owner', 'dentista', 'recepcion', 'asistente'] },
  { nombre: 'Historial', roles: ['owner', 'dentista'] },
  { nombre: 'Odontograma', roles: ['owner', 'dentista'] },
  { nombre: 'Plan', roles: ['owner', 'dentista', 'recepcion', 'asistente'] },
  { nombre: 'Documentos clínicos', roles: ['owner', 'dentista'] },
  { nombre: 'Archivos', roles: ['owner', 'dentista'] }
]

export function PacienteDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    paciente,
    procesando,
    iniciandoConsulta,
    handleArchivar,
    handleRestaurar,
    handleIniciarConsulta,
    recargarPaciente
  } = usePacienteDetalle(id)
  const [modalArchivar, setModalArchivar] = useState(false)
  const [modalExpedienteCompleto, setModalExpedienteCompleto] = useState(false)
  const [menuAcciones, setMenuAcciones] = useState(false)
  const [imprimiendoExpediente, setImprimiendoExpediente] = useState(false)
  const perfil = useAuthStore((s) => s.perfil)
  const { expediente } = useExpediente(id)

  const handleImprimirExpediente = async () => {
    setMenuAcciones(false)
    setImprimiendoExpediente(true)
    try {
      await imprimirExpedienteCompleto({ paciente, clinicaId: perfil.clinica_id })
    } catch (err) {
      toastError('No se pudo generar el expediente para imprimir: ' + err.message)
    } finally {
      setImprimiendoExpediente(false)
    }
  }

  // El hook ya maneja sus propios errores (no relanza), así que este
  // wrapper siempre llega al finally — igual que el comportamiento
  // original, que cerraba el modal tanto al archivar con éxito como
  // si fallaba.
  const handleArchivarYCerrarModal = async () => {
    try {
      await handleArchivar()
    } finally {
      setModalArchivar(false)
    }
  }

  const tabsVisibles = TODAS_LAS_TABS.filter((t) => t.roles.includes(perfil?.rol))
  const [tab, setTab] = useState(null)

  useEffect(() => {
    if (!tab && tabsVisibles.length > 0) {
      setTab(tabsVisibles[0].nombre)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil?.rol])

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
                  {puedeIniciarConsulta && (
                    <button
                      onClick={handleImprimirExpediente}
                      disabled={imprimiendoExpediente}
                      className="block w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {imprimiendoExpediente ? 'Preparando…' : 'Imprimir expediente completo'}
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
      {tab === 'Datos generales' && <TabDatosGenerales paciente={paciente} alGuardar={recargarPaciente} />}
      {tab === 'Odontograma' && <Odontograma pacienteId={id} onIrATab={setTab} />}
      {tab === 'Plan' && <TabTratamientos pacienteId={id} paciente={paciente} />}
      {tab === 'Documentos clínicos' && <TabDocumentosClinicos pacienteId={id} paciente={paciente} />}
      {tab === 'Archivos' && <TabArchivos pacienteId={id} />}

      <Modal abierto={modalExpedienteCompleto} onCerrar={() => setModalExpedienteCompleto(false)} titulo="Expediente completo" ancho="grande">
        <TabExpediente pacienteId={id} />
      </Modal>

      <ConfirmModal
        abierto={modalArchivar}
        onCerrar={() => setModalArchivar(false)}
        onConfirmar={handleArchivarYCerrarModal}
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
