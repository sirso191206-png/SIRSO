import { useState } from 'react'
import { buscarCie10 } from '../lib/cie10'

export function SelectorCie10({ codigo, descripcion, onSeleccionar, onLimpiar }) {
  const [termino, setTermino] = useState('')
  const resultados = buscarCie10(termino)

  if (codigo) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-clinico-azul bg-clinico-azulClaro px-3 py-2 text-sm">
        <span className="font-mono font-semibold text-clinico-azul">{codigo}</span>
        <span className="flex-1 text-slate-700">{descripcion}</span>
        <button type="button" onClick={onLimpiar} className="text-xs text-slate-400 hover:text-clinico-rojo">
          Quitar
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        value={termino}
        onChange={(e) => setTermino(e.target.value)}
        placeholder="Buscar por código o descripción (ej. caries, K02, periodontitis)"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      {resultados.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {resultados.map((r) => (
            <button
              key={r.codigo}
              type="button"
              onClick={() => { onSeleccionar(r); setTermino('') }}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-mono font-semibold text-clinico-azul">{r.codigo}</span>
              <span className="text-slate-600">{r.descripcion}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
