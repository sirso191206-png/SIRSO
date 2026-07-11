import { useState } from 'react'

export function EditorLista({ etiqueta, items, onGuardar, placeholder, destacar = false }) {
  const [nuevoItem, setNuevoItem] = useState('')
  const [guardando, setGuardando] = useState(false)

  const lista = Array.isArray(items) ? items : []

  const agregar = async (e) => {
    e.preventDefault()
    const texto = nuevoItem.trim()
    if (!texto) return
    setGuardando(true)
    try {
      await onGuardar([...lista, texto])
      setNuevoItem('')
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
    <div className={`rounded-xl border p-4 ${destacar ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
      <span className={`mb-2 block text-sm font-semibold ${destacar ? 'text-clinico-rojo' : 'text-slate-700'}`}>{etiqueta}</span>

      {lista.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {lista.map((item, i) => (
            <span
              key={i}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${destacar ? 'bg-white text-red-800' : 'bg-slate-100 text-slate-700'}`}
            >
              {item}
              <button onClick={() => quitar(i)} disabled={guardando} className="text-slate-400 hover:text-clinico-rojo">✕</button>
            </span>
          ))}
        </div>
      )}
      {lista.length === 0 && <p className="mb-2 text-xs text-slate-400">Ninguno registrado.</p>}

      <form onSubmit={agregar} className="flex gap-2">
        <input
          value={nuevoItem}
          onChange={(e) => setNuevoItem(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={guardando}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          + Agregar
        </button>
      </form>
    </div>
  )
}
