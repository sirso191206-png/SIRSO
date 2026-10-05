import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { Button } from '../components/ui/Button'
import { FormularioPlan } from '../components/planes/FormularioPlan'
import { ModalClinicasDePlan } from '../components/planes/ModalClinicasDePlan'
import { HistorialPlanes } from '../components/planes/HistorialPlanes'
import { ResumenPlan } from '../components/planes/ResumenPlan'
import { ModalNuevaFuncionalidad } from '../components/planes/ModalNuevaFuncionalidad'
import { Modal } from '../components/ui/Modal'
import { activarPlan, duplicarPlan, funcionalidadesDePlan, listarPlanes } from '../services/planes'
import { formatearPrecio } from '../lib/planes'
import { toastExito, toastError } from '../store/useToastStore'

// /superadmin/planes — administrar planes comerciales sin tocar código. Todo se
// lee y se escribe en la base de datos; cada función se autoverifica como
// superadmin allá, esta pantalla solo la oculta a los demás.
export function SuperAdminPlanes() {
  const perfil = useAuthStore((s) => s.perfil)
  const [planes, setPlanes] = useState(null)
  const [error, setError] = useState(null)
  const [editando, setEditando] = useState(null) // { plan: obj|null, pestana }
  const [verClinicas, setVerClinicas] = useState(null)
  const [verResumen, setVerResumen] = useState(null) // { plan, funcionalidades }
  const [duplicando, setDuplicando] = useState(null)
  const [vista, setVista] = useState('planes')
  const [ocupado, setOcupado] = useState(null)
  const [nuevaFuncionalidad, setNuevaFuncionalidad] = useState(false)

  async function cargar() {
    try {
      setError(null)
      setPlanes(await listarPlanes())
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    if (perfil?.es_super_admin) cargar()
  }, [perfil?.es_super_admin])

  if (!perfil?.es_super_admin) return <p className="text-slate-400">No autorizado.</p>

  async function alternarActivo(p) {
    setOcupado(p.plan)
    try {
      await activarPlan(p.plan, !p.activo)
      toastExito(p.activo ? 'Plan desactivado: ya no se puede asignar a clínicas.' : 'Plan activado.')
      await cargar()
    } catch (err) {
      toastError(err.message)
    } finally {
      setOcupado(null)
    }
  }

  async function abrirResumen(p) {
    setVerResumen({ plan: p, funcionalidades: null })
    try {
      setVerResumen({ plan: p, funcionalidades: await funcionalidadesDePlan(p.plan) })
    } catch (err) {
      toastError(err.message)
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Planes</h1>
          <p className="text-sm text-slate-500">
            Precios, límites y funcionalidades. Los cambios aplican a contrataciones nuevas; cada clínica conserva lo que contrató.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variante="secundario" onClick={() => setVista(vista === 'planes' ? 'historial' : 'planes')}>
            {vista === 'planes' ? 'Historial de cambios' : 'Ver planes'}
          </Button>
          <Button variante="secundario" onClick={() => setNuevaFuncionalidad(true)}>Nueva funcionalidad</Button>
          <Button onClick={() => setEditando({ plan: null, pestana: 'datos' })}>Nuevo plan</Button>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-clinico-rojo">{error}</p>}

      {vista === 'historial' ? (
        <HistorialPlanes />
      ) : !planes ? (
        <p className="text-slate-400">Cargando…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Mensual</th>
                <th className="px-3 py-2">Anual</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Clínicas</th>
                <th className="px-3 py-2">Actualizado</th>
                <th className="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {planes.map((p) => (
                <tr key={p.plan} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{p.nombre ?? p.plan}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {p.recomendado && <span className="rounded-full bg-sky-100 px-2 text-[10px] text-sky-800">recomendado</span>}
                      {!p.visible && <span className="rounded-full bg-slate-100 px-2 text-[10px] text-slate-600">oculto</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{p.plan}</td>
                  <td className="px-3 py-2">{p.permite_mensual ? formatearPrecio(p.precio_mensual, p.moneda) : '—'}</td>
                  <td className="px-3 py-2">{p.permite_anual ? formatearPrecio(p.precio_anual, p.moneda) : '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.activo ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-3 py-2">{p.clinicas_usando}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{p.updated_at ? new Date(p.updated_at).toLocaleDateString('es-MX') : '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      <button className="text-clinico-azul hover:underline" onClick={() => setEditando({ plan: p, pestana: 'datos' })}>Editar</button>
                      <button className="text-clinico-azul hover:underline" disabled={ocupado === p.plan} onClick={() => alternarActivo(p)}>
                        {p.activo ? 'Desactivar' : 'Activar'}
                      </button>
                      <button className="text-clinico-azul hover:underline" onClick={() => setDuplicando({ origen: p, codigo: `${p.plan}_copia`, nombre: `${p.nombre ?? p.plan} (copia)` })}>Duplicar</button>
                      <button className="text-clinico-azul hover:underline" onClick={() => setEditando({ plan: p, pestana: 'funcionalidades' })}>Funcionalidades</button>
                      <button className="text-clinico-azul hover:underline" onClick={() => abrirResumen(p)}>Límites</button>
                      <button className="text-clinico-azul hover:underline" onClick={() => setVerClinicas(p)}>Clínicas</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FormularioPlan
        abierto={!!editando}
        plan={editando?.plan ?? null}
        pestanaInicial={editando?.pestana ?? 'datos'}
        onCerrar={() => setEditando(null)}
        onGuardado={cargar}
      />
      <ModalNuevaFuncionalidad abierto={nuevaFuncionalidad} onCerrar={() => setNuevaFuncionalidad(false)} planes={planes ?? []} onCreada={cargar} />
      {verClinicas && <ModalClinicasDePlan plan={verClinicas} onCerrar={() => setVerClinicas(null)} onCambio={cargar} />}

      <Modal abierto={!!verResumen} onCerrar={() => setVerResumen(null)} titulo={`Plan ${verResumen?.plan.nombre ?? ''}`}>
        {verResumen && <ResumenPlan plan={verResumen.plan} modalidad="mensual" funcionalidades={verResumen.funcionalidades} />}
      </Modal>

      <Modal abierto={!!duplicando} onCerrar={() => setDuplicando(null)} titulo="Duplicar plan">
        {duplicando && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-500">Se copian precios, límites y funcionalidades. El duplicado nace <strong>desactivado</strong> para revisarlo antes de ofrecerlo.</p>
            <label className="block">
              <span className="mb-1 block text-slate-500">Código nuevo</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2" value={duplicando.codigo} onChange={(e) => setDuplicando((d) => ({ ...d, codigo: e.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-500">Nombre</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2" value={duplicando.nombre} onChange={(e) => setDuplicando((d) => ({ ...d, nombre: e.target.value }))} />
            </label>
            <div className="flex justify-end gap-2">
              <Button variante="secundario" onClick={() => setDuplicando(null)}>Cancelar</Button>
              <Button
                onClick={async () => {
                  try {
                    await duplicarPlan(duplicando.origen.plan, duplicando.codigo, duplicando.nombre)
                    toastExito('Plan duplicado (desactivado).')
                    setDuplicando(null)
                    await cargar()
                  } catch (err) {
                    toastError(err.message)
                  }
                }}
              >
                Duplicar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
