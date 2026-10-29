import { normalizarTelefono } from './telefono'

// Envío del formulario «Nuevo paciente» (pages/Pacientes.jsx). Los campos opcionales que se dejan en blanco llegan como '' y la base
// no los acepta así: fecha_nacimiento es `date` ('' → 22007), sexo tiene un CHECK (M/F/X o NULL) y una curp '' se guardaría como
// texto vacío — el índice único por clínica (idx_pacientes_curp_por_clinica) solo excluye NULL, así que el siguiente paciente sin
// CURP chocaría como «CURP duplicada». Vacío = NULL. No modifica el objeto del formulario.
const OPCIONALES = ['fecha_nacimiento', 'curp', 'sexo', 'primer_apellido', 'segundo_apellido']

export function prepararPacienteNuevo(form) {
  const paciente = { ...form }
  for (const campo of OPCIONALES) {
    const valor = typeof paciente[campo] === 'string' ? paciente[campo].trim() : paciente[campo]
    if (valor === '' || valor === undefined) paciente[campo] = null
  }
  if (typeof paciente.telefono === 'string') paciente.telefono = normalizarTelefono(paciente.telefono)
  return paciente
}
