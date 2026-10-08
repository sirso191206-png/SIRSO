import { esIlimitado, formatearLimite, nivelUso, porcentajeUso } from '../../lib/planes'

const COLOR = { normal: 'bg-clinico-azul', alto: 'bg-amber-500', lleno: 'bg-red-500' }

// "423 / 2,000" + barra de progreso. Con límite ilimitado no hay barra.
export function BarraUso({ etiqueta, usado, limite, unidad }) {
  const pct = porcentajeUso(usado, limite)
  const nivel = nivelUso(usado, limite)
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-slate-600">{etiqueta}</span>
        <span className="font-medium text-slate-800">
          {Number(usado ?? 0).toLocaleString('es-MX')}{unidad ? ` ${unidad}` : ''} / {formatearLimite(limite)}{unidad && !esIlimitado(limite) ? ` ${unidad}` : ''}
        </span>
      </div>
      {pct !== null && (
        <div
          className="h-2 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Uso de ${etiqueta}`}
        >
          <div className={`h-full rounded-full ${COLOR[nivel]}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}
