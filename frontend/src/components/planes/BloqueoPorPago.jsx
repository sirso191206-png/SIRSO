import { PagoEnLinea } from './PagoEnLinea'

// Pantalla única cuando la clínica quedó SUSPENDIDA POR FALTA DE PAGO (migración 115: vencida tras la gracia).
// El bloqueo real lo aplica la base de datos (auth_clinica_id → RLS); esto solo muestra qué hacer. El propietario puede
// pagar aquí mismo y, en cuanto Stripe confirma el pago, el acceso vuelve solo. El resto del equipo ve a quién acudir.
export function BloqueoPorPago({ perfil, fechaFin, onCerrarSesion }) {
  const esOwner = perfil?.rol === 'owner'
  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-50 p-6">
      <div className="w-full max-w-3xl pt-10">
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-xl font-semibold text-slate-800">Acceso suspendido por falta de pago</h1>
          <p className="text-sm text-slate-500">
            {fechaFin ? `La suscripción de la clínica terminó el ${new Date(`${String(fechaFin).slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}. ` : ''}
            Tu información se conserva completa{esOwner ? '. Paga tu plan para volver a entrar: el acceso se reactiva en cuanto se confirma el pago.' : '; el propietario de la clínica debe pagar el plan para volver a entrar.'}
          </p>
        </div>
        {esOwner && <PagoEnLinea abierta />}
        <div className="text-center">
          <button onClick={onCerrarSesion} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
