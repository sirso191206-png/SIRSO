import { useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { toastError } from '../../store/useToastStore'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Icon } from '../ui/Icon'

const hora = (ms) => new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

// Motivos por los que ya NO se puede seguir intentando con PIN: la
// oferta desaparece y la app cae a "inicia sesión con contraseña". Se
// avisa con un toast porque el componente se desmonta al instante.
const MENSAJE_TERMINAL = {
  EXPIRADO: 'Tu PIN sin conexión venció. Conéctate a internet e inicia sesión con tu contraseña.',
  REVOCADO_POR_INTENTOS: 'Demasiados intentos fallidos: el PIN se desactivó. Conéctate a internet e inicia sesión con tu contraseña.',
  SIN_PIN: 'Ya no hay un PIN activo en este equipo. Inicia sesión con tu contraseña.',
  SIN_PERFIL_LOCAL: 'No hay datos locales para abrir tu sesión sin conexión. Conéctate e inicia sesión con tu contraseña.'
}

// Se muestra cuando no hay internet, el token de Supabase ya venció, y
// esta persona activó un PIN. NO reemplaza el inicio de sesión normal:
// con internet, todo sigue pasando por Supabase Auth.
export function PantallaDesbloqueoPin({ onDesbloqueado }) {
  const oferta = useAuthStore((s) => s.desbloqueoOffline)
  const desbloquear = useAuthStore((s) => s.desbloquearConPin)
  const descartar = useAuthStore((s) => s.descartarDesbloqueoOffline)
  const [pin, setPin] = useState('')
  const [aviso, setAviso] = useState(null)
  const [verificando, setVerificando] = useState(false)

  if (!oferta) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!pin || verificando) return
    setVerificando(true)
    try {
      const r = await desbloquear(pin)
      if (r.ok) { onDesbloqueado?.(); return }

      setPin('')
      if (MENSAJE_TERMINAL[r.motivo]) {
        toastError(MENSAJE_TERMINAL[r.motivo])
      } else if (r.motivo === 'BLOQUEADO_TEMPORAL') {
        setAviso(`Demasiados intentos. Vuelve a intentar a las ${hora(r.bloqueadoHasta)}.`)
      } else if (r.motivo === 'PIN_INCORRECTO') {
        setAviso(
          r.bloqueadoHasta
            ? `PIN incorrecto. Bloqueado hasta las ${hora(r.bloqueadoHasta)}. Te quedan ${r.intentosRestantes} intentos antes de desactivar el PIN.`
            : `PIN incorrecto. Te ${r.intentosRestantes === 1 ? 'queda 1 intento' : `quedan ${r.intentosRestantes} intentos`} antes del bloqueo.`
        )
      } else {
        setAviso('No se pudo desbloquear. Inténtalo de nuevo.')
      }
    } catch {
      setAviso('No se pudo verificar el PIN en este navegador. Conéctate a internet e inicia sesión con tu contraseña.')
    } finally {
      setVerificando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-clinico-azulClaro text-clinico-azul">
          <Icon.lock />
        </div>
        <h1 className="mb-1 text-xl font-semibold text-slate-800">
          {oferta.nombre ? `Hola, ${oferta.nombre.split(' ')[0]}` : 'Desbloquear SIRO'}
        </h1>
        <p className="mb-5 text-sm text-slate-500">
          No hay conexión a internet. Ingresa tu PIN para seguir trabajando con lo que ya está guardado en este equipo.
        </p>

        <Input
          label="PIN"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={10}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          disabled={verificando}
        />

        {aviso && <p className="mt-2 text-xs text-red-600" role="alert">{aviso}</p>}

        <Button type="submit" disabled={!pin || verificando} className="mt-4 w-full">
          {verificando ? 'Verificando…' : 'Desbloquear'}
        </Button>

        <button
          type="button"
          onClick={descartar}
          className="mt-4 w-full text-center text-xs text-slate-500 underline hover:text-slate-700"
        >
          Iniciar sesión con mi contraseña
        </button>
      </form>
    </div>
  )
}
