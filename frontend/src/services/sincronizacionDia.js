import { obtenerCitasRangoConEstado, obtenerCitaPorId } from './citas'
import { obtenerMiDia } from './miDia'
import { obtenerHorariosBloqueados } from './horariosBloqueados'
import { obtenerListaEspera } from './listaEspera'
import { listarDentistas } from './usuarios'
import { obtenerPaciente } from './pacientes'
import { obtenerExpediente, obtenerNotasClinicas, obtenerDiagnosticosFrecuentes } from './expedientes'
import { obtenerOdontogramaCompleto } from './odontograma'
import { obtenerPeriodontogramaCompleto } from './periodontograma'
import { obtenerTratamientos } from './tratamientos'
import { obtenerRecetas } from './recetas'
import { obtenerSignosVitales } from './signosVitales'
import { guardarMetadato, leerMetadato } from '../lib/cacheLectura'

const CLAVE_ULTIMA_SINCRONIZACION = 'ultima_sincronizacion_dia'

// La precarga del día (que se dispara sola, sin botón) no es un mecanismo aparte — es llamar, uno por
// uno, a las mismas funciones que ya usa cada pantalla (todas ya
// cacheadas, ver services/*.js). El único propósito de esto es
// adelantar esas llamadas MIENTRAS hay internet, para que cuando se
// pierda la conexión a media jornada, ya esté todo guardado.
//
// dentistaId es opcional: si quien sincroniza es owner/recepción y
// quiere preparar el día completo de la clínica (no solo el suyo), se
// omite y trae las citas de todos los dentistas.
export async function sincronizarMiDia({ dentistaId, perfil, sucursalId } = {}) {
  const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0)
  const finHoy = new Date(inicioHoy); finHoy.setDate(finHoy.getDate() + 1)

  // Sincronizar significa traer datos FRESCOS. Como las lecturas ahora
  // caen a la caché cuando falla la red, aquí se exige que esta primera
  // lectura sea real: si viene de caché no hay conexión y NO se puede
  // reportar "sincronizado" (sería un éxito falso).
  const { datos: citas, deCache } = await obtenerCitasRangoConEstado({
    dentistaId,
    sucursalId,
    desde: inicioHoy.toISOString(),
    hasta: finHoy.toISOString()
  })
  if (deCache) {
    throw new Error('Sin conexión: no se pudo traer información actualizada.')
  }

  // Pantalla "Mi día" (resumen, cola de espera, alertas) — se precarga
  // completa para poder abrirla sin internet.
  if (perfil) {
    const mi = await obtenerMiDia(perfil)
    if (mi.deCache) throw new Error('Sin conexión: no se pudo traer información actualizada.')
  }

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

  // Lo demás que la Agenda del día muestra junto a las citas: horarios
  // bloqueados del mismo rango, lista de espera y filtro de dentistas.
  await Promise.allSettled([
    obtenerHorariosBloqueados({ desde: inicioHoy.toISOString(), hasta: finHoy.toISOString() }),
    obtenerListaEspera(),
    listarDentistas()
  ])

  // Clínica completa, no por paciente — las sugerencias de diagnóstico
  // frecuente durante la consulta.
  await obtenerDiagnosticosFrecuentes().catch(() => {})

  const resultado = {
    citas: citas.length,
    pacientes: idsPacientesUnicos.length,
    expedientes: expedientesOk,
    odontogramas: odontogramasOk,
    periodontogramas: periodontogramasOk,
    // Para qué sucursal se precargó: si la persona cambia de sucursal hay que volver a hacerlo.
    sucursalId: sucursalId ?? null,
    sincronizadoEn: new Date().toISOString()
  }

  await guardarMetadato(CLAVE_ULTIMA_SINCRONIZACION, resultado)
  return resultado
}

export async function obtenerUltimaSincronizacion() {
  return leerMetadato(CLAVE_ULTIMA_SINCRONIZACION)
}
