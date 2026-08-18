import { useState } from 'react'
import { toastExito, toastError } from '../../store/useToastStore'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'

export function ModalTratamiento({ abierto, onCerrar, onGuardar, catalogo, perfil, titulo, valorInicial }) {
  const [catalogoId, setCatalogoId] = useState('')
  const [descripcion, setDescripcion] = useState(valorInicial?.descripcion ?? '')
  const [categoria, setCategoria] = useState(valorInicial?.categoria ?? '')
  const [costo, setCosto] = useState(valorInicial?.costo ?? '')
  const [descuento, setDescuento] = useState(valorInicial?.descuento ?? 0)
  const [piezaDental, setPiezaDental] = useState(valorInicial?.pieza_dental ?? '')
  const [diagnostico, setDiagnostico] = useState(valorInicial?.diagnostico_relacionado ?? '')
  const [numeroSesiones, setNumeroSesiones] = useState(valorInicial?.numero_sesiones ?? 1)
  const [fechaInicio, setFechaInicio] = useState(valorInicial?.fecha_inicio ?? '')
  const [fechaEstimadaFin, setFechaEstimadaFin] = useState(valorInicial?.fecha_estimada_fin ?? '')
  const [notas, setNotas] = useState(valorInicial?.notas ?? '')
  const [guardando, setGuardando] = useState(false)

  const handleCatalogoChange = (id) => {
    setCatalogoId(id)
    const item = catalogo.find((c) => c.id === id)
    if (item) {
      setDescripcion(item.nombre)
      setCategoria(item.categoria ?? '')
      setCosto(item.precio)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      await onGuardar({
        catalogo_id: catalogoId || null,
        descripcion,
        categoria: categoria || null,
        costo: Number(costo),
        descuento: Number(descuento) || 0,
        pieza_dental: piezaDental || null,
        diagnostico_relacionado: diagnostico || null,
        numero_sesiones: Number(numeroSesiones) || 1,
        fecha_inicio: fechaInicio || null,
        fecha_estimada_fin: fechaEstimadaFin || null,
        notas: notas || null,
        dentista_id: valorInicial?.dentista_id ?? perfil.id
      })
      toastExito(valorInicial ? 'Tratamiento actualizado.' : 'Tratamiento agregado.')
      onCerrar()
    } catch (err) {
      toastError('No se pudo guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={titulo}>
      <form onSubmit={handleSubmit} className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
        {catalogo.length > 0 && !valorInicial && (
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Elegir del catálogo (opcional)</span>
            <select value={catalogoId} onChange={(e) => handleCatalogoChange(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Escribir manualmente</option>
              {catalogo.map((c) => (
                <option key={c.id} value={c.id}>{c.categoria ? `${c.categoria} — ` : ''}{c.nombre} (${Number(c.precio).toFixed(2)})</option>
              ))}
            </select>
          </label>
        )}

        <Input label="Descripción" required value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Categoría (opcional)" value={categoria} onChange={(e) => setCategoria(e.target.value)} />
          <Input label="Pieza dental (opcional)" value={piezaDental} onChange={(e) => setPiezaDental(e.target.value)} placeholder="Ej. 14" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Costo" type="number" step="0.01" required value={costo} onChange={(e) => setCosto(e.target.value)} />
          <Input label="Descuento (opcional)" type="number" step="0.01" value={descuento} onChange={(e) => setDescuento(e.target.value)} />
        </div>

        <Input label="Diagnóstico relacionado (opcional)" value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} />

        <div className="grid grid-cols-3 gap-3">
          <Input label="N.º de sesiones" type="number" min="1" value={numeroSesiones} onChange={(e) => setNumeroSesiones(e.target.value)} />
          <Input label="Fecha inicio" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          <Input label="Fin estimado" type="date" value={fechaEstimadaFin} onChange={(e) => setFechaEstimadaFin(e.target.value)} />
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Notas (opcional)</span>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>

        <Button type="submit" disabled={guardando} className="w-full">
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      </form>
    </Modal>
  )
}
