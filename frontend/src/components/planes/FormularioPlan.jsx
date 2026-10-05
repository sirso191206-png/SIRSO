import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { guardarPlan, guardarFuncionalidadesDePlan, funcionalidadesDePlan } from '../../services/planes'
import { agruparFuncionalidades, formularioDesdePlan, planDesdeFormulario, validarFormularioPlan } from '../../lib/planes'
import { toastExito, toastError } from '../../store/useToastStore'

const PESTANAS = [
  { id: 'datos', etiqueta: 'Datos generales' },
  { id: 'precios', etiqueta: 'Precios' },
  { id: 'limites', etiqueta: 'Límites' },
  { id: 'funcionalidades', etiqueta: 'Funcionalidades' }
]

const CLASE_INPUT = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm'

function Campo({ etiqueta, error, ayuda, children }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-500">{etiqueta}</span>
      {children}
      {ayuda && !error && <span className="mt-1 block text-xs text-slate-400">{ayuda}</span>}
      {error && <span className="mt-1 block text-xs text-clinico-rojo">{error}</span>}
    </label>
  )
}

function Casilla({ etiqueta, checked, onChange, deshabilitada = false }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={checked} disabled={deshabilitada} onChange={(e) => onChange(e.target.checked)} />
      {etiqueta}
    </label>
  )
}

