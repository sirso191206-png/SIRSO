import { useState } from 'react'

// Este hook NO consulta Supabase — los datos clínicos (piezas, caras)
// siguen viviendo únicamente en useOdontograma. Aquí solo vive el estado
// de interfaz propio de la vista 3D: qué pieza está seleccionada, qué
// arcada se muestra, y hacia qué posición debe animar la cámara.
export function useOdontograma3D() {
  const [piezaSeleccionada, setPiezaSeleccionada] = useState(null)
  const [arcoVisible, setArcoVisible] = useState('ambas') // ambas | superior | inferior
  const [vistaCamara, setVistaCamara] = useState('restablecer')
  const [mostrarEtiquetas, setMostrarEtiquetas] = useState(true)

  const seleccionarPieza = (pieza) => {
    setPiezaSeleccionada((actual) => (actual?.id === pieza.id ? null : pieza))
  }

  return {
    piezaSeleccionada,
    seleccionarPieza,
    cerrarPanel: () => setPiezaSeleccionada(null),
    arcoVisible,
    setArcoVisible,
    vistaCamara,
    setVistaCamara,
    mostrarEtiquetas,
    setMostrarEtiquetas
  }
}
