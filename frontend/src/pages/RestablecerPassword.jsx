import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { HeaderPublico } from '../components/layout/HeaderPublico'

export function RestablecerPassword() {
  const navigate = useNavigate()
  const [listoParaEditar, setListoParaEditar] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState('')
  const [estado, setEstado] = useState('esperando') // esperando | cargando | listo

  // Cuando el usuario llega desde el enlace del correo, Supabase detecta
  // el token en la URL y dispara este evento — solo entonces hay una
  // sesión temporal válida para poder cambiar la contraseña.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setListoParaEditar(true)
      }
    })

    // Si la pestaña ya cargó con la sesión de recuperación activa antes
    // de que este componente se suscribiera al evento.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setListoParaEditar(true)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setEstado('cargando')
    const { error: errorUpdate } = await supabase.auth.updateUser({ password })

    if (errorUpdate) {
      setEstado('esperando')
      setError('No se pudo actualizar la contraseña. Solicita un nuevo enlace de recuperación.')
      return
    }

    setEstado('listo')
    await supabase.auth.signOut()
    setTimeout(() => navigate('/login'), 2000)
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <HeaderPublico enlace="/contacto" textoEnlace="Contacto" />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16 animate-fade-in">
        {!listoParaEditar ? (
          <p className="text-center text-sm text-slate-500">
            Verificando el enlace de recuperación… Si llegaste aquí directamente sin pasar por el correo, este enlace
            no es válido — solicita uno nuevo desde la pantalla de inicio de sesión.
          </p>
        ) : estado === 'listo' ? (
          <div className="text-center">
            <p className="mb-2 text-lg font-semibold text-slate-800">Contraseña actualizada</p>
            <p className="text-sm text-slate-500">Te vamos a redirigir al inicio de sesión…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="w-full space-y-4" noValidate>
            <h1 className="mb-1 text-2xl font-bold text-slate-900">Nueva contraseña</h1>
            <p className="mb-4 text-sm text-slate-500">Elige una contraseña nueva para tu cuenta.</p>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nueva contraseña"
              autoFocus
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-sm transition-all placeholder:text-slate-400 focus:border-clinico-azul focus:bg-white focus:outline-none focus:ring-4 focus:ring-clinico-azul/10"
            />
            <input
              type="password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              placeholder="Confirmar contraseña"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-sm transition-all placeholder:text-slate-400 focus:border-clinico-azul focus:bg-white focus:outline-none focus:ring-4 focus:ring-clinico-azul/10"
            />

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-clinico-rojo">{error}</p>}

            <button
              type="submit"
              disabled={estado === 'cargando'}
              className="w-full rounded-xl bg-clinico-azul py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-60"
            >
              {estado === 'cargando' ? 'Guardando…' : 'Guardar nueva contraseña'}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
