import { useState } from 'react'
import { CampoAutocompletar } from './CampoAutocompletar'
import { SUGERENCIAS_ENFERMEDADES, OPCIONES_CONTROLADA } from './catalogosAntecedentes'

function esTextoSimple(item) {
  return typeof item === 'string'
}

export function EditorEnfermedades({ items, onGuardar }) {
  const [nombre, setNombre] = useState('')
  const [detalleAbierto, setDetalleAbierto] = useState(false)
  const [desdeCuando, setDesdeCuando] = useState('')
  const [controlada, setControlada] = useState('')
  const [medicacion, setMedicacion] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)

  const lista = Array.isArray(items) ? items : []

  const limpiar = () => {
    setNombre(''); setDetalleAbierto(false); setDesdeCuando(''); setControlada(''); setMedicacion(''); setNotas('')
  }

  const agregar = async (e) => {
    e.preventDefault()
    if (!nombre.trim()) return
    setGuardando(true)
    try {
      const tieneDetalle = desdeCuando || controlada || medicacion || notas
      const nuevoItem = tieneDetalle
        ? { nombre: nombre.trim(), desde_cuando: desdeCuando || null, controlada: controlada || null, medicacion: medicacion || null, notas: notas || null }
        : nombre.trim()
      await onGuardar([...lista, nuevoItem])
      limpiar()
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
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <span className="mb-2 block text-sm font-semibold text-slate-700">Enfermedades actuales</span>

      {lista.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {lista.map((item, i) => (
            <div key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <span className="font-medium">{esTextoSimple(item) ? item : item.nombre}</span>
                <button onClick={() => quitar(i)} disabled={guardando} className="text-slate-400 hover:text-clinico-rojo">✕</button>
              </div>
              {!esTextoSimple(item) && (item.desde_cuando || item.controlada || item.medicacion || item.notas) && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  {item.desde_cuando && <span>Desde: {item.desde_cuando}</span>}
                  {item.controlada && <span>{OPCIONES_CONTROLADA.find((o) => o.value === item.controlada)?.label}</span>}
                  {item.medicacion && <span>Medicación: {item.medicacion}</span>}
                  {item.notas && <span>{item.notas}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {lista.length === 0 && <p className="mb-2 text-xs text-slate-400">Ninguna registrada.</p>}

      <form onSubmit={agregar} className="space-y-2">
        <div className="flex gap-2">
          <CampoAutocompletar
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            sugerencias={SUGERENCIAS_ENFERMEDADES}
            placeholder="Ej. Diabetes tipo 2"
          />
          <button
            type="submit"
            disabled={guardando}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            + Agregar
          </button>
        </div>

        {!detalleAbierto && nombre && (
          <button type="button" onClick={() => setDetalleAbierto(true)} className="text-xs text-clinico-azul hover:underline">
            + Agregar detalle (desde cuándo, si está controlada, medicación)
          </button>
        )}

        {detalleAbierto && (
          <div className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
            <input
              value={desdeCuando}
              onChange={(e) => setDesdeCuando(e.target.value)}
              placeholder="Desde cuándo (ej. 2018)"
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            />
            <select value={controlada} onChange={(e) => setControlada(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
              {OPCIONES_CONTROLADA.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input
              value={medicacion}
              onChange={(e) => setMedicacion(e.target.value)}
              placeholder="Medicación"
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            />
            <input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Notas (opcional)"
              className="col-span-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            />
          </div>
        )}
      </form>
    </div>
  )
}
