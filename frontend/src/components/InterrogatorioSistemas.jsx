import { useState } from 'react'
import { SISTEMAS_INTERROGATORIO } from '../lib/interrogatorioSistemas'

export function InterrogatorioSistemas({ valor, onCambiar }) {
  const [expandido, setExpandido] = useState(false)

  const alternarSintoma = (sistemaClave, sintoma) => {
    const actuales = valor[sistemaClave] ?? []
    const yaEsta = actuales.includes(sintoma)
    onCambiar({
      ...valor,
      [sistemaClave]: yaEsta ? actuales.filter((s) => s !== sintoma) : [...actuales, sintoma]
    })
  }

  const totalPositivos = Object.values(valor).reduce((acc, arr) => acc + (arr?.length ?? 0), 0)

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
      >
        <span className="font-medium text-slate-700">
          {totalPositivos > 0 ? `${totalPositivos} hallazgo(s) positivo(s)` : 'Sin hallazgos positivos (todo negado)'}
        </span>
        <span className="text-xs text-clinico-azul">{expandido ? 'Ocultar' : 'Revisar por sistemas'}</span>
      </button>

      {expandido && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SISTEMAS_INTERROGATORIO.map((sistema) => (
            <div key={sistema.clave} className="rounded-lg border border-slate-200 p-2.5">
              <div className="mb-1.5 text-xs font-semibold text-slate-500">{sistema.nombre}</div>
              <div className="flex flex-wrap gap-1.5">
                {sistema.sintomas.map((sintoma) => {
                  const activo = (valor[sistema.clave] ?? []).includes(sintoma)
                  return (
                    <button
                      key={sintoma}
                      type="button"
                      onClick={() => alternarSintoma(sistema.clave, sintoma)}
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                        activo ? 'border-clinico-rojo bg-red-50 text-clinico-rojo' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {sintoma}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
