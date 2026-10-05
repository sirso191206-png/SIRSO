import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { asignarPlanClinica, clinicasDePlan } from '../../services/planes'
import { formatearPrecio } from '../../lib/planes'
import { toastExito, toastError } from '../../store/useToastStore'

// Clínicas que usan un plan. "Difiere del plan" = su snapshot ya no coincide con
// lo que el plan dice HOY (se cambió el plan después, o tiene ajustes a la medida).
// Aplicar las condiciones actuales es una decisión explícita, clínica por clínica.
export function ModalClinicasDePlan({ plan, onCerrar, onCambio }) {
  const [clinicas, setClinicas] = useState(null)
  const [aplicando, setAplicando] = useState(null)
  const [confirmando, setConfirmando] = useState(null)

  async function cargar() {
    try {
      setClinicas(await clinicasDePlan(plan.plan))
    } catch (err) {
      toastError('No se pudieron cargar las clínicas: ' + err.message)
      setClinicas([])
    }
  }

  useEffect(() => {
    setClinicas(null)
    setConfirmando(null)
    if (plan) cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.plan])

  async function aplicar(c) {
    setAplicando(c.clinica_id)
    try {
      await asignarPlanClinica({ clinicaId: c.clinica_id, plan: plan.plan, modalidad: c.modalidad, precio: c.precio_contratado })
      toastExito(`Condiciones actuales aplicadas a ${c.nombre}.`)
      setConfirmando(null)
      await cargar()
      onCambio?.()
    } catch (err) {
      toastError('No se pudo aplicar: ' + err.message)
    } finally {
      setAplicando(null)
    }
  }

  return (
    <Modal abierto={!!plan} onCerrar={onCerrar} titulo={`Clínicas con el plan ${plan?.nombre ?? ''}`} ancho="grande">
      {!clinicas ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : clinicas.length === 0 ? (
        <p className="text-sm text-slate-500">Ninguna clínica usa este plan.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Clínica</th>
                <th className="px-3 py-2">Modalidad</th>
                <th className="px-3 py-2">Contratado</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {clinicas.map((c) => (
                <tr key={c.clinica_id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <Link to={`/administracion/${c.clinica_id}`} className="font-medium text-clinico-azul hover:underline">{c.nombre}</Link>
                    {c.difiere_del_plan && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800" title="Sus condiciones contratadas no coinciden con el plan actual">
                        difiere del plan
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 capitalize">{c.modalidad}</td>
                  <td className="px-3 py-2">{formatearPrecio(c.precio_contratado)}</td>
                  <td className="px-3 py-2 capitalize">{c.estado}</td>
                  <td className="px-3 py-2 text-right">
                    {c.difiere_del_plan && confirmando !== c.clinica_id && (
                      <button className="text-xs text-clinico-azul hover:underline" onClick={() => setConfirmando(c.clinica_id)}>Aplicar condiciones actuales</button>
                    )}
                    {confirmando === c.clinica_id && (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-xs text-slate-500">¿Reemplazar lo contratado?</span>
                        <Button className="!px-2 !py-1 text-xs" disabled={aplicando === c.clinica_id} onClick={() => aplicar(c)}>
                          {aplicando === c.clinica_id ? 'Aplicando…' : 'Sí, aplicar'}
                        </Button>
                        <Button variante="secundario" className="!px-2 !py-1 text-xs" onClick={() => setConfirmando(null)}>No</Button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Aplicar las condiciones actuales crea una suscripción nueva con los precios, límites y funcionalidades de hoy; la anterior queda en el historial. Nunca se borran pacientes ni usuarios.
      </p>
    </Modal>
  )
}
