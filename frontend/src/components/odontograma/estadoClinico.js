// ============================================================
// Estado clínico → representación visual (color/símbolo/opacidad).
// ------------------------------------------------------------
// Lógica clínica PURA — cero dependencia de geometría, Three.js o
// GLTF. Antes vivía dentro de Diente3D.jsx (el componente de
// geometría placeholder), lo que lo volvía una dependencia
// "necesaria" para algo que en realidad no tiene nada que ver con
// geometría. Separado aparte para que el odontograma clínico (que ya
// no usa geometría placeholder, usa la escena real del .glb) no
// dependa de Diente3D.jsx para nada.
// ============================================================

import { COLOR_MARFIL_CORONA } from './constantesOdontograma'

// Prioridad clínica: qué condición "gana" visualmente si la pieza
// tiene varias caras con distinto estado. Esto define el COLOR
// (estado clínico) — la selección se dibuja aparte y nunca lo
// sobreescribe.
export function evaluarPieza(pieza) {
  if (pieza.estado === 'ausente') return { color: '#CBD5E1', simbolo: '×', opacity: 0.3, esRaiz: false }
  if (pieza.estado === 'implante') return { color: '#C4B5FD', simbolo: '◆', opacity: 1, esRaiz: true }
  if (pieza.estado === 'corona') return { color: '#FCD34D', simbolo: '●', opacity: 1, esRaiz: true }
  if (pieza.estado === 'endodoncia') return { color: '#F87171', simbolo: '✓', opacity: 1, esRaiz: true }

  const caras = pieza.caras ?? []
  if (caras.some((c) => c.estado === 'caries')) return { color: '#FCA5A5', simbolo: '●', opacity: 1, esRaiz: true }
  if (pieza.estado === 'en_tratamiento' || caras.some((c) => c.estado === 'en_tratamiento')) {
    return { color: '#67E8F9', simbolo: '●', opacity: 1, esRaiz: true }
  }
  if (caras.some((c) => c.estado === 'fracturado')) return { color: '#FDBA74', simbolo: '●', opacity: 1, esRaiz: true }
  if (caras.some((c) => c.estado === 'obturado')) return { color: '#93C5FD', simbolo: '✓', opacity: 1, esRaiz: true }

  return { color: COLOR_MARFIL_CORONA, simbolo: null, opacity: 1, esRaiz: true }
}
