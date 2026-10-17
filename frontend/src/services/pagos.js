import { supabase } from '../lib/supabase'
import { ErrorDeDatos } from '../lib/erroresDatos'
import { esMismoCobro } from '../lib/operacionPago'

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
// DECISIÓN DELIBERADA: los pagos NO se encolan sin conexión, a
// diferencia de notas/recetas/odontograma. Análisis:
//
// A nivel de base de datos, `pagos` es estructuralmente idéntico a una
// nota clínica o una receta (un simple insert, sin ninguna pasarela ni
// validación externa — `metodo` es solo texto descriptivo de cómo ya
// se recibió el dinero, SIRO nunca procesa la transacción en sí). El
// riesgo de duplicación TÉCNICA (dos filas por un reintento) sería
// igual de bajo con un id generado en el navegador.
//
// El riesgo real es otro: si el registro offline se pierde o se
// retrasa (sesión expirada, un conflicto, lo que sea), el efectivo que
// el dentista ya tiene en la mano deja de coincidir con lo que
// muestran los libros — y a diferencia de una nota clínica faltante
// (que alguien nota rápido al revisar el expediente), un pago perdido
// puede pasar inadvertido hasta el corte de caja, o peor: la persona,
// pensando que no se guardó, lo vuelve a registrar a mano — ahí sí se
// duplica, no por un bug de la cola, sino por una decisión humana
// razonable tomada con información incompleta.
//
// Por eso se exige conexión real para registrar un pago — igual que
// pediría el documento de referencia, "no inventar un flujo
// financiero offline inseguro".
//
// IDEMPOTENCIA (H28): el botón deshabilitado evita el doble clic, pero NO un reintento después de perder la respuesta (la escritura
// llegó, el aviso no): eso creaba un segundo cobro. Ahora cada operación lleva un `id` (lib/operacionPago.js; quien llama lo conserva
// mientras reintenta la MISMA operación). La clave primaria impide la segunda fila, y un 23505 de `pagos_pkey` se resuelve LEYENDO el
// cobro: solo si es exactamente el mismo (paciente, monto, método, tipo, tratamiento, quien lo registra) se devuelve como
// `{ ...cobro, yaExistia: true }`. Si es otro → PAGO_CONFLICTO; si no se puede leer → PAGO_NO_VERIFICABLE. Nunca un éxito falso.
export async function registrarPago(pago) {
  if (!navigator.onLine) {
    throw new Error('Los pagos requieren conexión a internet.')
  }
  const cobro = pago?.id ? pago : { ...pago, id: crypto.randomUUID() }
  const { data, error } = await supabase
    .from('pagos')
    .insert(cobro)
    .select()
    .single()
  if (!error) return data
  if (error.code === '23505' && /pagos_pkey/.test(`${error.message ?? ''} ${error.details ?? ''}`)) return confirmarCobroExistente(cobro)
  throw error
}

async function confirmarCobroExistente(cobro) {
  const { data: existente, error } = await supabase.from('pagos').select('*').eq('id', cobro.id).maybeSingle()
  if (error) throw error
  if (!existente) {
    throw new ErrorDeDatos('PAGO_NO_VERIFICABLE', 'No se pudo confirmar el cobro: ese identificador ya existe pero no puedes ver el registro. No se registró nada nuevo; revisa los pagos del paciente.')
  }
  if (!esMismoCobro(existente, cobro)) {
    throw new ErrorDeDatos('PAGO_CONFLICTO', 'Ya existe un cobro con ese identificador y datos distintos. No se registró nada nuevo; revisa los pagos del paciente.')
  }
  return { ...existente, yaExistia: true }
}

// Anular deja el registro (nunca se borra ni se edita el monto) — un
// trigger en la base de datos bloquea cualquier otro cambio. El pago
// anulado ya no cuenta en el saldo del paciente (v_saldo_pacientes lo
// excluye) ni en el corte de caja.
// Borrado real (no anular) — la fila desaparece de `pagos`, pero el
// trigger trg_auditoria_pagos ya guarda una copia completa en
// `auditoria` antes de que se vaya (monto, método, quién lo registró,
// fecha), así que nunca se pierde el rastro contable, solo sale del
// saldo y del corte de caja activos. A diferencia de anular (pensado
// para "este pago no debió contar, pero quedó registrado que pasó"),
// esto es para corregir un error de captura — un pago que nunca debió
// existir tal cual se guardó.
export async function eliminarPago(id) {
  const { error } = await supabase.from('pagos').delete().eq('id', id)
  if (error) throw error
}

// "Editar" un pago, sin editarlo de verdad: la base de datos bloquea a
// propósito cambiar monto/método/tipo de un pago ya registrado (ver
// migración 062, trigger fn_solo_anulacion_pago) — "un pago mal
// capturado se anula y se vuelve a registrar bien; nunca se corrige en
// el mismo registro, eso perdería el rastro de qué pasó realmente".
// Esto respeta esa regla: por dentro hace exactamente esa secuencia
// seguro-permitida (anular el viejo, registrar uno nuevo con los
// valores corregidos), pero como una sola acción guiada, para que
// quien lo usa no tenga que hacerlo a mano en dos pasos. El pago nuevo
// obtiene su propio folio (`numero_recibo`) — el recibo viejo, si ya
// se imprimió, queda anulado, no reemplazado.
// `idOperacion` (H28): el mismo en cada reintento de esta corrección, así el pago corregido no se registra dos veces. Volver a anular
// el original en el reintento solo vuelve a marcarlo anulado (el trigger permite tocar únicamente los campos de anulación).
export async function corregirPago(pagoOriginal, cambios, { usuarioId, motivo, idOperacion }) {
  await anularPago(pagoOriginal.id, { usuarioId, motivo: motivo || 'Corrección de monto/método' })
  return registrarPago({
    ...(idOperacion ? { id: idOperacion } : {}),
    paciente_id: pagoOriginal.paciente_id,
    tratamiento_id: pagoOriginal.tratamiento_id,
    tipo: pagoOriginal.tipo,
    monto: cambios.monto,
    metodo: cambios.metodo,
    registrado_por: usuarioId
  })
}

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
