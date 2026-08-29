// Agrupa una lista de pagos por sucursal — se usa para el corte de
// caja consolidado (owner viendo "Todas las sucursales"). Los pagos
// sin sucursal_id (clínicas de una sola ubicación, o registrados antes
// de adoptar multi-sucursal) se agrupan bajo "Sin sucursal", nunca se
// descartan silenciosamente.
export function calcularTotalesPorSucursal(pagos) {
  const grupos = new Map()

  for (const p of pagos) {
    const clave = p.sucursal_id ?? '__sin_sucursal__'
    const signo = p.tipo === 'reembolso' ? -1 : 1
    const monto = signo * Number(p.monto)

    if (!grupos.has(clave)) {
      grupos.set(clave, { sucursalId: p.sucursal_id ?? null, nombre: p.sucursal?.nombre ?? 'Sin sucursal', total: 0 })
    }
    grupos.get(clave).total += monto
  }

  return Array.from(grupos.values())
}
