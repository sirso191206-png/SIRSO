import { supabase } from '../lib/supabase'

// Todos los pagos de la clínica en un rango de fechas — no de un solo
// paciente. Usado por el Corte de caja. RLS ya limita esto a la propia
// clínica (mismo criterio que el resto del sistema).
export async function obtenerPagosPorRango({ desde, hasta, sucursalId }) {
  let query = supabase
    .from('pagos')
    .select('*, paciente:pacientes(nombre_completo), registrado_por:usuarios!pagos_registrado_por_fkey(nombre), sucursal:sucursales(nombre)')
    .gte('creado_en', desde)
    .lt('creado_en', hasta)
    .order('creado_en', { ascending: false })

  // sucursalId es opcional a propósito — si es null/undefined (clínica
  // sin multi-sucursal, o "Todas las sucursales" elegido), no se agrega
  // ningún filtro y el comportamiento es exactamente el de antes.
  if (sucursalId) {
    query = query.eq('sucursal_id', sucursalId)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function obtenerPagos(pacienteId) {
  const { data, error } = await supabase
    .from('pagos')
    .select('*, registrado_por:usuarios!pagos_registrado_por_fkey(nombre)')
    .eq('paciente_id', pacienteId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

// El doble cobro por doble clic se evita en la UI (botón deshabilitado
// mientras la promesa está en curso), no a nivel de BD.
export async function registrarPago(pago) {
  const { data, error } = await supabase
    .from('pagos')
    .insert(pago)
    .select()
    .single()
  if (error) throw error
  return data
}

// Anular deja el registro (nunca se borra ni se edita el monto) — un
// trigger en la base de datos bloquea cualquier otro cambio. El pago
// anulado ya no cuenta en el saldo del paciente (v_saldo_pacientes lo
// excluye) ni en el corte de caja.
export async function anularPago(id, { usuarioId, motivo }) {
  const { data, error } = await supabase
    .from('pagos')
    .update({ anulado_en: new Date().toISOString(), anulado_por: usuarioId, motivo_anulacion: motivo || null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
