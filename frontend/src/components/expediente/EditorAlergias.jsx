import { useState } from 'react'

const SEVERIDADES = ['Leve', 'Moderada', 'Grave']

export function EditorAlergias({ alergias, onGuardar }) {
  const [sustancia, setSustancia] = useState('')
  const [severidad, setSeveridad] = useState('Moderada')
  const [guardando, setGuardando] = useState(false)

  const lista = Array.isArray(alergias) ? alergias : []

  const agregar = async (e) => {
    e.preventDefault()
    if (!sustancia.trim()) return
    setGuardando(true)
    try {
      await onGuardar([...lista, { sustancia: sustancia.trim(), severidad }])
      setSustancia('')
      setSeveridad('Moderada')
    } finally {
      setGuardando(false)
    }
  }

  const quitar = async (index) => {
    setGuardando(true)
    try {
      await onGuardar(lista.filter((_, i) => i !== index))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <span className="mb-2 block text-sm font-semibold text-clinico-rojo">⚠ Alergias</span>

      {lista.length > 0 && (
        <div className="mb-2 space-y-1">
          {lista.map((a, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-sm text-red-800">
              <span>{a.sustancia} — {a.severidad}</span>
              <button onClick={() => quitar(i)} disabled={guardando} className="text-slate-400 hover:text-clinico-rojo">✕</button>
            </div>
          ))}
        </div>
      )}
      {lista.length === 0 && <p className="mb-2 text-xs text-red-700">Ninguna registrada.</p>}

      <form onSubmit={agregar} className="flex gap-2">
        <input
          value={sustancia}
          onChange={(e) => setSustancia(e.target.value)}
          placeholder="Ej. Penicilina"
          className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
        <select value={severidad} onChange={(e) => setSeveridad(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          {SEVERIDADES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button
          type="submit"
          disabled={guardando}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          + Agregar
        </button>
      </form>
    </div>
  )
}
