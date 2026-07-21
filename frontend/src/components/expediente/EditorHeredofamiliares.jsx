import { useState } from 'react'
import { toastExito, toastError } from '../../store/useToastStore'
import { Button } from '../ui/Button'

const PARENTESCOS = [
  'Padre', 'Madre', 'Hermano/a', 'Abuelo paterno', 'Abuela paterna',
  'Abuelo materno', 'Abuela materna', 'Hijo/a', 'Otro familiar'
]

const CATALOGO_ENFERMEDADES = [
  'Diabetes', 'Hipertensión', 'Cáncer', 'Cardiopatías', 'Enfermedades renales',
  'Enfermedades hepáticas', 'Enfermedades pulmonares', 'Enfermedades tiroideas',
  'Enfermedades autoinmunes', 'Trastornos psiquiátricos', 'Tuberculosis', 'VIH',
  'Enfermedades hereditarias', 'Alergias', 'Otro'
]

function familiarVacio() {
  return { parentesco: 'Padre', enfermedades: [], notas: '' }
}

export function EditorHeredofamiliares({ familiares, onGuardar }) {
  const [editando, setEditando] = useState(false)
  const [lista, setLista] = useState(familiares?.length ? familiares : [])
  const [guardando, setGuardando] = useState(false)

  const iniciarEdicion = () => {
    setLista(familiares?.length ? familiares : [familiarVacio()])
    setEditando(true)
  }

  const actualizarFamiliar = (indice, cambios) => {
    setLista((actual) => actual.map((f, i) => (i === indice ? { ...f, ...cambios } : f)))
  }

  const alternarEnfermedad = (indice, enfermedad) => {
    setLista((actual) => actual.map((f, i) => {
      if (i !== indice) return f
      const yaEsta = f.enfermedades.includes(enfermedad)
      return { ...f, enfermedades: yaEsta ? f.enfermedades.filter((e) => e !== enfermedad) : [...f.enfermedades, enfermedad] }
    }))
  }

  const agregarFamiliar = () => setLista((actual) => [...actual, familiarVacio()])
  const quitarFamiliar = (indice) => setLista((actual) => actual.filter((_, i) => i !== indice))

  const handleGuardar = async () => {
    setGuardando(true)
    try {
      await onGuardar(lista)
      toastExito('Antecedentes heredofamiliares actualizados.')
      setEditando(false)
    } catch (err) {
      toastError('No se pudo guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (!editando) {
    return (
      <div className="rounded-xl border border-slate-200 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Antecedentes heredofamiliares</span>
          <button type="button" onClick={iniciarEdicion} className="text-xs font-medium text-clinico-azul hover:underline">
            Editar
          </button>
        </div>
        {(!familiares || familiares.length === 0) ? (
          <p className="text-sm text-slate-400">Sin antecedentes heredofamiliares registrados.</p>
        ) : (
          <div className="space-y-2">
            {familiares.map((f, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium text-slate-800">{f.parentesco}</span>
                {f.enfermedades.length > 0 && (
                  <span className="text-slate-600">: {f.enfermedades.join(', ')}</span>
                )}
                {f.notas && <span className="text-slate-400"> — {f.notas}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <span className="mb-3 block text-sm font-semibold text-slate-700">Antecedentes heredofamiliares</span>

      <div className="space-y-3">
        {lista.map((f, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <select
                value={f.parentesco}
                onChange={(e) => actualizarFamiliar(i, { parentesco: e.target.value })}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
              >
                {PARENTESCOS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              {lista.length > 1 && (
                <button type="button" onClick={() => quitarFamiliar(i)} className="text-xs text-clinico-rojo hover:underline">
                  Quitar
                </button>
              )}
            </div>

            <div className="mb-2 flex flex-wrap gap-2">
              {CATALOGO_ENFERMEDADES.map((enf) => {
                const activo = f.enfermedades.includes(enf)
                return (
                  <button
                    key={enf}
                    type="button"
                    onClick={() => alternarEnfermedad(i, enf)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      activo ? 'border-clinico-azul bg-clinico-azulClaro text-clinico-azul' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {enf}
                  </button>
                )
              })}
            </div>

            <input
              value={f.notas}
              onChange={(e) => actualizarFamiliar(i, { notas: e.target.value })}
              placeholder="Notas adicionales (opcional)"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
        ))}
      </div>

      <button type="button" onClick={agregarFamiliar} className="mt-3 text-sm font-medium text-clinico-azul hover:underline">
        + Agregar familiar
      </button>

      <div className="mt-3 flex items-center gap-3">
        <Button variante="secundario" onClick={handleGuardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
        <button type="button" onClick={() => setEditando(false)} className="text-sm text-slate-400 hover:text-slate-600">
          Cancelar
        </button>
      </div>
    </div>
  )
}
