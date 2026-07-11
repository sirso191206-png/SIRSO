export function TarjetaEstadistica({ etiqueta, valor, acento = 'azul' }) {
  const colores = {
    azul: 'text-clinico-azul',
    verde: 'text-clinico-verde',
    ambar: 'text-clinico-ambar',
    rojo: 'text-clinico-rojo'
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{etiqueta}</div>
      <div className={`mt-1 text-2xl font-bold ${colores[acento]}`}>{valor}</div>
    </div>
  )
}
