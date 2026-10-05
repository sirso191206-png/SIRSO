import { useEffect, useState } from 'react'
import { historialPlanes } from '../../services/planes'
import { etiquetaAccionPlan, resumirCambios } from '../../lib/planes'

function fmt(v) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  return String(v)
}

// Quién cambió qué y cuándo (valor anterior → nuevo). Viene de la auditoría.
export function HistorialPlanes() {
  const [filas, setFilas] = useState(null)

  useEffect(() => {
    historialPlanes(100).then(setFilas).catch(() => setFilas([]))
  }, [])

  if (!filas) return <p className="text-sm text-slate-400">Cargando historial…</p>
  if (filas.length === 0) return <p className="text-sm text-slate-500">Todavía no hay cambios registrados.</p>

  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {filas.map((f) => {
        const cambios = resumirCambios(f.detalle)
        return (
          <li key={f.id} className="px-4 py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium text-slate-800">
                {etiquetaAccionPlan(f.accion)}
                {f.detalle?.plan ? ` “${f.detalle.plan}”` : ''}
                {f.clinica_nombre ? ` — ${f.clinica_nombre}` : ''}
              </span>
              <span className="text-xs text-slate-400">
                {f.usuario_nombre ?? 'Sistema'} · {new Date(f.creado_en).toLocaleString('es-MX')}
              </span>
            </div>
            {cambios.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                {cambios.map((c) => (
                  <li key={c.campo}>
                    <span className="text-slate-500">{c.campo}:</span> {fmt(c.antes)} → <span className="font-medium">{fmt(c.despues)}</span>
                  </li>
                ))}
              </ul>
            )}
            {f.detalle?.plan_anterior && (
              <div className="mt-1 text-xs text-slate-600">
                {f.detalle.plan_anterior} → <span className="font-medium">{f.detalle.plan_nuevo}</span>
                {f.detalle.precio_nuevo !== undefined && ` · ${fmt(f.detalle.precio_anterior)} → ${fmt(f.detalle.precio_nuevo)}`}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