// Crea (plan = null) o edita un plan. Las funcionalidades del plan se guardan
// aparte (sa_set_plan_funcionalidades) con su propia auditoría.
export function FormularioPlan({ abierto, onCerrar, plan, pestanaInicial = 'datos', onGuardado }) {
  const esNuevo = !plan
  const [pestana, setPestana] = useState(pestanaInicial)
  const [form, setForm] = useState(() => formularioDesdePlan(plan))
  const [funcs, setFuncs] = useState(null)
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    setPestana(pestanaInicial)
    setForm(formularioDesdePlan(plan))
    setErrores({})
    setFuncs(null)
    // Plan nuevo: se pide con un código que no existe → todas las funcionalidades, sin marcar.
    funcionalidadesDePlan(plan?.plan ?? '__nuevo__').then(setFuncs).catch((e) => toastError('No se pudieron cargar las funcionalidades: ' + e.message))
  }, [abierto, plan, pestanaInicial])

  const cambiar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))

  const alternarFuncionalidad = (codigo, habilitada) =>
    setFuncs((lista) => lista.map((f) => (f.codigo === codigo ? { ...f, habilitada } : f)))

  async function guardar() {
    const errs = validarFormularioPlan(form, { esNuevo })
    setErrores(errs)
    if (Object.keys(errs).length > 0) {
      setPestana(errs.plan || errs.nombre ? 'datos' : errs.precio_mensual || errs.precio_anual || errs.permite_mensual ? 'precios' : 'limites')
      return
    }
    setGuardando(true)
    try {
      const payload = planDesdeFormulario(form)
      await guardarPlan(payload)
      if (funcs) {
        // Las del núcleo no se envían: están siempre incluidas y la base no deja desactivarlas.
        const mapa = Object.fromEntries(funcs.filter((f) => !f.nucleo).map((f) => [f.codigo, !!f.habilitada]))
        await guardarFuncionalidadesDePlan(payload.codigo, mapa)
      }
      toastExito(esNuevo ? 'Plan creado.' : 'Plan actualizado. Las clínicas ya contratadas conservan lo que contrataron.')
      onGuardado?.()
      onCerrar()
    } catch (err) {
      toastError('No se pudo guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={esNuevo ? 'Nuevo plan' : `Editar plan: ${plan.nombre ?? plan.plan}`} ancho="grande">
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {PESTANAS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setPestana(t.id)}
            className={`px-3 py-2 text-sm ${pestana === t.id ? 'border-b-2 border-clinico-azul font-medium text-clinico-azul' : 'text-slate-500'}`}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'datos' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Nombre" error={errores.nombre}>
              <input className={CLASE_INPUT} value={form.nombre} onChange={(e) => cambiar('nombre', e.target.value)} />
            </Campo>
            <Campo etiqueta="Código" error={errores.plan} ayuda={esNuevo ? 'Identificador único; no se puede cambiar después.' : 'No se puede cambiar.'}>
              <input className={CLASE_INPUT} value={form.plan} disabled={!esNuevo} onChange={(e) => cambiar('plan', e.target.value)} />
            </Campo>
          </div>
          <Campo etiqueta="Descripción">
            <textarea className={CLASE_INPUT} rows={2} value={form.descripcion} onChange={(e) => cambiar('descripcion', e.target.value)} />
          </Campo>
          <Campo etiqueta="Orden de aparición">
            <input type="number" className={`${CLASE_INPUT} w-32`} value={form.orden} onChange={(e) => cambiar('orden', e.target.value)} />
          </Campo>
          <div className="space-y-2">
            <Casilla etiqueta="Activo (se puede contratar)" checked={form.activo} onChange={(v) => cambiar('activo', v)} />
            <Casilla etiqueta="Visible para nuevas clínicas" checked={form.visible} onChange={(v) => cambiar('visible', v)} />
            <Casilla etiqueta="Plan recomendado" checked={form.recomendado} onChange={(v) => cambiar('recomendado', v)} />
          </div>
        </div>
      )}

      {pestana === 'precios' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo etiqueta="Precio mensual" error={errores.precio_mensual}>
              <input type="number" min="0" step="0.01" className={CLASE_INPUT} value={form.precio_mensual} onChange={(e) => cambiar('precio_mensual', e.target.value)} />
            </Campo>
            <Campo etiqueta="Precio anual" error={errores.precio_anual}>
              <input type="number" min="0" step="0.01" className={CLASE_INPUT} value={form.precio_anual} onChange={(e) => cambiar('precio_anual', e.target.value)} />
            </Campo>
            <Campo etiqueta="Moneda">
              <input className={CLASE_INPUT} value={form.moneda} maxLength={3} onChange={(e) => cambiar('moneda', e.target.value)} />
            </Campo>
          </div>
          <div className="space-y-2">
            <Casilla etiqueta="Permitir contratación mensual" checked={form.permite_mensual} onChange={(v) => cambiar('permite_mensual', v)} />
            <Casilla etiqueta="Permitir contratación anual" checked={form.permite_anual} onChange={(v) => cambiar('permite_anual', v)} />
            {errores.permite_mensual && <p className="text-xs text-clinico-rojo">{errores.permite_mensual}</p>}
          </div>
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            Cambiar un precio aplica a contrataciones NUEVAS. Cada clínica conserva el precio que contrató.
          </p>
        </div>
      )}

      {pestana === 'limites' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Deja un límite vacío para dejarlo ilimitado.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Máximo de pacientes" error={errores.max_pacientes}>
              <input type="number" min="0" className={CLASE_INPUT} placeholder="Ilimitado" value={form.max_pacientes} onChange={(e) => cambiar('max_pacientes', e.target.value)} />
            </Campo>
            <Campo etiqueta="Máximo de usuarios" error={errores.max_usuarios}>
              <input type="number" min="0" className={CLASE_INPUT} placeholder="Ilimitado" value={form.max_usuarios} onChange={(e) => cambiar('max_usuarios', e.target.value)} />
            </Campo>
            <Campo etiqueta="Máximo de sucursales" error={errores.limite_sucursales}>
              <input type="number" min="0" className={CLASE_INPUT} placeholder="Ilimitado" value={form.limite_sucursales} onChange={(e) => cambiar('limite_sucursales', e.target.value)} />
            </Campo>
            <Campo etiqueta="Sesiones simultáneas" error={errores.limite_sesiones_simultaneas}
              ayuda="Al superarlo se cierra la sesión más antigua del usuario.">
              <input type="number" min="0" className={CLASE_INPUT} placeholder="Ilimitado" value={form.limite_sesiones_simultaneas} onChange={(e) => cambiar('limite_sesiones_simultaneas', e.target.value)} />
            </Campo>
            <Campo etiqueta="Almacenamiento máximo (MB)" error={errores.max_almacenamiento_mb}
              ayuda="Se guarda, pero todavía NO se aplica: la base no mide el tamaño de los archivos.">
              <input type="number" min="0" className={CLASE_INPUT} placeholder="Ilimitado" value={form.max_almacenamiento_mb} onChange={(e) => cambiar('max_almacenamiento_mb', e.target.value)} />
            </Campo>
          </div>
        </div>
      )}

      {pestana === 'funcionalidades' && (
        <div>
          {!funcs ? (
            <p className="text-sm text-slate-400">Cargando…</p>
          ) : (
            <>
              <div className="space-y-4">
                {agruparFuncionalidades(funcs).map((g) => (
                  <div key={g.categoria}>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.etiqueta}</div>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {g.items.map((f) => (
                        <div key={f.codigo} className="flex items-center gap-2">
                          <Casilla etiqueta={f.nombre} checked={!!f.habilitada} deshabilitada={f.nucleo} onChange={(v) => alternarFuncionalidad(f.codigo, v)} />
                          {f.nucleo && <span className="text-[10px] text-slate-400">(siempre incluida)</span>}
                          {f.aplicacion === 'interfaz' && !f.nucleo && (
                            <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500" title="Solo oculta la interfaz; la base de datos no la bloquea">solo interfaz</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variante="secundario" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
        <Button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar plan'}</Button>
      </div>
    </Modal>
  )
}
