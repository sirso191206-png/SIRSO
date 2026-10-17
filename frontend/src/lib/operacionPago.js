// H28 — Identificador de OPERACIÓN de un cobro. Un cobro registrado dos veces es dinero contado dos veces, así que cada intento de
// «Registrar pago» lleva un id generado aquí que se CONSERVA mientras la persona reintente la misma operación (mismo paciente, monto,
// método, tipo y tratamiento) — p. ej. tras perder la respuesta del servidor — y se descarta en cuanto el cobro se confirma. La
// clave primaria de `pagos` hace el resto: el mismo id no puede crear una segunda fila (services/pagos.js verifica que el cobro
// existente sea EXACTAMENTE el mismo antes de darlo por registrado).

const normalizar = ({ paciente_id = null, monto, metodo = null, tipo = 'pago', tratamiento_id = null } = {}) =>
  ({ paciente_id: paciente_id ?? null, monto: Number(monto), metodo: metodo ?? null, tipo: tipo ?? 'pago', tratamiento_id: tratamiento_id ?? null })

export function firmaCobro(datos) {
  const d = normalizar(datos)
  return [d.paciente_id ?? '', Number.isFinite(d.monto) ? d.monto.toFixed(2) : String(d.monto), d.metodo ?? '', d.tipo, d.tratamiento_id ?? ''].join('|')
}

// Devuelve la operación a usar: la anterior si es el MISMO cobro (reintento), o una nueva con id propio.
export function operacionCobro(anterior, datos, generarId = () => crypto.randomUUID()) {
  const firma = firmaCobro(datos)
  if (anterior && anterior.firma === firma) return anterior
  return { id: generarId(), firma }
}

// ¿La fila ya guardada es exactamente el cobro que se intentó registrar? (monto comparado como número: numeric vuelve como texto)
export function esMismoCobro(existente, cobro) {
  if (!existente || !cobro) return false
  const a = normalizar(existente), b = normalizar(cobro)
  return a.paciente_id === b.paciente_id && a.monto === b.monto && a.metodo === b.metodo && a.tipo === b.tipo &&
    a.tratamiento_id === b.tratamiento_id && (cobro.registrado_por == null || existente.registrado_por === cobro.registrado_por)
}
