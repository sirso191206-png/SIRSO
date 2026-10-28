// Inventario de materiales (migración 118): reglas que la pantalla comparte con la base de datos.
// El stock NO se calcula aquí: lo lleva la base (cada movimiento guarda el stock antes y después). Esto solo decide cómo
// mostrarlo, valida antes de mandar y traduce los rechazos del servidor.
import { ErrorDeDatos } from './erroresDatos'

export const TIPOS_MOVIMIENTO = [
  { valor: 'entrada', etiqueta: 'Entrada', ayuda: 'Compra o reposición: suma al stock.' },
  { valor: 'salida', etiqueta: 'Salida', ayuda: 'Merma, caducidad o uso fuera de consulta: resta del stock.' },
  { valor: 'ajuste', etiqueta: 'Ajuste', ayuda: 'Conteo físico: el stock queda en lo que contaste.' }
]

export const ETIQUETA_TIPO = { entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste' }
export const ETIQUETA_ORIGEN = { manual: 'Manual', tratamiento: 'Consulta' }

// 'agotado' (≤ 0), 'bajo' (≤ mínimo) u 'ok'. Coincide con fn_inventario_stock_bajo.
export function estadoStock(material) {
  const stock = Number(material?.stock ?? 0)
  if (stock <= 0) return 'agotado'
  if (stock <= Number(material?.stock_minimo ?? 0)) return 'bajo'
  return 'ok'
}

export const ETIQUETA_ESTADO = { agotado: 'Agotado', bajo: 'Stock bajo', ok: 'Suficiente' }

export function formatearCantidad(valor) {
  const n = Number(valor ?? 0)
  return n.toLocaleString('es-MX', { maximumFractionDigits: 2 })
}

// Valida un movimiento antes de mandarlo (la base vuelve a validar todo). Devuelve el mensaje de error o null.
export function validarMovimiento({ tipo, cantidad, motivo }) {
  if (!TIPOS_MOVIMIENTO.some((t) => t.valor === tipo)) return 'Elige el tipo de movimiento.'
  const n = Number(cantidad)
  if (cantidad === '' || cantidad === null || cantidad === undefined || !Number.isFinite(n)) return 'Escribe una cantidad.'
  if (n < 0) return 'La cantidad no puede ser negativa.'
  if (tipo !== 'ajuste' && n === 0) return 'La cantidad debe ser mayor que cero.'
  if (n > 1000000) return 'La cantidad es demasiado grande.'
  if (tipo !== 'entrada' && !String(motivo ?? '').trim()) return 'Indica el motivo de la salida o del ajuste.'
  return null
}

// Rechazos del servidor que reintentar nunca arregla: la cola sin conexión los marca como conflicto (no los reintenta sola)
// y la pantalla muestra el mensaje del servidor, que es nuestro y seguro de mostrar.
export const HINTS_INVENTARIO = ['MATERIAL_NO_ENCONTRADO', 'MOVIMIENTO_CONFLICTO', 'MOVIMIENTO_INVALIDO', 'MOTIVO_REQUERIDO',
  'ROL_NO_PERMITIDO', 'FUNCIONALIDAD_NO_INCLUIDA', 'MATERIAL_INCOHERENTE', 'RECETA_INCOHERENTE']

export function traducirErrorInventario(error) {
  if (HINTS_INVENTARIO.includes(error?.hint)) return new ErrorDeDatos('INTEGRIDAD_DATOS', error.message, error)
  if (error?.code === '23505') return new ErrorDeDatos('INTEGRIDAD_DATOS', 'Ya existe un material con ese nombre en esa sucursal.', error)
  return error
}

// Avisos tras registrar una sesión (fn_inventario_avisos_tratamiento): texto corto para un aviso en pantalla, o null.
export function textoAvisoInventario(avisos) {
  if (!Array.isArray(avisos) || avisos.length === 0) return null
  const agotados = avisos.filter((a) => a.agotado).map((a) => a.nombre)
  const bajos = avisos.filter((a) => !a.agotado).map((a) => a.nombre)
  const partes = []
  if (agotados.length) partes.push(`sin stock: ${agotados.join(', ')}`)
  if (bajos.length) partes.push(`stock bajo: ${bajos.join(', ')}`)
  return `Sesión registrada. Inventario — ${partes.join('; ')}. Avisa a quien lleva el inventario.`
}

// Columnas de los CSV (lib/csv.js protege contra fórmulas y acentos).
export function columnasCsvMateriales(nombreSucursal) {
  return [
    { titulo: 'Material', valor: (m) => m.nombre },
    { titulo: 'Categoría', valor: (m) => m.categoria ?? '' },
    { titulo: 'Unidad', valor: (m) => m.unidad },
    { titulo: 'Sucursal', valor: (m) => nombreSucursal(m.sucursal_id) },
    { titulo: 'Stock', valor: (m) => Number(m.stock) },
    { titulo: 'Mínimo', valor: (m) => Number(m.stock_minimo) },
    { titulo: 'Estado', valor: (m) => ETIQUETA_ESTADO[estadoStock(m)] },
    { titulo: 'Activo', valor: (m) => (m.activo ? 'Sí' : 'No') }
  ]
}

// La cantidad va en dos columnas positivas (Entra / Sale): lib/csv.js antepone «'» a todo texto que empiece con «-» (protección
// contra fórmulas), y un «-2» quedaría como texto en Excel.
export function columnasCsvMovimientos() {
  return [
    { titulo: 'Fecha', valor: (v) => new Date(v.creado_en).toLocaleString('es-MX') },
    { titulo: 'Material', valor: (v) => v.material?.nombre ?? '' },
    { titulo: 'Tipo', valor: (v) => ETIQUETA_TIPO[v.tipo] ?? v.tipo },
    { titulo: 'Origen', valor: (v) => ETIQUETA_ORIGEN[v.origen] ?? v.origen },
    { titulo: 'Entra', valor: (v) => (Number(v.cantidad) > 0 ? Number(v.cantidad) : '') },
    { titulo: 'Sale', valor: (v) => (Number(v.cantidad) < 0 ? -Number(v.cantidad) : '') },
    { titulo: 'Stock anterior', valor: (v) => Number(v.stock_anterior) },
    { titulo: 'Stock resultante', valor: (v) => Number(v.stock_resultante) },
    { titulo: 'Motivo', valor: (v) => v.motivo ?? '' },
    { titulo: 'Registró', valor: (v) => v.usuario_nombre ?? '' }
  ]
}
