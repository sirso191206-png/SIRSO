// Constantes y helpers compartidos entre Odontograma2D y Odontograma3D —
// existen en un solo lugar a propósito, para que las dos vistas usen
// exactamente los mismos colores/estados sin duplicar lógica.

export const ESTADOS_CARA = [
  { value: 'sano', label: 'Sano', color: '#F1F5F9', borde: '#CBD5E1' },
  { value: 'caries', label: 'Caries', color: '#FCA5A5', borde: '#DC2626' },
  { value: 'obturado', label: 'Obturado', color: '#93C5FD', borde: '#2563EB' },
  { value: 'fracturado', label: 'Fracturado', color: '#FDBA74', borde: '#EA580C' },
  { value: 'en_tratamiento', label: 'En tratamiento', color: '#67E8F9', borde: '#0891B2' }
]

export const ESTADOS_PIEZA = [
  { value: 'sano', label: 'Sano (usar caras)' },
  { value: 'ausente', label: 'Ausente' },
  { value: 'corona', label: 'Corona' },
  { value: 'implante', label: 'Implante' },
  { value: 'endodoncia', label: 'Endodoncia (tratada)' },
  { value: 'en_tratamiento', label: 'En tratamiento' }
]

export const COLOR_PIEZA = {
  corona: { color: '#FCD34D', borde: '#D97706' },
  implante: { color: '#C4B5FD', borde: '#7C3AED' }
}

export const FILA_SUPERIOR = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
export const FILA_INFERIOR = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']

// Config centralizada pieza → tipo, para elegir geometría/proporciones
// en la vista 3D (y en el futuro, qué modelo .glb cargar).
export const TIPOS_DIENTES = {
  18: 'molar', 17: 'molar', 16: 'molar', 15: 'premolar', 14: 'premolar',
  13: 'canino', 12: 'incisivo', 11: 'incisivo',
  21: 'incisivo', 22: 'incisivo', 23: 'canino', 24: 'premolar', 25: 'premolar',
  26: 'molar', 27: 'molar', 28: 'molar',
  48: 'molar', 47: 'molar', 46: 'molar', 45: 'premolar', 44: 'premolar',
  43: 'canino', 42: 'incisivo', 41: 'incisivo',
  31: 'incisivo', 32: 'incisivo', 33: 'canino', 34: 'premolar', 35: 'premolar',
  36: 'molar', 37: 'molar', 38: 'molar'
}

export const NOMBRES_TIPO = {
  incisivo: 'Incisivo',
  canino: 'Canino',
  premolar: 'Premolar',
  molar: 'Molar'
}

export function esArcadaSuperior(numero) {
  return numero.startsWith('1') || numero.startsWith('2')
}

export function esDientAnterior(numero) {
  return ['1', '2', '3'].includes(numero[1])
}

export function nombreCaraLingual(numero) {
  return esArcadaSuperior(numero) ? 'Palatina' : 'Lingual'
}

export function nombreCaraOclusal(numero) {
  return esDientAnterior(numero) ? 'Incisal' : 'Oclusal'
}

export function nombreCara(numero, cara) {
  if (cara === 'lingual') return nombreCaraLingual(numero)
  if (cara === 'oclusal') return nombreCaraOclusal(numero)
  return cara.charAt(0).toUpperCase() + cara.slice(1)
}

export function colorCara(estado) {
  return ESTADOS_CARA.find((e) => e.value === estado) ?? ESTADOS_CARA[0]
}

export function caraDe(pieza, nombre) {
  return pieza.caras?.find((c) => c.cara === nombre)
}

// Reconstruye el estado "inicial" de cada pieza/cara a partir del
// historial: el valor inicial es el `estado_anterior` del primer cambio
// registrado; si nunca cambió, el inicial es igual al actual.
export function calcularEstadoInicial(piezas, historial) {
  const primerCambioPieza = {}
  const primerCambioCara = {}
  for (const h of historial) {
    if (h.cara) {
      const clave = `${h.pieza_id}:${h.cara}`
      if (!(clave in primerCambioCara)) primerCambioCara[clave] = h
    } else if (!(h.pieza_id in primerCambioPieza)) {
      primerCambioPieza[h.pieza_id] = h
    }
  }

  return piezas.map((p) => ({
    ...p,
    estado: primerCambioPieza[p.id]?.estado_anterior ?? p.estado,
    caras: p.caras?.map((c) => ({
      ...c,
      estado: primerCambioCara[`${p.id}:${c.cara}`]?.estado_anterior ?? c.estado
    }))
  }))
}
