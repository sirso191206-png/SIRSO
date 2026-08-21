import { useState } from 'react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

const CAMPOS = [
  { clave: 'gestas', etiqueta: 'Gestas', tipo: 'number' },
  { clave: 'partos', etiqueta: 'Partos', tipo: 'number' },
  { clave: 'cesareas', etiqueta: 'Cesáreas', tipo: 'number' },
  { clave: 'abortos', etiqueta: 'Abortos', tipo: 'number' },
  { clave: 'fecha_ultima_menstruacion', etiqueta: 'Fecha de última menstruación', tipo: 'date' },
  { clave: 'metodo_anticonceptivo', etiqueta: 'Método anticonceptivo', tipo: 'text' },
]

function datosIniciales(valor) {
  const base = valor || {}
  return {
    gestas: base.gestas ?? '', partos: base.partos ?? '', cesareas: base.cesareas ?? '',
    abortos: base.abortos ?? '', fecha_ultima_menstruacion: base.fecha_ultima_menstruacion ?? '',
    metodo_anticonceptivo: base.metodo_anticonceptivo ?? '', notas: base.notas ?? '',
  }
}

export function EditorGinecoObstetrico({ valor, onGuardar }) {
  const yaTieneDatos = valor && Object.values(valor).some((v) => v)
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState(() => datosIniciales(valor))
  const [guardando, setGuardando] = useState(false)

  const campo = (clave) => (e) => setForm((f) => ({ ...f, [clave]: e.target.value }))

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const algo = Object.entries(form).some(([, v]) => v !== '')
      await onGuardar(algo ? form : null)
      setAbierto(false)
    } finally {
      setGuardando(false)
    }
  }

  if (!abierto) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Antecedentes gineco-obstétricos</span>
          <button type="button" onClick={() => { setForm(datosIniciales(valor)); setAbierto(true) }} className="text-xs font-medium text-clinico-azul hover:underline">
            {yaTieneDatos ? 'Editar' : '+ Agregar (opcional)'}
          </button>
        </div>
        {yaTieneDatos ? (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            {valor.gestas && <span>Gestas: {valor.gestas}</span>}
            {valor.partos && <span>Partos: {valor.partos}</span>}
            {valor.cesareas && <span>Cesáreas: {valor.cesareas}</span>}
            {valor.abortos && <span>Abortos: {valor.abortos}</span>}
            {valor.fecha_ultima_menstruacion && <span>FUM: {valor.fecha_ultima_menstruacion}</span>}
            {valor.metodo_anticonceptivo && <span>Método anticonceptivo: {valor.metodo_anticonceptivo}</span>}
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-400">No registrados — opcional, se captura solo si la clínica lo considera relevante.</p>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={guardar} className="rounded-xl border border-slate-200 bg-white p-4">
      <span className="mb-3 block text-sm font-semibold text-slate-700">Antecedentes gineco-obstétricos</span>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CAMPOS.map((c) => (
          <Input key={c.clave} label={c.etiqueta} type={c.tipo} value={form[c.clave]} onChange={campo(c.clave)} />
        ))}
      </div>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Notas (opcional)</span>
        <textarea value={form.notas} onChange={campo('notas')} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </label>
      <div className="mt-3 flex gap-2">
        <Button type="button" variante="secundario" onClick={() => setAbierto(false)} disabled={guardando}>Cancelar</Button>
        <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </form>
  )
}
