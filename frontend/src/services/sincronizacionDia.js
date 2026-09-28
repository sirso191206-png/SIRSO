import { obtenerCitasRango, obtenerCitaPorId } from './citas'
import { obtenerPaciente } from './pacientes'
import { obtenerExpediente, obtenerNotasClinicas, obtenerDiagnosticosFrecuentes } from './expedientes'
import { obtenerOdontogramaCompleto } from './odontograma'
import { obtenerPeriodontogramaCompleto } from './periodontograma'
import { obtenerTratamientos } from './tratamientos'
import { obtenerRecetas } from './recetas'
import { obtenerSignosVitales } from './signosVitales'
import { guardarMetadato, leerMetadato } from '../lib/cacheLectura'

const CLAVE_ULTIMA_SINCRONIZACION = 'ultima_sincronizacion_dia'

// "Sincronizar mi día" no es un mecanismo aparte — es llamar, uno por
// uno, a las mismas funciones que ya usa cada pantalla (todas ya
// cacheadas, ver services/*.js). El único propósito de esto es
// adelantar esas llamadas MIENTRAS hay internet, para que cuando se
// pierda la conexión a media jornada, ya esté todo guardado.
//
// dentistaId es opcional: si quien sincroniza es owner/recepción y
// quiere preparar el día completo de la clínica (no solo el suyo), se
// omite y trae las citas de todos los dentistas.
export async function sincronizarMiDia({ dentistaId } = {}) {
  const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0)
  const finHoy = new Date(inicioHoy); finHoy.setDate(finHoy.getDate() + 1)

  const citas = await obtenerCitasRango({
    dentistaId,
    desde: inicioHoy.toISOString(),
    hasta: finHoy.toISOString()
  })

  // Además de la lista del día, se cachea cada cita por su propio id
  // — es lo que usa /consulta/:citaId al abrir una en concreto, un
  // dato distinto del listado general del día.
  await Promise.allSettled(citas.map((c) => obtenerCitaPorId(c.id)))

  const idsPacientesUnicos = [...new Set(citas.map((c) => c.paciente_id))]

  let expedientesOk = 0
  let odontogramasOk = 0
  let periodontogramasOk = 0

  await Promise.allSettled(
    idsPacientesUnicos.map(async (pacienteId) => {
      await obtenerPaciente(pacienteId).catch(() => {})

      const expediente = await obtenerExpediente(pacienteId).catch(() => null)
      if (expediente) {
        expedientesOk++
        await obtenerNotasClinicas(expediente.id).catch(() => {})
      }

      await obtenerOdontogramaCompleto(pacienteId).then(() => { odontogramasOk++ }).catch(() => {})
      await obtenerPeriodontogramaCompleto(pacienteId).then(() => { periodontogramasOk++ }).catch(() => {})
      await obtenerTratamientos(pacienteId).catch(() => {})
      await obtenerRecetas(pacienteId).catch(() => {})
      await obtenerSignosVitales(pacienteId).catch(() => {})
    })
  )

  // Clínica completa, no por paciente — las sugerencias de diagnóstico
  // frecuente durante la consulta.
  await obtenerDiagnosticosFrecuentes().catch(() => {})

  const resultado = {
    citas: citas.length,
    pacientes: idsPacientesUnicos.length,
    expedientes: expedientesOk,
    odontogramas: odontogramasOk,
    periodontogramas: periodontogramasOk,
    sincronizadoEn: new Date().toISOString()
  }

  await guardarMetadato(CLAVE_ULTIMA_SINCRONIZACION, resultado)
  return resultado
}

export async function obtenerUltimaSincronizacion() {
  return leerMetadato(CLAVE_ULTIMA_SINCRONIZACION)
}
