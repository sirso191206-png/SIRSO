import { useState } from 'react'
import { ACCIONES_BOOLEANAS, ACCIONES_NUMERICAS, tieneAlMenosUnaAccion } from '../lib/saludBucal'

export function AccionSaludBucal({ valor, onCambiar }) {
  const [expandido, setExpandido] = useState(false)
  const registrada = tieneAlMenosUnaAccion(valor)

  const cambiarBooleana = (clave, val) => onCambiar({ ...valor, [clave]: val })
  const cambiarNumerica = (clave, val) => onCambiar({ ...valor, [clave]: val === '' ? 0 : Number(val) })

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
      >
        <span className="font-medium text-slate-700">
          Acciones de salud bucal
          {registrada && <span className="ml-2 text-xs font-normal text-clinico-verde">✓ registradas</span>}
        </span>
        <span className="text-xs text-clinico-azul">{expandido ? 'Ocultar' : 'Registrar'}</span>
      </button>

      {expandido && (
        <div className="mt-3 space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-500">Acciones realizadas</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ACCIONES_BOOLEANAS.map((a) => (
                <label key={a.clave} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(valor?.[a.clave])}
                    onChange={(e) => cambiarBooleana(a.clave, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-clinico-azul focus:ring-clinico-azul"
                  />
                  {a.etiqueta}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-slate-500">Conteos (piezas / eventos)</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ACCIONES_NUMERICAS.map((a) => (
                <label key={a.clave} className="block text-xs">
                  <span className="mb-1 block font-medium text-slate-600">{a.etiqueta}</span>
                  <input
                    type="number"
                    min="0"
                    max="32"
                    value={valor?.[a.clave] ?? ''}
                    onChange={(e) => cambiarNumerica(a.clave, e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
              ))}
            </div>
          </div>

          {!registrada && (
            <p className="text-xs text-clinico-ambar">
              Marca al menos una acción realizada o registra un conteo mayor a 0.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
