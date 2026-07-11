import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { obtenerCitaPorId, actualizarCita, crearCita } from '../services/citas'
import { obtenerDiagnosticosFrecuentes, crearNotaClinica } from '../services/expedientes'
import { useExpediente } from '../hooks/useExpediente'
import { useTratamientos } from '../hooks/useTratamientos'
import { useCatalogoTratamientos } from '../hooks/useCatalogoTratamientos'
import { useAuthStore } from '../store/useAuthStore'
import { toastExito, toastError } from '../store/useToastStore'
import { Odontograma } from '../components/Odontograma'
import { TabExpediente } from '../components/expediente/TabExpediente'
import { ModalTratamiento } from '../components/tratamientos/TabTratamientos'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'

const MOTIVOS_RAPIDOS = ['Dolor', 'Revisión', 'Limpieza', 'Sensibilidad', 'Seguimiento', 'Urgencia']
const HALLAZGOS_RAPIDOS = ['Sin alteraciones', 'Caries', 'Inflamación', 'Sangrado', 'Sensibilidad', 'Movilidad']

const PLANTILLAS_NOTA = {
  'Consulta general': 'Paciente acude a consulta general. ',
  'Limpieza': 'Se realiza limpieza dental (profilaxis). ',
  'Restauración': 'Se realiza restauración dental. ',
  'Endodoncia': 'Se realiza tratamiento de endodoncia. ',
  'Extracción': 'Se realiza extracción dental. ',
  'Seguimiento': 'Consulta de seguimiento. '
}

const FRASES_RAPIDAS = [
  'Sin dolor', 'Sin alergias conocidas', 'Buena higiene',
  'Sangrado gingival', 'Sensibilidad', 'Evolución favorable', 'Se brindan indicaciones'
]

