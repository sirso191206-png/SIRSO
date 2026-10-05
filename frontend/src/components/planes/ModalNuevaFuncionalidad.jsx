import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { guardarFuncionalidad } from '../../services/planes'
import { ETIQUETA_CATEGORIA, validarFuncionalidad } from '../../lib/planes'
import { toastExito, toastError } from '../../store/useToastStore'

const VACIO = { codigo: '', nombre: '', descripcion: '', categoria: 'general' }
const CLASE_INPUT = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm'

// Crea una funcionalidad del catálogo SIN tocar a las clínicas existentes. Opcional:
// habilitarla en planes concretos y —decisión explícita— también en las clínicas ya
// contratadas de esos planes. Siempre nace "solo interfaz": aplicarla en la base de
// datos exige una migración.
export function ModalNuevaFuncionalidad({ abierto, onCerrar, planes, onCreada }) {
  const [form, setForm] = useState(VACIO)
  const [planesElegidos, setPlanesElegidos] = useState([])
  const [aplicarExistentes, setAplicarExistentes] = useState(false)
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    setForm(VACIO)
    setPlanesElegidos([])
    setAplicarExistentes(false)
    setErrores({})
  }, [abierto])

  const alternarPlan = (codigo) =>
    setPlanesElegidos((l) => (l.includes(codigo) ? l.filter((c) => c !== codigo) : [...l, codigo]))

  async function guardar() {
    const errs = validarFuncionalidad(form)
    setErrores(errs)
    if (Object.keys(errs).length > 0) return
    setGuardando(true)
    try {
      await guardarFuncionalidad(
        { codigo: form.codigo.trim().toLowerCase(), nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null, categoria: form.categoria },
        planesElegidos.length > 0 ? planesElegidos : null,
        aplicarExistentes && planesElegidos.length > 0
      )
      toastExito('Funcionalidad creada.')
      onCreada?.()
      onCerrar()
    } catch (err) {
      toastError('No se pudo crear: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Nueva funcionalidad">
      <div className="space-y-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-slate-500">Código</span>
            <input className={CLASE_INPUT} value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))} />
            {errores.codigo && <span className="mt-1 block text-xs text-clinico-rojo">{errores.codigo}</span>}
          </label>
          <label className="block"><span className="mb-1 block text-slate-500">Nombre</span>
            <input className={CLASE_INPUT} value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
            {errores.nombre && <span className="mt-1 block text-xs text-clinico-rojo">{errores.nombre}</span>}
          </label>
        </div>
        <label className="block"><span className="mb-1 block text-slate-500">Descripción</span>
          <textarea className={CLASE_INPUT} rows={2} value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
        </label>
        <label className="block"><span className="mb-1 block text-slate-500">Categoría</span>
          <select className={CLASE_INPUT} value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}>
            {Object.entries(ETIQUETA_CATEGORIA).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
          </select>
        </label>

        <fieldset>
          <legend className="mb-1 text-slate-500">Incluir en estos planes (opcional)</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {planes.map((p) => (
              <label key={p.plan} className="flex items-center gap-2 text-slate-700">
                <input type="checkbox" checked={planesElegidos.includes(p.plan)} onChange={() => alternarPlan(p.plan)} />
                {p.nombre ?? p.plan}
              </label>
            ))}
          </div>
        </fieldset>
        <label className={`flex items-start gap-2 ${planesElegidos.length === 0 ? 'text-slate-300' : 'text-slate-700'}`}>
          <input type="checkbox" disabled={planesElegidos.length === 0} checked={aplicarExistentes} onChange={(e) => setAplicarExistentes(e.target.checked)} />
          <span>Dársela también a las clínicas YA contratadas de esos planes <span className="text-xs text-slate-400">(sin esto, solo la reciben las contrataciones nuevas)</span></span>
        </label>

        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          Una funcionalidad creada aquí es <strong>solo interfaz</strong>: sirve para marcar qué incluye cada plan y para ocultar pantallas,
          pero la base de datos no bloquea nada por ella (eso requiere una migración).
        </p>
        <div className="flex justify-end gap-2">
          <Button variante="secundario" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Crear funcionalidad'}</Button>
        </div>
      </div>
    </Modal>
  )
}
