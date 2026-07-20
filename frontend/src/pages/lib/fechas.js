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
