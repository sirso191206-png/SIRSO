import { obtenerPaciente } from './pacientes'
import { obtenerExpediente, obtenerNotasClinicas } from './expedientes'
import { obtenerTratamientos } from './tratamientos'
import { obtenerRecetas } from './recetas'
import { obtenerConsentimientos } from './consentimientos'
import { obtenerSignosVitales } from './signosVitales'
import { registrarEvento } from './auditoriaEventos'

// Reúne la información del paciente en un solo objeto — reutiliza
// exactamente las mismas funciones que ya usa cada pestaña del
// expediente, no duplica ninguna consulta nueva. Registra el evento
// de auditoría (DATA_EXPORTED) antes de devolver los datos, no
// después — así queda registrado el intento incluso si algo más
// adelante falla.
export async function exportarDatosPaciente(pacienteId, { usuarioId, clinicaId, motivo } = {}) {
  await registrarEvento('DATA_EXPORTED', {
    entidad: 'pacientes',
    entidadId: pacienteId,
    clinicaId,
    detalle: { formato: 'json', motivo: motivo ?? null }
  })

  const paciente = await obtenerPaciente(pacienteId)
  const expediente = await obtenerExpediente(pacienteId).catch(() => null)

  const [notas, tratamientos, recetas, consentimientos, signosVitales] = await Promise.all([
    expediente ? obtenerNotasClinicas(expediente.id).catch(() => []) : Promise.resolve([]),
    obtenerTratamientos(pacienteId).catch(() => []),
    obtenerRecetas(pacienteId).catch(() => []),
    obtenerConsentimientos(pacienteId).catch(() => []),
    obtenerSignosVitales(pacienteId).catch(() => [])
  ])

  return {
    exportado_en: new Date().toISOString(),
    exportado_por: usuarioId ?? null,
    paciente,
    expediente,
    notas_clinicas: notas,
    tratamientos,
    recetas,
    consentimientos_informados: consentimientos,
    signos_vitales: signosVitales
  }
}

export function descargarComoJson(datos, nombreArchivo) {
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreArchivo
  enlace.click()
  URL.revokeObjectURL(url)
}
