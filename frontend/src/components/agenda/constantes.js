// Horario de trabajo mostrado en la cuadrícula (7:00 a 21:00). Si más
// adelante se necesita por clínica, esto se puede mover a la tabla
// `clinicas` — por ahora es fijo para toda la app.
export const HORA_INICIO = 7
export const HORA_FIN = 21
export const ALTO_HORA = 56 // px por hora en la cuadrícula

export const ESTADOS_CITA = [
  { value: 'pendiente_confirmar', label: 'Pendiente de confirmar', color: '#F97316', fondo: '#FFEDD5', texto: '#9A3412' },
  { value: 'agendada', label: 'Agendada', color: '#3B82F6', fondo: '#DBEAFE', texto: '#1E40AF' },
  { value: 'confirmada', label: 'Confirmada', color: '#22C55E', fondo: '#DCFCE7', texto: '#166534' },
  { value: 'en_espera', label: 'Paciente en espera', color: '#EAB308', fondo: '#FEF9C3', texto: '#854D0E' },
  { value: 'en_consulta', label: 'Paciente en consulta', color: '#A855F7', fondo: '#F3E8FF', texto: '#6B21A8' },
  { value: 'completada', label: 'Completada', color: '#6B7280', fondo: '#F1F5F9', texto: '#475569' },
  { value: 'cancelada', label: 'Cancelada', color: '#FCA5A5', fondo: '#FEE2E2', texto: '#991B1B' },
  { value: 'no_asistio', label: 'No asistió', color: '#DC2626', fondo: '#FEE2E2', texto: '#7F1D1D' }
]

export function infoEstado(estado) {
  return ESTADOS_CITA.find((e) => e.value === estado) ?? ESTADOS_CITA[1]
}

export const ESTADOS_FINALES = ['completada', 'cancelada', 'no_asistio']

export const TIPOS_CONSULTA = [
  { value: 'primera_vez', label: 'Primera vez' },
  { value: 'seguimiento', label: 'Seguimiento' },
  { value: 'urgencia', label: 'Urgencia' },
  { value: 'revision', label: 'Revisión' },
  { value: 'otro', label: 'Otro' }
]

export const DURACIONES_RAPIDAS = [
  { label: '15 min', minutos: 15 },
  { label: '30 min', minutos: 30 },
  { label: '45 min', minutos: 45 },
  { label: '1 hora', minutos: 60 }
]

export const TIPOS_BLOQUEO = [
  { value: 'comida', label: 'Comida' },
  { value: 'descanso', label: 'Descanso' },
  { value: 'vacaciones', label: 'Vacaciones' },
  { value: 'ausencia', label: 'Ausencia' },
  { value: 'otro', label: 'Otro' }
]
