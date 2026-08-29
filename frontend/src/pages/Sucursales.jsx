import { useState } from 'react'
import { useSucursales } from '../hooks/useSucursales'
import { useAuthStore } from '../store/useAuthStore'
import { toastExito, toastError } from '../store/useToastStore'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { DetalleSucursal } from '../components/sucursales/DetalleSucursal'

export function Sucursales() {
  const perfil = useAuthStore((s) => s.perfil)
  const { sucursales, cargando, crear, cambiarActiva } = useSucursales()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [expandidaId, setExpandidaId] = useState(null)

  if (perfil?.rol !== 'owner') {
    return <p className="text-slate-400">Esta sección solo está disponible para el owner de la clínica.</p>
  }

  const handleCambiarActiva = async (s) => {
    try {
      await cambiarActiva(s.id, !s.activa)
      toastExito(s.activa ? `${s.nombre} desactivada.` : `${s.nombre} reactivada.`)
    } catch (err) {
      toastError(err.message)
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Sucursales</h1>
        <Button onClick={() => setModalAbierto(true)}>+ Nueva sucursal</Button>
      </div>
      <p className="mb-6 text-sm text-slate-400">
        Si tu clínica opera en un solo lugar, no necesitas crear ninguna sucursal — todo sigue funcionando exactamente
        igual. Esto es solo para clínicas con más de una ubicación.
      </p>

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : sucursales.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          Todavía no has creado ninguna sucursal.
        </p>
      ) : (
        <div className="space-y-3">
          {sucursales.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setExpandidaId(expandidaId === s.id ? null : s.id)}
                  className="flex items-center gap-2 text-left"
                >
                  <span className="text-slate-400">{expandidaId === s.id ? '▾' : '▸'}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{s.nombre}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.activa ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'}`}>
                        {s.activa ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                    {(s.direccion || s.telefono) && (
                      <p className="text-xs text-slate-400">
                        {[s.direccion, s.telefono].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </button>
                <button onClick={() => handleCambiarActiva(s)} className="text-xs text-slate-500 hover:underline">
                  {s.activa ? 'Desactivar' : 'Reactivar'}
                </button>
              </div>

              {expandidaId === s.id && (
                <div className="mt-4">
                  <DetalleSucursal sucursal={s} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ModalNuevaSucursal
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        clinicaId={perfil?.clinica_id}
        onCrear={crear}
      />
    </div>
  )
}

function ModalNuevaSucursal({ abierto, onCerrar, clinicaId, onCrear }) {
  const [form, setForm] = useState({ nombre: '', direccion: '', telefono: '', whatsapp: '', correo: '' })
  const [guardando, setGuardando] = useState(false)

  const campo = (clave) => (e) => setForm((f) => ({ ...f, [clave]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) return
    setGuardando(true)
    try {
      await onCrear({ clinica_id: clinicaId, ...form })
      toastExito(`Sucursal "${form.nombre}" creada.`)
      setForm({ nombre: '', direccion: '', telefono: '', whatsapp: '', correo: '' })
      onCerrar()
    } catch (err) {
      toastError('No se pudo crear la sucursal: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Nueva sucursal">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input label="Nombre" required value={form.nombre} onChange={campo('nombre')} placeholder="Ej. Sucursal Centro" />
        <Input label="Dirección" value={form.direccion} onChange={campo('direccion')} />
        <Input label="Teléfono" value={form.telefono} onChange={campo('telefono')} />
        <Input label="WhatsApp" value={form.whatsapp} onChange={campo('whatsapp')} />
        <Input label="Correo" type="email" value={form.correo} onChange={campo('correo')} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variante="secundario" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button type="submit" disabled={guardando || !form.nombre.trim()}>
            {guardando ? 'Creando…' : 'Crear sucursal'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
