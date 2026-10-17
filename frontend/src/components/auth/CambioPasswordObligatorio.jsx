import { useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { validarCambioPassword, mensajeErrorCambioPassword } from '../../lib/cambioPasswordObligatorio'

// Pantalla ÚNICA que ve una persona cuya cuenta tiene una contraseña temporal (usuarios.debe_cambiar_password = true).
// No muestra el menú ni ninguna otra función. El indicador solo lo quita el SERVIDOR (cambiar-password) tras un cambio real; aquí se vuelve a leer el perfil
// para confirmar el resultado y, si sigue pendiente, la persona sigue restringida.
export function CambioPasswordObligatorio() {
  const cambiarPassword = useAuthStore((s) => s.cambiarPassword)
  const recargarPerfil = useAuthStore((s) => s.recargarPerfil)
  const logout = useAuthStore((s) => s.logout)
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e) => {
    e?.preventDefault?.()
    if (enviando) return                      // doble clic: una sola solicitud
    const invalido = validarCambioPassword({ nueva, confirmar })
    if (invalido) { setError(invalido); return }
    setError(''); setEnviando(true)
    try {
      await cambiarPassword(nueva)
      await recargarPerfil()                  // lee el indicador del servidor: es la confirmación
      if (useAuthStore.getState().perfil?.debe_cambiar_password) throw new Error('No se pudo confirmar el cambio.')
      if (typeof window !== 'undefined' && window.location) window.location.assign('/')   // arranque limpio: nada de datos vacíos guardados mientras estuvo restringido
    } catch (err) {
      setError(mensajeErrorCambioPassword(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 p-6" data-testid="cambio-password-obligatorio">
      <form onSubmit={enviar} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-slate-800">Cambia tu contraseña temporal</h1>
        <p className="mb-6 text-sm text-slate-500">
          Tu cuenta se creó con una contraseña temporal. Por seguridad debes elegir una contraseña nueva antes de usar SIRO. Elige una distinta de la temporal, de al menos 8 caracteres.
        </p>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="pw-nueva">Contraseña nueva</label>
        <input id="pw-nueva" type="password" autoComplete="new-password" value={nueva} maxLength={128} onChange={(e) => setNueva(e.target.value)} disabled={enviando}
          className="mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="pw-confirmar">Confirma la contraseña nueva</label>
        <input id="pw-confirmar" type="password" autoComplete="new-password" value={confirmar} maxLength={128} onChange={(e) => setConfirmar(e.target.value)} disabled={enviando}
          className="mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={logout} disabled={enviando} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cerrar sesión</button>
          <button type="submit" disabled={enviando} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60">{enviando ? 'Guardando…' : 'Cambiar contraseña'}</button>
        </div>
      </form>
    </div>
  )
}
