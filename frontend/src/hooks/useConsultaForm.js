import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { obtenerCitaPorId, actualizarCita, avanzarSiguienteEnEspera } from '../services/citas'
import { finalizarConsulta, completarConsultaPendiente } from '../services/consultas'
import { mensajeErrorFinalizar } from '../lib/finalizarConsulta'
import { obtenerDiagnosticosFrecuentes, crearNotaClinica } from '../services/expedientes'
import { useExpediente } from './useExpediente'
import { useTratamientos } from './useTratamientos'
import { useCatalogoTratamientos } from './useCatalogoTratamientos'
import { useSignosVitales } from './useSignosVitales'
import { useRecetas } from './useRecetas'
import { useAuthStore } from '../store/useAuthStore'
import { useFuncionalidad } from './useFuncionalidad'
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
  // Por qué no cargó la cita (inexistente / sin acceso / sesión / sin conexión): la pantalla lo explica y ofrece reintentar.
  const [errorCita, setErrorCita] = useState(null)
  const [intentoCarga, setIntentoCarga] = useState(0)
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
  // Ids de la nota y del seguimiento, fijados UNA vez por consulta y conservados entre reintentos: si un intento falla o se
  // repite (doble clic, corte de red), el servidor reconoce los mismos ids y no duplica nada.
  const idsConsulta = useRef(null)
  if (idsConsulta.current === null) idsConsulta.current = { nota: crypto.randomUUID(), seguimiento: crypto.randomUUID() }
  // Candado síncrono contra el doble clic: `guardando` (estado) tarda un render en reflejarse; esto no.
  const finalizando = useRef(false)

  const { expediente } = useExpediente(cita?.paciente_id)
  const { tratamientos, agregar: agregarTratamiento, sumarSesion } = useTratamientos(cita?.paciente_id)
  const [registrandoSesion, setRegistrandoSesion] = useState(null)
  const { catalogo } = useCatalogoTratamientos()
  const { registros: signosVitales, agregar: agregarSignosVitales } = useSignosVitales(cita?.paciente_id)
  // La nota clínica de la consulta necesita las funcionalidades "notas_clinicas" y
  // "expediente_clinico" del plan (la base de datos rechaza escribirlas sin ellas).
  // Sin ellas la consulta SE PUEDE cerrar igual: simplemente no se genera nota.
  // OJO: cada hook se llama SIEMPRE (no dentro de un &&): React exige el mismo orden de hooks en cada render.
  const incluyeNotas = useFuncionalidad('notas_clinicas')
  const incluyeExpediente = useFuncionalidad('expediente_clinico')
  const notasIncluidas = incluyeNotas && incluyeExpediente
  const { recetas, agregar: agregarReceta } = useRecetas(cita?.paciente_id)

  useEffect(() => {
    let activo = true
    setCargandoCita(true)
    setErrorCita(null)
    obtenerCitaPorId(citaId).then((data) => {
      if (!activo) return
      setCita(data)
      setMotivo(data.motivo_consulta ?? '')
      setCargandoCita(false)
    }).catch((err) => {
      if (!activo) return
      // Sin cita no hay consulta: NO se queda en "Cargando…" ni se deja finalizar nada. Se explica la causa real.
      setCita(null)
      setErrorCita({ codigo: err?.codigo ?? null, mensaje: err?.message || 'No se pudo cargar la cita.' })
      setCargandoCita(false)
    })
    obtenerDiagnosticosFrecuentes().then(setDiagnosticosFrecuentes).catch(() => {})
    return () => { activo = false }
  }, [citaId, intentoCarga])

  const reintentarCarga = () => setIntentoCarga((n) => n + 1)

  // Sesión realizada en esta consulta: suma la sesión del tratamiento y la base descuenta sus materiales en la misma
  // operación (migración 117). Sin stock suficiente la sesión se registra igual y se avisa (useTratamientos).
  const registrarSesionTratamiento = async (tratamiento) => {
    if (registrandoSesion) return
    setRegistrandoSesion(tratamiento.id)
    try {
      await sumarSesion(tratamiento)
      toastExito(navigator.onLine ? 'Sesión registrada.' : 'Sesión guardada sin conexión: se subirá al reconectar.')
    } catch (err) {
      toastError('No se pudo registrar la sesión: ' + err.message)
    } finally {
      setRegistrandoSesion(null)
    }
  }

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
    if (notasIncluidas && !expediente) throw new Error('El expediente todavía está cargando, espera un momento e intenta de nuevo.')
    await actualizarCita(cita.id, { motivo_consulta: motivo || null })
    if (!notasIncluidas) return
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
        if (!notasIncluidas) {
          // Un borrador ES la nota; sin esa funcionalidad no hay dónde guardarlo.
          toastExito('Tu plan no incluye notas clínicas: el motivo se guarda al finalizar la consulta.')
          return
        }
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

  // La nota de la consulta tal como la entiende el servidor. Sin `expediente_id`/`usuario_id`: el servidor los toma del
  // paciente de la cita y del usuario autenticado (el cliente no decide a quién ni de quién es una nota clínica).
  const armarNotaConsulta = () => ({
    id: idsConsulta.current.nota,
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
  })

  const armarSeguimiento = () => {
    if (!programarSeguimiento) return null
    const inicioDate = new Date(`${seguimiento.fecha}T${seguimiento.hora}`)
    const finDate = new Date(inicioDate.getTime() + Number(seguimiento.duracion) * 60000)
    return {
      id: idsConsulta.current.seguimiento,
      inicio: inicioDate.toISOString(),
      fin: finDate.toISOString(),
      motivo_consulta: seguimiento.motivo || 'Seguimiento'
    }
  }

  // Una cita que ya estaba COMPLETADA (sin nota): aquí se completa la consulta de forma explícita; no se vuelve a "finalizar".
  const modoRecuperacion = cita?.estado === 'completada'

  const handleFinalizar = async () => {
    if (finalizada || finalizando.current) return // ya se guardó, o ya hay un intento en curso (doble clic)
    // Sin la cita cargada no hay nada que finalizar: jamás se declara guardada una consulta que no se pudo leer.
    if (!cita) {
      toastError('La consulta no se ha cargado: no se puede finalizar. Recarga la página e intenta de nuevo.')
      return
    }
    // Se valida ANTES de decidir online/offline — un seguimiento
    // incompleto es un error del formulario, no algo que dependa de si
    // hay conexión.
    if (programarSeguimiento && (!seguimiento.fecha || !seguimiento.hora)) {
      toastError('Falta la fecha u hora del seguimiento.')
      return
    }

    finalizando.current = true
    setGuardando(true)
    try {
      const nota = notasIncluidas ? armarNotaConsulta() : null
      const seguimientoPayload = armarSeguimiento()

      if (modoRecuperacion) {
        // Recuperación: la verificación es del servidor, así que requiere conexión (no se encola nada a ciegas).
        if (!navigator.onLine) throw Object.assign(new Error('Completar una consulta pendiente requiere conexión: la verificación la hace el servidor.'), { local: true })
        if (!nota && !seguimientoPayload) throw Object.assign(new Error('Tu plan no incluye notas clínicas y no pediste un seguimiento: no hay nada que completar.'), { local: true })
        const recuperada = await completarConsultaPendiente({ citaId: cita.id, nota, seguimiento: seguimientoPayload })
        setFinalizada(true)
        toastExito(recuperada?.ya_existia ? 'La consulta ya estaba completa.' : 'Consulta completada: la nota quedó guardada.')
        navigate('/')
        return
      }

      if (!navigator.onLine) {
        // Error LOCAL (no del servidor): se muestra tal cual, no se reemplaza por el mensaje genérico de red/servidor.
        if (notasIncluidas && !expediente) throw Object.assign(new Error('El expediente todavía está cargando, espera un momento e intenta de nuevo.'), { local: true })
        // Sin conexión se encola la MISMA operación que se haría en línea; al sincronizar corre la misma función del
        // servidor (todo o nada, idempotente por los ids de arriba).
        await encolarOperacion({
          id: `finalizar_consulta_${cita.id}`,
          tipo: 'finalizar_consulta',
          entidad: 'citas',
          entidadId: cita.id,
          payload: {
            citaId: cita.id, motivo,
            notaClinica: nota && { ...nota, expediente_id: expediente.id, cita_id: cita.id, usuario_id: perfil.id },
            seguimientoPayload: seguimientoPayload && { ...seguimientoPayload, paciente_id: cita.paciente_id, dentista_id: cita.dentista_id, estado: 'agendada' },
            actualizadoEnEsperado: cita.actualizado_en
          },
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

      // En línea: una sola llamada transaccional (migración 085). Antes eran 3-4 escrituras sueltas desde el navegador,
      // cada una con .single(): un fallo a medias dejaba nota creada y cita completada, y reintentar duplicaba la nota.
      const resultado = await finalizarConsulta({ citaId: cita.id, motivo, nota, seguimiento: seguimientoPayload })

      setFinalizada(true)
      // Administrativo y de mejor esfuerzo: si hay alguien EN ESPERA hoy con este odontólogo, pasa a ser el siguiente en consulta.
      // Un fallo aquí NUNCA afecta a la consulta ya guardada.
      try { await avanzarSiguienteEnEspera({ dentistaId: cita.dentista_id, excluirCitaId: cita.id, sucursalId: cita.sucursal_id, sillonId: cita.sillon_id }) } catch { /* sin efecto sobre la consulta */ }
      // `ya_finalizada` = el servidor ya la tenía guardada (doble clic o respuesta perdida) y VERIFICÓ que coincide con lo enviado.
      toastExito(resultado?.ya_finalizada ? 'La consulta ya estaba guardada correctamente.' : 'Consulta guardada correctamente.')
      navigate('/')
    } catch (err) {
      toastError(err?.local ? err.message : mensajeErrorFinalizar(err))
    } finally {
      finalizando.current = false
      setGuardando(false)
    }
  }

  return {
    cita,
    cargandoCita,
    errorCita,
    reintentarCarga,
    modoRecuperacion,
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
    registrarSesionTratamiento,
    registrandoSesion,
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
