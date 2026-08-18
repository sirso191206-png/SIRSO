// ============================================================
// SIRO — Interoperabilidad SIS (Salud Bucal)
// ------------------------------------------------------------
// Puente entre la tabla `sis_catalogo_establecimientos` (migración
// 032, 64,006 filas nacionales) y sis-mapper.ts, que solo necesita
// UNA fila: la CLUES de la propia clínica. Este archivo es el único
// del feature SIS que depende de Supabase — sis-catalogs.ts se
// mantiene independiente de cualquier framework/backend.
// ============================================================

import { supabase } from '../../../lib/supabase'
import type { CatalogosSis, EntradaEstablecimientoSis } from './sis-catalogs'

/**
 * Busca UNA clínica por su CLUES en el catálogo nacional cargado en
 * Supabase (migración 032). Devuelve un `CatalogosSis` listo para
 * pasarle a mapearRegistroSis/validarRegistroSis — con 0 o 1 entrada,
 * nunca el catálogo completo.
 */
export async function cargarEstablecimientoPorClues(clues: string): Promise<CatalogosSis> {
  if (!clues) return {}

  const { data, error } = await supabase
    .from('sis_catalogo_establecimientos')
    .select('clues, institucion, entidad, en_operacion, nombre_unidad')
    .eq('clues', clues.toUpperCase())
    .maybeSingle()

  if (error || !data) return {}

  const entrada: EntradaEstablecimientoSis = {
    clues: data.clues,
    institucion: data.institucion ?? '',
    entidad: data.entidad ?? '',
    enOperacion: Boolean(data.en_operacion),
  }

  const establecimientos = new Map<string, EntradaEstablecimientoSis>()
  establecimientos.set(entrada.clues, entrada)
  return { establecimientos }
}
