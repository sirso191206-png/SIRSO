import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useConexion } from '../../hooks/useConexion'
import { CONFIG_PIN } from '../../lib/pinOffline'
import { toastExito, toastError } from '../../store/useToastStore'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Icon } from '../ui/Icon'

const ETIQUETA_DURACION = { 8: '8 horas', 24: '24 horas', 72: '3 días', 168: '7 días' }

const ERRORES = {
  SOLO_DIGITOS: 'El PIN solo puede tener números.',
  MUY_CORTO: `El PIN debe tener al menos ${CONFIG_PIN.longitudMin} dígitos.`,
  MUY_LARGO: `El PIN puede tener como máximo ${CONFIG_PIN.longitudMax} dígitos.`,
  MUY_PREVISIBLE: 'Ese PIN es muy fácil de adivinar (repeticiones o secuencias como 123456). Elige otro.',
  DURACION_INVALIDA: 'Elige una vigencia de la lista.',
  IGUAL_AL_ACTUAL: 'El PIN nuevo debe ser distinto del actual.',
  PIN_INCORRECTO: 'El PIN actual es incorrecto.',
  BLOQUEADO_TEMPORAL: 'Demasiados intentos con el PIN actual. Espera un momento o revócalo y crea uno nuevo.',
  REQUIERE_CONEXION: 'Necesitas conexión a internet para administrar el PIN.',
  REQUIERE_SESION_REAL: 'Inicia sesión con tu contraseña para administrar el PIN.',
  SIN_CRIPTO: 'Este navegador no permite guardar un PIN de forma segura (requiere una conexión segura, HTTPS).',
  SIN_PIN: 'No hay un PIN activo.',
  EXPIRADO: 'El PIN venció. Revócalo y crea uno nuevo.'
}

const fechaHora = (ms) => new Date(ms).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

