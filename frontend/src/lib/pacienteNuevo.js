import { normalizarTelefono } from './telefono'

// Envío del formulario «Nuevo paciente» (pages/Pacientes.jsx). Los campos opcionales que se dejan en blanco llegan como '' y la base
// no los acepta así: fecha_nacimiento es `date` ('' → 22007), sexo tiene un CHECK (M/F/X o NULL) y una curp '' se guardaría como
// texto vacío — el índice único por clínica (idx_pacientes_curp_por_clinica) solo excluye NULL, así que el siguiente paciente sin
// CURP chocaría como «CURP duplicada». Vacío = NULL. No modifica el objeto del formulario.
const OPCIONALES = ['fecha_nacimiento', 'curp', 'sexo', 'primer_apellido', 'segundo_apellido']

// El nombre que se ve en listas, agenda y selectores es `nombre_completo`. Si los apellidos se capturaron en sus propios
// campos y no están ya en el nombre, se agregan (antes la agenda mostraba solo «Diego» y dos pacientes podían confundirse).
export function nombreConApellidos({ nombre_completo, primer_apellido, segundo_apellido }) {
  const base = String(nombre_completo ?? '').trim().replace(/\s+/g, ' ')
  const minusculas = base.toLowerCase()
  const faltan = [primer_apellido, segundo_apellido].map((a) => String(a ?? '').trim()).filter((a) => a && !minusculas.includes(a.toLowerCase()))
  return [base, ...faltan].filter(Boolean).join(' ')
}

export function prepararPacienteNuevo(form) {
  const paciente = { ...form }
  for (const campo of OPCIONALES) {
    const valor = typeof paciente[campo] === 'string' ? paciente[campo].trim() : paciente[campo]
    if (valor === '' || valor === undefined) paciente[campo] = null
  }
  if (typeof paciente.telefono === 'string') paciente.telefono = normalizarTelefono(paciente.telefono)
  paciente.nombre_completo = nombreConApellidos(paciente)
  return paciente
}

// Al EDITAR los apellidos, el nombre visible se actualiza igual: el apellido viejo se reemplaza por el nuevo (o se quita si
// se borró) y, si no estaba, se agrega. Así «Laura Gómez Ríos» pasa a «Laura Ruiz Ríos» al cambiar el primer apellido.
export function nombreTrasCambioDeApellidos(nombreActual, antes, despues) {
  let palabras = String(nombreActual ?? '').trim().split(/\s+/).filter(Boolean)
  for (const campo of ['primer_apellido', 'segundo_apellido']) {
    const viejo = String(antes?.[campo] ?? '').trim()
    const nuevo = String(despues?.[campo] ?? '').trim()
    if (!viejo || viejo === nuevo) continue
    const partesViejo = viejo.toLowerCase().split(/\s+/)
    const inicio = palabras.findIndex((_, k) => partesViejo.every((p, j) => (palabras[k + j] ?? '').toLowerCase() === p))
    if (inicio === -1) continue
    palabras = [...palabras.slice(0, inicio), ...(nuevo ? nuevo.split(/\s+/) : []), ...palabras.slice(inicio + partesViejo.length)]
  }
  return nombreConApellidos({ nombre_completo: palabras.join(' '), primer_apellido: despues?.primer_apellido, segundo_apellido: despues?.segundo_apellido })
}
