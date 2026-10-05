import { useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { BarraUso } from './BarraUso'
import { ListaFuncionalidades } from './ListaFuncionalidades'
import {
  ajustarCondicionesClinica, asignarPlanClinica, listarPlanes, reactivarSuscripcion,
  suscripcionDeClinica, suspenderSuscripcion
} from '../../services/planes'
import { etiquetaPeriodo, formatearLimite, formatearPrecio, mensajeExceso, modalidadesPermitidas, precioDePlan } from '../../lib/planes'
import { toastExito, toastError } from '../../store/useToastStore'

const CLASE_INPUT = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm'
const LIMITES = [
  ['max_pacientes', 'Pacientes'], ['max_usuarios', 'Usuarios'], ['max_sucursales', 'Sucursales'],
  ['max_sesiones', 'Sesiones simultáneas'], ['max_almacenamiento_mb', 'Almacenamiento (MB, no se aplica aún)']
]

// Suscripción de UNA clínica (lo que contrató, su snapshot), vista del superadmin.
export function PanelSuscripcionClinica({ clinicaId, onCambio }) {
  const [datos, setDatos] = useState(null)
  const [planes, setPlanes] = useState([])
  const [error, setError] = useState(null)
  const [cambio, setCambio] = useState({ plan: '', modalidad: 'mensual', precio: '' })
  const [ocupado, setOcupado] = useState(false)
  const [avisos, setAvisos] = useState([])
  const [ajustando, setAjustando] = useState(null)
  const [suspendiendo, setSuspendiendo] = useState(null)

  async function cargar() {
    try {
      setError(null)
      const [d, p] = await Promise.all([suscripcionDeClinica(clinicaId), listarPlanes()])
      setDatos(d)
      setPlanes(p)
      setCambio((c) => ({ ...c, plan: c.plan || d.vigente?.plan || p.find((x) => x.activo)?.plan || '', modalidad: d.vigente?.modalidad ?? 'mensual' }))
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaId])

  async function ejecutar(fn, exito) {
    setOcupado(true)
    try {
      const r = await fn()
      toastExito(exito)
      setAvisos((r?.excesos ?? []).map(mensajeExceso))
      await cargar()
      onCambio?.()
    } catch (err) {
      toastError(err.message)
    } finally {
      setOcupado(false)
    }
  }

  if (error) return <p className="mb-6 text-sm text-clinico-rojo">{error}</p>
  if (!datos) return <p className="mb-6 text-sm text-slate-400">Cargando suscripción…</p>

  const v = datos.vigente
  const planElegido = planes.find((p) => p.plan === cambio.plan)
  const modalidades = modalidadesPermitidas(planElegido)
  const precioSugerido = precioDePlan(planElegido, cambio.modalidad)
  const suspendida = v?.estado === 'suspendida'

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold text-slate-700">Suscripción y plan</div>
        {v && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${suspendida ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
            {suspendida ? 'Suspendida' : 'Activa'}
          </span>
        )}
      </div>

      {!v ? (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Esta clínica no tiene suscripción (se creó por una vía anterior a los planes): no tiene límites ni restricciones de funcionalidad. Asígnale un plan abajo para empezar a medirla.
        </p>
      ) : (
        <>
          <div className="mb-4 grid gap-2 text-sm sm:grid-cols-4">
            <div><span className="block text-slate-400">Plan</span><span className="font-medium">{v.plan_nombre ?? v.plan}</span></div>
            <div><span className="block text-slate-400">Modalidad</span><span className="font-medium capitalize">{v.modalidad}</span></div>
            <div><span className="block text-slate-400">Precio contratado</span>
              <span className="font-medium">{v.precio_contratado == null ? 'No registrado' : `${formatearPrecio(v.precio_contratado, v.moneda)} / ${etiquetaPeriodo(v.modalidad)}`}</span></div>
            <div><span className="block text-slate-400">Desde</span><span className="font-medium">{v.fecha_inicio}</span></div>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <BarraUso etiqueta="Pacientes" usado={datos.uso.pacientes} limite={v.limites.max_pacientes} />
            <BarraUso etiqueta="Usuarios" usado={datos.uso.usuarios} limite={v.limites.max_usuarios} />
            <BarraUso etiqueta="Sucursales" usado={datos.uso.sucursales} limite={v.limites.max_sucursales} />
          </div>
          <p className="mb-4 text-xs text-slate-500">
            Sesiones simultáneas: {formatearLimite(v.limites.max_sesiones)} · Almacenamiento: {formatearLimite(v.limites.max_almacenamiento_mb)} {v.limites.max_almacenamiento_mb != null && 'MB (no se aplica aún)'}
          </p>
          {datos.excesos.length > 0 && (
            <div className="mb-4 space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              {datos.excesos.map((e) => <p key={e.tipo}>{mensajeExceso(e)}</p>)}
            </div>
          )}
          <div className="mb-4"><ListaFuncionalidades funcionalidades={v.funcionalidades} mostrarAplicacion /></div>
        </>
      )}

      {avisos.length > 0 && (
        <div className="mb-4 space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {avisos.map((a) => <p key={a}>{a}</p>)}
        </div>
      )}

      <div className="rounded-lg bg-slate-50 p-3">
        <div className="mb-2 text-sm font-medium text-slate-700">{v ? 'Cambiar plan' : 'Asignar plan'}</div>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-sm"><span className="mb-1 block text-slate-500">Plan</span>
            <select className={CLASE_INPUT} value={cambio.plan} onChange={(e) => setCambio((c) => ({ ...c, plan: e.target.value }))}>
              {planes.filter((p) => p.activo || p.plan === cambio.plan).map((p) => <option key={p.plan} value={p.plan}>{p.nombre ?? p.plan}{p.activo ? '' : ' (inactivo)'}</option>)}
            </select></label>
          <label className="text-sm"><span className="mb-1 block text-slate-500">Modalidad</span>
            <select className={CLASE_INPUT} value={cambio.modalidad} onChange={(e) => setCambio((c) => ({ ...c, modalidad: e.target.value }))}>
              {modalidades.map((m) => <option key={m} value={m}>{m === 'anual' ? 'Anual' : 'Mensual'}</option>)}
            </select></label>
          <label className="text-sm"><span className="mb-1 block text-slate-500">Precio (opcional)</span>
            <input type="number" min="0" step="0.01" className={CLASE_INPUT} placeholder={precioSugerido == null ? '' : String(precioSugerido)} value={cambio.precio} onChange={(e) => setCambio((c) => ({ ...c, precio: e.target.value }))} /></label>
          <div className="flex items-end">
            <Button disabled={ocupado || !cambio.plan}
              onClick={() => ejecutar(() => asignarPlanClinica({ clinicaId, plan: cambio.plan, modalidad: cambio.modalidad, precio: cambio.precio === '' ? null : Number(cambio.precio) }),
                v?.plan === cambio.plan ? 'Condiciones del plan aplicadas.' : 'Plan actualizado.')}>
              {ocupado ? 'Guardando…' : v?.plan === cambio.plan ? 'Aplicar condiciones actuales' : v ? 'Cambiar plan' : 'Asignar plan'}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Se crea una suscripción nueva con el snapshot de hoy; la anterior queda en el historial. Si la clínica ya supera algún límite del plan nuevo, NO se borra nada: solo se bloquean altas nuevas.
        </p>
      </div>

      {v && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variante="secundario" onClick={() => setAjustando({ limites: Object.fromEntries(LIMITES.map(([k]) => [k, v.limites[k] == null ? '' : String(v.limites[k])])), funcionalidades: Object.fromEntries(v.funcionalidades.map((f) => [f.codigo, f.habilitada])) })}>
            Ajustar condiciones de esta clínica
          </Button>
          {suspendida
            ? <Button variante="secundario" disabled={ocupado} onClick={() => ejecutar(() => reactivarSuscripcion(clinicaId), 'Suscripción reactivada.')}>Reactivar</Button>
            : <Button variante="peligro" disabled={ocupado} onClick={() => setSuspendiendo({ motivo: '' })}>Suspender</Button>}
        </div>
      )}

      {datos.historial.length > 1 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-slate-600">Historial de suscripciones ({datos.historial.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {datos.historial.map((h) => (
              <li key={h.id}>{h.plan} · {h.modalidad} · {formatearPrecio(h.precio_contratado, h.moneda)} · {h.fecha_inicio}{h.fecha_fin ? ` → ${h.fecha_fin}` : ''} · {h.estado}</li>
            ))}
          </ul>
        </details>
      )}

      <Modal abierto={!!ajustando} onCerrar={() => setAjustando(null)} titulo="Ajustar condiciones de esta clínica" ancho="grande">
        {ajustando && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">Cambios a la medida solo para esta clínica; no tocan el plan. Vacío = ilimitado.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {LIMITES.map(([k, etiqueta]) => (
                <label key={k} className="text-sm"><span className="mb-1 block text-slate-500">{etiqueta}</span>
                  <input type="number" min="0" className={CLASE_INPUT} placeholder="Ilimitado" value={ajustando.limites[k]}
                    onChange={(e) => setAjustando((a) => ({ ...a, limites: { ...a.limites, [k]: e.target.value } }))} /></label>
              ))}
            </div>
            <div className="grid gap-1 sm:grid-cols-2">
              {v.funcionalidades.map((f) => (
                <label key={f.codigo} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={!!ajustando.funcionalidades[f.codigo]} disabled={f.nucleo}
                    onChange={(e) => setAjustando((a) => ({ ...a, funcionalidades: { ...a.funcionalidades, [f.codigo]: e.target.checked } }))} />
                  {f.nombre}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variante="secundario" onClick={() => setAjustando(null)}>Cancelar</Button>
              <Button disabled={ocupado} onClick={async () => {
                const limites = Object.fromEntries(LIMITES.map(([k]) => [k, ajustando.limites[k] === '' ? null : Number(ajustando.limites[k])]))
                const funcs = Object.fromEntries(v.funcionalidades.filter((f) => !f.nucleo).map((f) => [f.codigo, !!ajustando.funcionalidades[f.codigo]]))
                await ejecutar(() => ajustarCondicionesClinica(clinicaId, limites, funcs), 'Condiciones ajustadas.')
                setAjustando(null)
              }}>Guardar ajustes</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal abierto={!!suspendiendo} onCerrar={() => setSuspendiendo(null)} titulo="Suspender suscripción">
        {suspendiendo && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">Los usuarios de la clínica no podrán entrar hasta que la reactives. No se borra nada.</p>
            <input className={CLASE_INPUT} placeholder="Motivo (opcional)" value={suspendiendo.motivo} onChange={(e) => setSuspendiendo({ motivo: e.target.value })} />
            <div className="flex justify-end gap-2">
              <Button variante="secundario" onClick={() => setSuspendiendo(null)}>Cancelar</Button>
              <Button variante="peligro" disabled={ocupado} onClick={async () => { await ejecutar(() => suspenderSuscripcion(clinicaId, suspendiendo.motivo || null), 'Suscripción suspendida.'); setSuspendiendo(null) }}>Suspender</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
