import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { obtenerCitaPorId, actualizarCita, crearCita } from '../services/citas'
import { obtenerDiagnosticosFrecuentes, crearNotaClinica } from '../services/expedientes'
import { useExpediente } from './useExpediente'
import { useTratamientos } from './useTratamientos'
import { useCatalogoTratamientos } from './useCatalogoTratamientos'
import { useSignosVitales } from './useSignosVitales'
import { useRecetas } from './useRecetas'
import { useAuthStore } from '../store/useAuthStore'
import { useSucursalStore } from '../store/useSucursalStore'
import { toastExito, toastError } from '../store/useToastStore'
import { encolarOperacion } from '../lib/colaOffline'

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
  const [modalReceta, setModalReceta] = useState(false)

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
  const [signosVitalesForm, setSignosVitalesForm] = useState({
    presion_sistolica: '', presion_diastolica: '', frecuencia_cardiaca: '',
    frecuencia_respiratoria: '', temperatura: '', saturacion_oxigeno: '', peso: '', estatura: ''
  })
  const [guardandoSignosVitales, setGuardandoSignosVitales] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardandoBorrador, setGuardandoBorrador] = useState(false)
  const [finalizada, setFinalizada] = useState(false)

  const { expediente } = useExpediente(cita?.paciente_id)
  const { tratamientos, agregar: agregarTratamiento } = useTratamientos(cita?.paciente_id)
  const { catalogo } = useCatalogoTratamientos()
  const { registros: signosVitales, agregar: agregarSignosVitales } = useSignosVitales(cita?.paciente_id)
  const { recetas, agregar: agregarReceta } = useRecetas(cita?.paciente_id)

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

  // Convierte cada campo numérico vacío a null en vez de guardar ''
  // (que Postgres rechazaría en una columna integer/numeric) — solo se
  // envían los campos que sí se llenaron, ninguno inventado.
  const guardarSignosVitalesForm = async () => {
    const campos = Object.fromEntries(
      Object.entries(signosVitalesForm).map(([clave, valor]) => [clave, valor === '' ? null : Number(valor)])
    )
    if (Object.values(campos).every((v) => v === null)) {
      toastError('Captura al menos un signo vital.')
      return
    }
    setGuardandoSignosVitales(true)
    try {
      await agregarSignosVitales({ ...campos, registrado_por: perfil.id })
      setSignosVitalesForm({
        presion_sistolica: '', presion_diastolica: '', frecuencia_cardiaca: '',
        frecuencia_respiratoria: '', temperatura: '', saturacion_oxigeno: '', peso: '', estatura: ''
      })
      toastExito('Signos vitales guardados.')
    } catch (err) {
      toastError('No se pudieron guardar los signos vitales: ' + err.message)
    } finally {
      setGuardandoSignosVitales(false)
    }
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
      if (!navigator.onLine) {
        if (!expediente) throw new Error('El expediente todavía está cargando, espera un momento e intenta de nuevo.')

        // Solo se encola la nota — el motivo de la cita se guarda de
        // verdad hasta que se finalice la consulta (handleFinalizar lo
        // manda siempre, con el valor más reciente de `motivo`, esté
        // en memoria desde antes o se haya escrito apenas ahora). No
        // se pierde nada: guardar un borrador no completa la consulta,
        // así que el motivo sigue disponible en este mismo formulario
        // hasta que sí se finalice.
        const id = crypto.randomUUID()
        const notaClinica = {
          id,
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
          hallazgos: hallazgos || null,
          creado_en: new Date().toISOString()
        }
        await encolarOperacion({
          id,
          tipo: 'crear_nota_clinica',
          entidad: 'notas_clinicas',
          entidadId: id,
          payload: notaClinica,
          creado_en: Date.now(),
          usuarioId: perfil?.id ?? null,
          clinicaId: perfil?.clinica_id ?? null,
          sucursalId: useSucursalStore.getState().sucursalActualId,
          claveIdempotencia: id
        })
        toastExito('Borrador guardado sin conexión — se subirá solo cuando vuelva la señal.')
        return
      }
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
    // Se valida ANTES de decidir online/offline — un seguimiento
    // incompleto es un error del formulario, no algo que dependa de si
    // hay conexión.
    if (programarSeguimiento && (!seguimiento.fecha || !seguimiento.hora)) {
      toastError('Falta la fecha u hora del seguimiento.')
      return
    }

    setGuardando(true)
    try {
      if (!navigator.onLine) {
        if (!expediente) throw new Error('El expediente todavía está cargando, espera un momento e intenta de nuevo.')

        // Mismos ids generados en el navegador que ya usan las notas y
        // piezas encoladas — reintentar la subida nunca duplica nada.
        const notaClinica = {
          id: crypto.randomUUID(),
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
          hallazgos: hallazgos || null,
          creado_en: new Date().toISOString()
        }

        let seguimientoPayload = null
        if (programarSeguimiento) {
          const inicioDate = new Date(`${seguimiento.fecha}T${seguimiento.hora}`)
          const finDate = new Date(inicioDate.getTime() + Number(seguimiento.duracion) * 60000)
          seguimientoPayload = {
            id: crypto.randomUUID(),
            paciente_id: cita.paciente_id,
            dentista_id: cita.dentista_id,
            inicio: inicioDate.toISOString(),
            fin: finDate.toISOString(),
            motivo_consulta: seguimiento.motivo || 'Seguimiento',
            estado: 'agendada'
          }
        }

        await encolarOperacion({
          id: `finalizar_consulta_${cita.id}`,
          tipo: 'finalizar_consulta',
          entidad: 'citas',
          entidadId: cita.id,
          payload: { citaId: cita.id, motivo, notaClinica, seguimientoPayload, actualizadoEnEsperado: cita.actualizado_en },
          creado_en: Date.now(),
          usuarioId: perfil?.id ?? null,
          clinicaId: perfil?.clinica_id ?? null,
          sucursalId: useSucursalStore.getState().sucursalActualId,
          claveIdempotencia: `finalizar_consulta_${cita.id}`
        })

        setFinalizada(true)
        toastExito('Consulta guardada sin conexión — se subirá sola cuando vuelva la señal.')
        navigate('/')
        return
      }

      await guardarNotaYMotivo()

      // Se completa la cita actual ANTES de crear el seguimiento — no
      // al revés. Mientras esta cita siga en un estado que el
      // constraint de traslapes considera "activo" (en_consulta,
      // agendada, etc.), un seguimiento para un horario cercano al
      // actual choca legítimamente contra ella. Una vez completada,
      // deja de contar como ocupación del horario del dentista.
      await actualizarCita(cita.id, { estado: 'completada' })

      if (programarSeguimiento) {
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
    modalReceta,
    setModalReceta,
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
    signosVitales,
    signosVitalesForm,
    setSignosVitalesForm,
    guardandoSignosVitales,
    guardarSignosVitalesForm,
    recetas,
    agregarReceta,
    perfil,
    aplicarPlantillaNota,
    agregarFraseRapida,
    handleGuardarBorrador,
    handleFinalizar,
    PLANTILLAS_NOTA
  }
}
