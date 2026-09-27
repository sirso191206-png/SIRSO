// Formatea un monto en pesos con separador de miles (es-MX: coma para
// miles, punto para decimales) y siempre 2 decimales — mismo formato
// que ya se usaba en toda la app (Number(x).toFixed(2)), solo que
// ahora "1234.56" se ve "1,234.56" en vez de perderse entre los dígitos.
// El símbolo "$" se sigue escribiendo aparte en cada lugar que lo usa,
// para no cambiar cómo se ve el signo de pesos en cada pantalla.
export function formatearMoneda(monto) {
  return Number(monto).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
