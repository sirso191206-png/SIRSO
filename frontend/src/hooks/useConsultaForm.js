import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { obtenerCitaPorId, actualizarCita, crearCita } from '../services/citas'
import { obtenerDiagnosticosFrecuentes, crearNotaClinica } from '../services/expedientes'
import { useExpediente } from './useExpediente'
import { useTratamientos } from './useTratamientos'
import { useCatalogoTratamientos } from './useCatalogoTratamientos'
import { useAuthStore } from '../store/useAuthStore'
import { toastExito, toastError } from '../store/useToastStore'

const PLANTILLAS_NOTA = {
  'Consulta general': 'Paciente acude a consulta general. ',
  'Limpieza': 'Se realiza limpieza dental (profilaxis). ',
  'Restauración': 'Se realiza restauración dental. ',
  'Endodoncia': 'Se realiza tratamiento de endodoncia. ',
  'Extracción': 'Se realiza extracción dental. ',
  'Seguimiento': 'Consulta de seguimiento. '
}

// Extraído de ConsultaUnificada.jsx (corte 2B): agrupa el estado del
// formulario de consulta y los handlers de guardado/finalizar, dejando
// el componente como un renderer que solo consume lo que expone.
export function useConsultaForm(citaId) {
  const navigate = useNavigate()
  const perfil = useAuthStore((s) => s.perfil)

  const [cita, setCita] = useState(null)
  const [cargandoCita, setCargandoCita] = useState(true)
  const [diagnosticosFrecuentes, setDiagnosticosFrecuentes] = useState([])
  const [modalExpediente, setModalExpediente] = useState(false)
  const [modalTratamiento, setModalTratamiento] = useState(false)

  const [motivo, setMotivo] = useState('')
  const [hallazgos, setHallazgos] = useState('')
  const [interrogatorioSistemas, setInterrogatorioSistemas] = useState({})
  const [exploracionFisica, setExploracionFisica] = useState({})
  const [diagnostico, setDiagnostico] = useState('')
  const [diagnosticoCie10Codigo, setDiagnosticoCie10Codigo] = useState('')
  const [diagnosticoCie10Descripcion, setDiagnosticoCie10Descripcion] = useState('')
  const [notaContenido, setNotaContenido] = useState('')
  const [accionSaludBucal, setAccionSaludBucal] = useState({})
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
      cita_id: cita.id,
      usuario_id: perfil.id,
      contenido: notaContenido || '(sin nota)',
      tipo: 'consulta',
      diagnostico: diagnostico || null,
      diagnostico_cie10_codigo: diagnosticoCie10Codigo || null,
      diagnostico_cie10_descripcion: diagnosticoCie10Descripcion || null,
      interrogatorio_sistemas: Object.keys(interrogatorioSistemas).length > 0 ? interrogatorioSistemas : null,
      exploracion_fisica: Object.keys(exploracionFisica).length > 0 ? exploracionFisica : null,
      accion_salud_bucal: Object.keys(accionSaludBucal).length > 0 ? accionSaludBucal : null,
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

  return {
    cita,
    cargandoCita,
    diagnosticosFrecuentes,
    modalExpediente,
    setModalExpediente,
    modalTratamiento,
    setModalTratamiento,
    motivo,
    setMotivo,
    hallazgos,
    setHallazgos,
    interrogatorioSistemas,
    setInterrogatorioSistemas,
    exploracionFisica,
    setExploracionFisica,
    diagnostico,
    setDiagnostico,
    diagnosticoCie10Codigo,
    setDiagnosticoCie10Codigo,
    diagnosticoCie10Descripcion,
    setDiagnosticoCie10Descripcion,
    notaContenido,
    setNotaContenido,
    accionSaludBucal,
    setAccionSaludBucal,
    programarSeguimiento,
    setProgramarSeguimiento,
    seguimiento,
    setSeguimiento,
    guardando,
    guardandoBorrador,
    finalizada,
    expediente,
    tratamientos,
    agregarTratamiento,
    catalogo,
    perfil,
    aplicarPlantillaNota,
    agregarFraseRapida,
    handleGuardarBorrador,
    handleFinalizar,
    PLANTILLAS_NOTA
  }
}
