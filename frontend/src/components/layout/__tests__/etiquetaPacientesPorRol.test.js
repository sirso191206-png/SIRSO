import { describe, it, expect } from 'vitest'
import { etiquetaPacientesPorRol } from '../Sidebar'

describe('etiquetaPacientesPorRol — la navegación refleja lo que RLS ya filtra', () => {
  it('owner ve "Pacientes" (todos los de su clínica)', () => {
    expect(etiquetaPacientesPorRol('owner')).toBe('Pacientes')
  })

  it('dentista ve "Mis pacientes" (solo los asignados)', () => {
    expect(etiquetaPacientesPorRol('dentista')).toBe('Mis pacientes')
  })

  it('asistente ve "Pacientes asignados"', () => {
    expect(etiquetaPacientesPorRol('asistente')).toBe('Pacientes asignados')
  })

  it('recepción ve "Buscar pacientes" (administrativo, no expediente clínico)', () => {
    expect(etiquetaPacientesPorRol('recepcion')).toBe('Buscar pacientes')
  })

  it('un rol desconocido/indefinido cae a "Pacientes" en vez de romperse', () => {
    expect(etiquetaPacientesPorRol(undefined)).toBe('Pacientes')
    expect(etiquetaPacientesPorRol('rol_inexistente')).toBe('Pacientes')
  })
})