export function ConsultaUnificada() {
  const { citaId } = useParams()
  const navigate = useNavigate()
  const perfil = useAuthStore((s) => s.perfil)

  const [cita, setCita] = useState(null)
  const [cargandoCita, setCargandoCita] = useState(true)
  const [diagnosticosFrecuentes, setDiagnosticosFrecuentes] = useState([])
  const [modalExpediente, setModalExpediente] = useState(false)
  const [modalTratamiento, setModalTratamiento] = useState(false)

  const [motivo, setMotivo] = useState('')
  const [hallazgos, setHallazgos] = useState('')
  const [diagnostico, setDiagnostico] = useState('')
  const [notaContenido, setNotaContenido] = useState('')
  const [programarSeguimiento, setProgramarSeguimiento] = useState(false)
  const [seguimiento, setSeguimiento] = useState({ fecha: '', hora: '', duracion: 30, motivo: '' })
  const [guardando, setGuardando] = useState(false)
  const [guardandoBorrador, setGuardandoBorrador] = useState(false)
  const [finalizada, setFinalizada] = useState(false)

  const { expediente } = useExpediente(cita?.paciente_id)
  const { tratamientos, agregar: agregarTratamiento } = useTratamientos(cita?.paciente_id)
  const { catalogo } = useCatalogoTratamientos()

  useEffect(() => {
    obtenerCitaPorId(citaId).then((data) => {
      setCita(data)
      setMotivo(data.motivo_consulta ?? '')
      setCargandoCita(false)
    }).catch((err) => {
      toastError('No se pudo cargar la cita: ' + err.message)
      setCargandoCita(false)
    })
    obtenerDiagnosticosFrecuentes().then(setDiagnosticosFrecuentes)
  }, [citaId])

  const aplicarPlantillaNota = (plantilla) => {
    setNotaContenido(PLANTILLAS_NOTA[plantilla])
  }

  const agregarFraseRapida = (frase) => {
    setNotaContenido((actual) => {
      if (actual.includes(frase)) return actual
      return actual ? `${actual.trim()} ${frase}. ` : `${frase}. `
    })
  }

  const guardarNotaYMotivo = async () => {
    if (!expediente) throw new Error('El expediente todavía está cargando, espera un momento e intenta de nuevo.')
    await actualizarCita(cita.id, { motivo_consulta: motivo || null })
    await crearNotaClinica({
      expediente_id: expediente.id,
      usuario_id: perfil.id,
      contenido: notaContenido || '(sin nota)',
      tipo: 'consulta',
      diagnostico: diagnostico || null,
      hallazgos: hallazgos || null
    })
  }

  const handleGuardarBorrador = async () => {
    setGuardandoBorrador(true)
    try {
      await guardarNotaYMotivo()
      toastExito('Borrador guardado. La cita sigue en consulta.')
    } catch (err) {
      toastError('No se pudo guardar: ' + err.message)
    } finally {
      setGuardandoBorrador(false)
    }
  }

  const handleFinalizar = async () => {
    if (finalizada) return // evita doble envío si ya se guardó
    setGuardando(true)
    try {
      await guardarNotaYMotivo()

      if (programarSeguimiento) {
        if (!seguimiento.fecha || !seguimiento.hora) {
          toastError('Falta la fecha u hora del seguimiento.')
          setGuardando(false)
          return
        }
        const inicioDate = new Date(`${seguimiento.fecha}T${seguimiento.hora}`)
        const finDate = new Date(inicioDate.getTime() + Number(seguimiento.duracion) * 60000)
        await crearCita({
          paciente_id: cita.paciente_id,
          dentista_id: cita.dentista_id,
          inicio: inicioDate.toISOString(),
          fin: finDate.toISOString(),
          motivo_consulta: seguimiento.motivo || 'Seguimiento',
          estado: 'agendada'
        })
      }

      await actualizarCita(cita.id, { estado: 'completada' })
      setFinalizada(true)
      toastExito('Consulta guardada correctamente.')
      navigate('/')
    } catch (err) {
      toastError('No se pudo finalizar la consulta: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (cargandoCita || !cita) return <p className="text-slate-400">Cargando consulta…</p>

  if (!['owner', 'dentista'].includes(perfil?.rol)) {
    return <p className="text-slate-400">Esta sección solo está disponible para owner y dentista.</p>
  }

  if (perfil?.rol === 'dentista' && cita.dentista_id !== perfil.id) {
    return <p className="text-slate-400">Esta consulta pertenece a otro dentista — no puedes editarla.</p>
  }

  const alergias = expediente?.alergias ?? []
  const enfermedades = expediente?.enfermedades ?? []
  const medicamentos = expediente?.medicamentos_actuales ?? []

  return (
    <div className="space-y-6 pb-12">
      {/* Encabezado */}
      <div className="rounded-xl border-2 border-clinico-azul bg-clinico-azulClaro/40 p-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-clinico-azul">Consulta</div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">{cita.paciente?.nombre_completo}</h1>
            <p className="text-sm text-slate-500">{cita.paciente?.numero_expediente}</p>
          </div>
          <Button variante="secundario" onClick={() => setModalExpediente(true)}>Ver expediente completo</Button>
        </div>
        {(alergias.length > 0 || enfermedades.length > 0 || medicamentos.length > 0) && (
          <div className="mt-3 space-y-0.5 rounded-lg bg-white p-3 text-sm">
            {alergias.map((a, i) => <div key={`a-${i}`} className="text-clinico-rojo">⚠ Alergia: {a.sustancia} ({a.severidad})</div>)}
            {enfermedades.map((e, i) => <div key={`e-${i}`} className="text-clinico-ambar">{e}</div>)}
            {medicamentos.length > 0 && <div className="text-slate-600">Medicamentos: {medicamentos.join(', ')}</div>}
          </div>
        )}
      </div>

      {/* Sección 1: Motivo */}
      <Seccion titulo="1. Motivo de consulta">
        <BotonesRapidos opciones={MOTIVOS_RAPIDOS} onClick={setMotivo} />
        <Input label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Escribe o elige una opción rápida" />
      </Seccion>

      {/* Sección 2: Hallazgos */}
      <Seccion titulo="2. Hallazgos clínicos">
        <BotonesRapidos opciones={HALLAZGOS_RAPIDOS} onClick={(op) => setHallazgos((actual) => actual.includes(op) ? actual : (actual ? `${actual}, ${op}` : op))} />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Exploración</span>
          <textarea value={hallazgos} onChange={(e) => setHallazgos(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </Seccion>

      {/* Sección 3: Diagnóstico */}
      <Seccion titulo="3. Diagnóstico">
        <input
          list="diagnosticos-frecuentes"
          value={diagnostico}
          onChange={(e) => setDiagnostico(e.target.value)}
          placeholder="Escribe o elige uno frecuente"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <datalist id="diagnosticos-frecuentes">
          {diagnosticosFrecuentes.map((d) => <option key={d} value={d} />)}
        </datalist>
      </Seccion>

      {/* Sección 4: Odontograma rápido */}
      <Seccion titulo="4. Odontograma">
        <Odontograma pacienteId={cita.paciente_id} />
      </Seccion>

      {/* Sección 5: Tratamiento */}
      <Seccion titulo="5. Tratamiento">
        <Button variante="secundario" onClick={() => setModalTratamiento(true)}>+ Agregar tratamiento</Button>
        <div className="mt-3 space-y-2">
          {tratamientos.length === 0 && <p className="text-sm text-slate-400">Sin tratamientos agregados en esta consulta.</p>}
          {tratamientos.slice(0, 5).map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-sm">
              <span>{t.descripcion} {t.pieza_dental && `(pieza ${t.pieza_dental})`}</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">${Number(t.costo).toFixed(2)}</span>
                <Badge estado={t.estado} />
              </div>
            </div>
          ))}
        </div>
      </Seccion>

      {/* Sección 6: Nota clínica */}
      <Seccion titulo="6. Nota clínica">
        <div className="mb-2 flex flex-wrap gap-2">
          {Object.keys(PLANTILLAS_NOTA).map((p) => (
            <button key={p} onClick={() => aplicarPlantillaNota(p)} className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">
              {p}
            </button>
          ))}
        </div>
        <textarea
          value={notaContenido}
          onChange={(e) => setNotaContenido(e.target.value)}
          rows={4}
          placeholder="Nota clínica de la consulta…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {FRASES_RAPIDAS.map((f) => (
            <button key={f} onClick={() => agregarFraseRapida(f)} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200">
              + {f}
            </button>
          ))}
        </div>
      </Seccion>

      {/* Sección 7: Próxima cita */}
      <Seccion titulo="7. Próxima cita">
        <p className="mb-2 text-sm text-slate-600">¿Programar seguimiento?</p>
        <div className="mb-3 flex gap-2">
          <button
            onClick={() => setProgramarSeguimiento(true)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${programarSeguimiento ? 'bg-clinico-azul text-white' : 'border border-slate-300 text-slate-600'}`}
          >
            Sí
          </button>
          <button
            onClick={() => setProgramarSeguimiento(false)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${!programarSeguimiento ? 'bg-clinico-azul text-white' : 'border border-slate-300 text-slate-600'}`}
          >
            No
          </button>
        </div>
        {programarSeguimiento && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Input label="Fecha" type="date" value={seguimiento.fecha} onChange={(e) => setSeguimiento({ ...seguimiento, fecha: e.target.value })} />
            <Input label="Hora" type="time" value={seguimiento.hora} onChange={(e) => setSeguimiento({ ...seguimiento, hora: e.target.value })} />
            <Input label="Duración (min)" type="number" value={seguimiento.duracion} onChange={(e) => setSeguimiento({ ...seguimiento, duracion: e.target.value })} />
            <Input label="Motivo" value={seguimiento.motivo} onChange={(e) => setSeguimiento({ ...seguimiento, motivo: e.target.value })} />
          </div>
        )}
      </Seccion>

      {/* Sección 8: Acciones */}
      <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
        <Button variante="secundario" onClick={handleGuardarBorrador} disabled={guardandoBorrador || guardando}>
          {guardandoBorrador ? 'Guardando…' : 'Guardar borrador'}
        </Button>
        <Button onClick={handleFinalizar} disabled={guardando || guardandoBorrador || finalizada}>
          {guardando ? 'Guardando…' : finalizada ? 'Consulta guardada ✓' : 'Guardar y finalizar consulta'}
        </Button>
      </div>

      <Modal abierto={modalExpediente} onCerrar={() => setModalExpediente(false)} titulo="Expediente completo" ancho="grande">
        <TabExpediente pacienteId={cita.paciente_id} />
      </Modal>

      {modalTratamiento && (
        <ModalTratamiento
          abierto
          onCerrar={() => setModalTratamiento(false)}
          onGuardar={agregarTratamiento}
          catalogo={catalogo}
          perfil={perfil}
          titulo="Agregar tratamiento a esta consulta"
        />
      )}
    </div>
  )
}

function Seccion({ titulo, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{titulo}</h2>
      {children}
    </div>
  )
}

function BotonesRapidos({ opciones, onClick }) {
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {opciones.map((op) => (
        <button key={op} onClick={() => onClick(op)} className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">
          {op}
        </button>
      ))}
      <button onClick={() => onClick('')} className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-400 hover:bg-slate-50">
        Otro
      </button>
    </div>
  )
}
