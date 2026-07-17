import { useEffect, useState } from 'react'

// Rutas donde se buscarían los modelos anatómicos reales cuando existan.
// Mientras no se agreguen archivos aquí, todo cae al fallback geométrico
// — la aplicación nunca depende de que estos archivos existan.
export const MODELOS_DENTALES = {
  incisivo: '/models/dental/incisivo.glb',
  canino: '/models/dental/canino.glb',
  premolar: '/models/dental/premolar.glb',
  molar: '/models/dental/molar.glb'
}

// Cache a nivel de módulo: cada URL se verifica UNA sola vez por sesión
// del navegador, sin importar cuántos dientes del mismo tipo se rendericen
// (evita el problema de "solicitudes repetidas a archivos inexistentes").
const cacheDisponibilidad = new Map()

async function verificarDisponible(url) {
  if (cacheDisponibilidad.has(url)) return cacheDisponibilidad.get(url)
  try {
    const res = await fetch(url, { method: 'HEAD' })
    const disponible = res.ok
    cacheDisponibilidad.set(url, disponible)
    return disponible
  } catch {
    cacheDisponibilidad.set(url, false)
    return false
  }
}

// Hook seguro: NO usa useGLTF/Suspense (que reintentarían o romperían la
// escena si el archivo no existe) — solo confirma con un HEAD si el
// modelo está disponible. Diente3D decide con este booleano si carga el
// GLB real (Fase 2, cuando existan) o usa la geometría temporal (Fase 1.5).
export function useModeloDisponible(tipo) {
  const [disponible, setDisponible] = useState(false)
  const url = MODELOS_DENTALES[tipo]

  useEffect(() => {
    let activo = true
    if (!url) return
    verificarDisponible(url).then((r) => { if (activo) setDisponible(r) })
    return () => { activo = false }
  }, [url])

  return { disponible, url }
}
