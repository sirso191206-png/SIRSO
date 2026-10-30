import { useEffect, useState } from 'react'

// ¿La pantalla se usa con el dedo? (puntero «grueso»: teléfono o tableta). Con mouse o trackpad, false.
const CONSULTA = '(pointer: coarse)'

export function esPantallaTactil() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA).matches
}

export function useEsTactil() {
  const [tactil, setTactil] = useState(esPantallaTactil)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const consulta = window.matchMedia(CONSULTA)
    const alCambiar = () => setTactil(consulta.matches)
    consulta.addEventListener?.('change', alCambiar)
    return () => consulta.removeEventListener?.('change', alCambiar)
  }, [])
  return tactil
}
