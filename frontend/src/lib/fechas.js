export function inicioDeHoy() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function finDeHoy() {
  const d = inicioDeHoy()
  d.setDate(d.getDate() + 1)
  return d
}

// "AAAA-MM-DD" de la fecha LOCAL (la del reloj de la clínica). No usar toISOString().slice(0, 10): da la fecha en UTC y,
// en México (UTC−6), desde las 18:00 devuelve el día siguiente (H24).
export function fechaInputLocal(fecha) {
  const d = new Date(fecha)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function inicioDeMesActual() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function finDeMesActual() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 1)
}

export function inicioDeSemanaLunes(fecha) {
  const d = new Date(fecha)
  const dia = d.getDay()
  const diff = d.getDate() - dia + (dia === 0 ? -6 : 1)
  d.setHours(0, 0, 0, 0)
  return new Date(d.setDate(diff))
}

// Antes vivía duplicada, idéntica, en 4 archivos: imprimirReceta.js,
// imprimirReferencia.js, Pacientes.jsx y PacienteDetalle.jsx.
export function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null
  const hoy = new Date()
  const nacimiento = new Date(fechaNacimiento)
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const m = hoy.getMonth() - nacimiento.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--
  return edad
}

// «2015-03-12» (fecha sin hora, como la guarda la base) → «12/03/2015». Sin pasar por Date: así no se corre un día por zona horaria.
export function fechaCorta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? '')
}
