import { supabase } from '../lib/supabase'
import { traducirErrorInventario } from '../lib/inventario'

// Inventario de materiales (migración 117). El stock solo cambia con movimientos (fn_inventario_registrar_movimiento) o
// con el descuento automático de la consulta (disparador en tratamientos); la base no deja escribirlo directo.

export async function obtenerMateriales() {
  const { data, error } = await supabase.from('materiales').select('*').order('nombre')
  if (error) throw error
  return data
}

export async function crearMaterial({ nombre, categoria, unidad, stock_minimo, sucursal_id }) {
  const { data, error } = await supabase
    .from('materiales')
    .insert({ nombre, categoria: categoria || null, unidad, stock_minimo: Number(stock_minimo) || 0, sucursal_id: sucursal_id || null })
    .select()
    .single()
  if (error) throw traducirErrorInventario(error)
  return data
}

export async function actualizarMaterial(id, cambios) {
  const { data, error } = await supabase.from('materiales').update(cambios).eq('id', id).select().single()
  if (error) throw traducirErrorInventario(error)
  return data
}

export async function obtenerMovimientos({ desde, hasta, materialId, limite = 500 } = {}) {
  let query = supabase
    .from('movimientos_inventario')
    .select('*, material:materiales(nombre, unidad, sucursal_id)')
    .order('creado_en', { ascending: false })
    .limit(limite)
  if (desde) query = query.gte('creado_en', desde)
  if (hasta) query = query.lte('creado_en', hasta)
  if (materialId) query = query.eq('material_id', materialId)
  const { data, error } = await query
  if (error) throw error
  return data
}

// `id` (generado en el navegador) hace la operación idempotente: si la cola sin conexión la reintenta, la base reconoce el
// mismo movimiento y no suma dos veces.
export async function registrarMovimiento({ id, materialId, tipo, cantidad, motivo }) {
  const { data, error } = await supabase.rpc('fn_inventario_registrar_movimiento', {
    p_material: materialId, p_tipo: tipo, p_cantidad: Number(cantidad), p_motivo: motivo || null, p_id: id ?? null
  })
  if (error) throw traducirErrorInventario(error)
  return data
}

export async function obtenerRecetas() {
  const { data, error } = await supabase.from('receta_materiales').select('*')
  if (error) throw error
  return data
}

export async function agregarAReceta({ catalogoId, materialId, cantidad }) {
  const { data, error } = await supabase
    .from('receta_materiales')
    .insert({ catalogo_id: catalogoId, material_id: materialId, cantidad: Number(cantidad) })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('Ese material ya está en la receta de este tratamiento: cambia su cantidad.')
    throw traducirErrorInventario(error)
  }
  return data
}

export async function actualizarCantidadReceta(id, cantidad) {
  const { error } = await supabase.from('receta_materiales').update({ cantidad: Number(cantidad) }).eq('id', id)
  if (error) throw traducirErrorInventario(error)
}

export async function quitarDeReceta(id) {
  const { error } = await supabase.from('receta_materiales').delete().eq('id', id)
  if (error) throw error
}

// Para el tablero: materiales en o bajo su mínimo. Vacío si el rol o el plan no lo incluyen.
export async function obtenerStockBajo(sucursalId = null) {
  const { data, error } = await supabase.rpc('fn_inventario_stock_bajo', { p_sucursal: sucursalId })
  if (error) throw error
  return data ?? []
}

// Tras registrar una sesión: materiales de la receta de ese tratamiento que quedaron en o bajo el mínimo.
export async function obtenerAvisosTratamiento(tratamientoId) {
  const { data, error } = await supabase.rpc('fn_inventario_avisos_tratamiento', { p_tratamiento: tratamientoId })
  if (error) throw error
  return data ?? []
}
