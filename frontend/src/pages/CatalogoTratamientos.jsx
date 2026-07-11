import { useState } from 'react'
import { useCatalogoTratamientos } from '../hooks/useCatalogoTratamientos'
import { useAuthStore } from '../store/useAuthStore'
import { toastExito, toastError } from '../store/useToastStore'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'

export function CatalogoTratamientos() {
  const perfil = useAuthStore((s) => s.perfil)
  const { catalogo, cargando, agregar, actualizar } = useCatalogoTratamientos({ soloActivos: false })
  const [modalAbierto, setModalAbierto] = useState(false)
  const [itemEditar, setItemEditar] = useState(null)

  if (!['owner', 'dentista'].includes(perfil?.rol)) {
    return <p className="text-slate-400">Esta sección solo está disponible para owner y dentista.</p>
  }

  const handleToggleActivo = async (item) => {
    try {
      await actualizar(item.id, { activo: !item.activo })
      toastExito(item.activo ? 'Desactivado del catálogo.' : 'Reactivado en el catálogo.')
    } catch (err) {
      toastError(err.message)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Catálogo de tratamientos</h1>
          <p className="text-sm text-slate-500">Se usa para autocompletar precio y categoría al agregar un tratamiento a un paciente.</p>
        </div>
        <Button onClick={() => setModalAbierto(true)}>+ Nuevo tratamiento</Button>
      </div>

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Categoría</th>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Precio</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {catalogo.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-500">{c.categoria || '—'}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => setItemEditar(c)} className="font-medium text-slate-800 hover:text-clinico-azul">
                      {c.nombre}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-slate-600">${Number(c.precio).toFixed(2)}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.activo ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'}`}>
                      {c.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => handleToggleActivo(c)} className="text-xs font-medium text-clinico-azul hover:underline">
                      {c.activo ? 'Desactivar' : 'Reactivar'}
                    </button>
                  </td>
                </tr>
              ))}
              {catalogo.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Sin tratamientos en el catálogo todavía.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ModalItem abierto={modalAbierto} onCerrar={() => setModalAbierto(false)} onGuardar={agregar} titulo="Nuevo tratamiento del catálogo" />
      {itemEditar && (
        <ModalItem
          abierto
          onCerrar={() => setItemEditar(null)}
          onGuardar={(cambios) => actualizar(itemEditar.id, cambios)}
          titulo="Editar tratamiento del catálogo"
          valorInicial={itemEditar}
        />
      )}
    </div>
  )
}

function ModalItem({ abierto, onCerrar, onGuardar, titulo, valorInicial }) {
  const [categoria, setCategoria] = useState(valorInicial?.categoria ?? '')
  const [nombre, setNombre] = useState(valorInicial?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(valorInicial?.descripcion ?? '')
  const [precio, setPrecio] = useState(valorInicial?.precio ?? '')
  const [guardando, setGuardando] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      await onGuardar({ categoria: categoria || null, nombre, descripcion: descripcion || null, precio: Number(precio) })
      toastExito('Catálogo actualizado.')
      onCerrar()
    } catch (err) {
      toastError('No se pudo guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={titulo}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Categoría (opcional)" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ej. Preventivo, Restaurativo, Estético" />
        <Input label="Nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Limpieza dental" />
        <Input label="Descripción (opcional)" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        <Input label="Precio" type="number" step="0.01" required value={precio} onChange={(e) => setPrecio(e.target.value)} />
        <Button type="submit" disabled={guardando} className="w-full">{guardando ? 'Guardando…' : 'Guardar'}</Button>
      </form>
    </Modal>
  )
}
