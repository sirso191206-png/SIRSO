import { supabase } from '../lib/supabase'
import {
  obtenerCitasHoy,
  contarPacientesAtendidosHoy,
  contarPacientesEnEspera,
  contarCitasPendientesConfirmar
} from './dashboard'

const ESTADOS_FINALES = ['completada', 'cancelada', 'no_asistio']
const ESTADOS_EN_COLA = ['pendiente_confirmar', 'agendada', 'confirmada', 'en_espera']
const ROLES_CON_ALERTAS = ['owner', 'dentista']

export async function obtenerMiDia(perfil) {
  const esDentista = perfil.rol === 'dentista'
  const dentistaId = esDentista ? perfil.id : undefined
  const puedeVerAlertas = ROLES_CON_ALERTAS.includes(perfil.rol)

  let citasHoy = await obtenerCitasHoy()
  if (esDentista) {
    citasHoy = citasHoy.filter((c) => c.dentista_id === perfil.id)
  }

  const pacienteActual = citasHoy.find((c) => c.estado === 'en_consulta') ?? null
  const siguientes = citasHoy.filter((c) => ESTADOS_EN_COLA.includes(c.estado))
  const restantes = citasHoy.filter((c) => !ESTADOS_FINALES.includes(c.estado)).length

  let alertasPacienteActual = null
  let ultimaConsultaPacienteActual = null

  if (pacienteActual && puedeVerAlertas) {
    const { data: expediente } = await supabase
      .from('expedientes')
      .select('alergias, enfermedades')
      .eq('paciente_id', pacienteActual.paciente_id)
      .maybeSingle()
    alertasPacienteActual = {
      alergias: expediente?.alergias ?? [],
      enfermedades: expediente?.enfermedades ?? []
    }

    const { data: consultaPrevia } = await supabase
      .from('citas')
      .select('inicio')
      .eq('paciente_id', pacienteActual.paciente_id)
      .eq('estado', 'completada')
      .lt('inicio', new Date().toISOString())
      .order('inicio', { ascending: false })
      .limit(1)
      .maybeSingle()
    ultimaConsultaPacienteActual = consultaPrevia?.inicio ?? null
  }

  const [atendidos, enEspera, porConfirmar] = await Promise.all([
    contarPacientesAtendidosHoy(dentistaId),
    contarPacientesEnEspera(dentistaId),
    contarCitasPendientesConfirmar(dentistaId)
  ])

  return {
    pacienteActual,
    alertasPacienteActual,
    ultimaConsultaPacienteActual,
    siguientes,
    resumen: {
      total: citasHoy.length,
      atendidos,
      enEspera,
      porConfirmar,
      restantes
    }
  }
}
