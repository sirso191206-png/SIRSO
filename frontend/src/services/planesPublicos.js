import { supabase } from '../lib/supabase'

// Planes que la página pública puede mostrar: solo activos y visibles, con su precio y funcionalidades (función
// planes_publicos, migración 122). Los precios vienen SIEMPRE de la base —nunca escritos en la página— para no publicar
// algo distinto a lo que se cobra. Si la consulta falla, se devuelve null y la página invita a pedir la cotización.
export async function obtenerPlanesPublicos() {
  try {
    const { data, error } = await supabase.rpc('planes_publicos')
    if (error) return null
    return Array.isArray(data) && data.length > 0 ? data : null
  } catch {
    return null
  }
}

export function formatearPrecioPublico(monto, moneda = 'MXN') {
  const n = Number(monto)
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('es-MX', { style: 'currency', currency: moneda || 'MXN', maximumFractionDigits: 0 })
}