// Aquí se activa, cambia o revoca el PIN de desbloqueo sin conexión.
// Solo con sesión real de Supabase e internet (lo exige el store).
export function SeccionPinOffline() {
  const modoOffline = useAuthStore((s) => s.modoOffline)
  const estadoPinOffline = useAuthStore((s) => s.estadoPinOffline)
  const configurar = useAuthStore((s) => s.configurarPinOffline)
  const cambiar = useAuthStore((s) => s.cambiarPinOffline)
  const revocar = useAuthStore((s) => s.revocarPinOffline)
  const conectado = useConexion()

  const [estado, setEstado] = useState(null)
  const [modo, setModo] = useState(null) // null | 'activar' | 'cambiar'
  const [pinActual, setPinActual] = useState('')
  const [pin, setPin] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [duracion, setDuracion] = useState(CONFIG_PIN.duracionPorDefectoHoras)
  const [confirmandoRevocar, setConfirmandoRevocar] = useState(false)
  const [procesando, setProcesando] = useState(false)

  const recargar = useCallback(async () => setEstado(await estadoPinOffline()), [estadoPinOffline])
  useEffect(() => { recargar() }, [recargar])

  const puedeGestionar = conectado && !modoOffline
  const soloDigitos = (setter) => (e) => setter(e.target.value.replace(/\D/g, ''))

  const limpiar = () => { setModo(null); setPin(''); setPinActual(''); setConfirmacion(''); setConfirmandoRevocar(false) }

  const handleGuardar = async (e) => {
    e.preventDefault()
    if (pin !== confirmacion) { toastError('La confirmación no coincide con el PIN.'); return }
    setProcesando(true)
    try {
      const r = modo === 'cambiar' ? await cambiar(pinActual, pin, duracion) : await configurar(pin, duracion)
      if (!r.ok) { toastError(ERRORES[r.motivo] ?? 'No se pudo guardar el PIN.'); return }
      toastExito(modo === 'cambiar' ? 'PIN cambiado.' : 'PIN activado. Ya puedes desbloquear SIRO sin conexión con él.')
      limpiar()
      await recargar()
    } catch {
      toastError('No se pudo guardar el PIN en este navegador.')
    } finally {
      setProcesando(false)
    }
  }

  const handleRevocar = async () => {
    setProcesando(true)
    try {
      const r = await revocar()
      if (!r.ok) { toastError(ERRORES[r.motivo] ?? 'No se pudo revocar el PIN.'); return }
      toastExito('PIN revocado.')
      limpiar()
      await recargar()
    } finally {
      setProcesando(false)
    }
  }

  if (!estado) return null
  const activo = estado.configurado

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-800">
        <Icon.lock /> PIN para trabajar sin conexión
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        Si pierdes internet por un rato largo, tu sesión sin conexión deja de servir. Con un PIN puedes volver a
        abrirla en este equipo, sin necesitar tu contraseña.
      </p>

      <p className="mb-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
        <strong>Alcance:</strong> el PIN evita que otra persona abra SIRO sin conexión desde esta pantalla. No cifra los
        datos guardados en el equipo, y no sustituye tu contraseña: con internet, SIRO siempre te la pide.
        Usa un PIN que no compartas con nadie.
      </p>

      {!puedeGestionar && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <Icon.alertTriangle /> Para activar, cambiar o revocar el PIN necesitas internet y haber iniciado sesión con tu contraseña.
        </p>
      )}

      {activo && !modo && (
        <div className="mb-4 text-sm text-slate-700">
          <p className="flex items-center gap-1.5 font-medium text-green-700"><Icon.checkCircle /> PIN activo en este equipo</p>
          <p className="mt-1 text-xs text-slate-500">
            Vale hasta <strong>{fechaHora(estado.expiraEn)}</strong> sin conexión ({ETIQUETA_DURACION[estado.duracionHoras]}
            desde la última vez que se conectó). Cada vez que SIRO se conecta, ese plazo se renueva.
          </p>
        </div>
      )}

      {modo ? (
        <form onSubmit={handleGuardar} className="space-y-3">
          {modo === 'cambiar' && (
            <Input label="PIN actual" type="password" inputMode="numeric" autoComplete="off" maxLength={10} value={pinActual} onChange={soloDigitos(setPinActual)} />
          )}
          <Input label={modo === 'cambiar' ? 'PIN nuevo' : 'PIN'} type="password" inputMode="numeric" autoComplete="off" maxLength={10} value={pin} onChange={soloDigitos(setPin)} placeholder={`${CONFIG_PIN.longitudMin} a ${CONFIG_PIN.longitudMax} dígitos`} />
          <Input label="Confirma el PIN" type="password" inputMode="numeric" autoComplete="off" maxLength={10} value={confirmacion} onChange={soloDigitos(setConfirmacion)} />

          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Cuánto tiempo sin internet sigue valiendo</span>
            <select
              value={duracion}
              onChange={(e) => setDuracion(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm"
            >
              {CONFIG_PIN.opcionesDuracionHoras.map((h) => <option key={h} value={h}>{ETIQUETA_DURACION[h]}</option>)}
            </select>
            <span className="mt-1 block text-xs text-slate-400">Pasado ese plazo sin conectarte, tendrás que iniciar sesión con tu contraseña.</span>
          </label>

          <div className="flex gap-2">
            <Button type="submit" disabled={procesando || !pin || !confirmacion || (modo === 'cambiar' && !pinActual)}>
              {procesando ? 'Guardando…' : modo === 'cambiar' ? 'Cambiar PIN' : 'Activar PIN'}
            </Button>
            <Button type="button" variante="secundario" onClick={limpiar}>Cancelar</Button>
          </div>
        </form>
      ) : confirmandoRevocar ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-700">¿Revocar el PIN? Sin él, sin internet tendrás que esperar a conectarte.</span>
          <Button variante="peligro" onClick={handleRevocar} disabled={procesando}>Sí, revocar</Button>
          <Button variante="secundario" onClick={() => setConfirmandoRevocar(false)}>No</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {activo ? (
            <>
              <Button variante="secundario" onClick={() => setModo('cambiar')} disabled={!puedeGestionar}>Cambiar PIN</Button>
              <Button variante="secundario" onClick={() => setConfirmandoRevocar(true)} disabled={!puedeGestionar}>Revocar PIN</Button>
            </>
          ) : (
            <Button onClick={() => setModo('activar')} disabled={!puedeGestionar}>Activar PIN</Button>
          )}
        </div>
      )}
    </section>
  )
}
