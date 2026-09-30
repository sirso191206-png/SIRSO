// Vista LOCAL del periodontograma para un paciente creado sin conexión
// — mismo motivo que lib/odontogramaOffline.js: el trigger del
// servidor crea las 32 piezas y sus 192 sitios (32×6) en cuanto el
// paciente existe ahí (migración 018_sirso_periodontograma.sql), así
// que antes de eso no hay ningún id real al que apuntar.

import { NUMEROS_PIEZA_FDI } from './odontogramaOffline'

export { NUMEROS_PIEZA_FDI }

export const SITIOS_PERIODONTALES = ['mesial_v', 'medio_v', 'distal_v', 'mesial_l', 'medio_l', 'distal_l']

export function idPiezaPeriodontalOffline(numeroPieza) {
  return `offline-pieza-perio-${numeroPieza}`
}

export function numeroDePiezaPeriodontalOffline(id) {
  if (typeof id !== 'string') return null
  const m = /^offline-pieza-perio-(.+)$/.exec(id)
  return m ? m[1] : null
}

export function idSitioOffline(numeroPieza, sitio) {
  return `offline-sitio-${numeroPieza}-${sitio}`
}

// null si `id` no es un placeholder de sitio offline. Si lo es, regresa
// { numeroPieza, sitio } — nunca adivina, solo reconoce el formato
// exacto que genera idSitioOffline.
export function datosDeSitioOffline(id) {
  if (typeof id !== 'string') return null
  const m = /^offline-sitio-(.+)-(mesial_v|medio_v|distal_v|mesial_l|medio_l|distal_l)$/.exec(id)
  return m ? { numeroPieza: m[1], sitio: m[2] } : null
}

export function piezasPeriodontalesOfflineIniciales() {
  return NUMEROS_PIEZA_FDI.map((numero_pieza) => ({
    id: idPiezaPeriodontalOffline(numero_pieza),
    numero_pieza,
    movilidad: 0,
    furcacion: 0,
    actualizado_en: null,
    _offline: true,
    sitios: SITIOS_PERIODONTALES.map((sitio) => ({
      id: idSitioOffline(numero_pieza, sitio),
      sitio,
      profundidad_sondaje: 0,
      recesion: 0,
      sangrado: false,
      placa: false,
      calculo: false,
      actualizado_en: null,
      _offline: true
    }))
  }))
}
