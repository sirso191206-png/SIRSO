import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { HeaderPublico } from '../components/layout/HeaderPublico'
import { ModalOlvidePassword } from '../components/ModalOlvidePassword'

const CLAVE_USUARIO_RECORDADO = 'siro_usuario_recordado'

export function Login() {
  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
  const [recordar, setRecordar] = useState(false)
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [modalOlvideAbierto, setModalOlvideAbierto] = useState(false)
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()

  // Recordar usuario: si ya se guardó antes, se rellena solo. Nunca se
  // guarda la contraseña, solo el correo.
  useEffect(() => {
    const guardado = localStorage.getItem(CLAVE_USUARIO_RECORDADO)
    if (guardado) {
      setCorreo(guardado)
      setRecordar(true)
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!correo.trim() || !password) {
      setError('Ingresa tu usuario y contraseña.')
      return
    }

    setCargando(true)
    try {
      await login(correo, password)
      if (recordar) {
        localStorage.setItem(CLAVE_USUARIO_RECORDADO, correo)
      } else {
        localStorage.removeItem(CLAVE_USUARIO_RECORDADO)
      }
      navigate('/')
    } catch (err) {
      setError('Correo o contraseña incorrectos.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <HeaderPublico enlace="/contacto" textoEnlace="Contacto" />

      {/* Contenido principal — izquierda 42% / derecha 58% */}
      <main className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col items-center justify-center gap-12 px-6 py-16 sm:px-10 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:py-0">
        {/* Formulario — 42%, ~420px */}
        <div className="w-full max-w-[420px] animate-slide-in-left lg:basis-[42%]">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Iniciar sesión</h1>
          <p className="mb-8 text-sm leading-relaxed text-slate-500">
            Accede a tu cuenta para gestionar pacientes, citas y expedientes clínicos.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <IconoUsuario />
              </span>
              <input
                type="text"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="Usuario"
                autoComplete="username"
                autoFocus
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-700 shadow-sm transition-all placeholder:text-slate-400 focus:border-clinico-azul focus:bg-white focus:outline-none focus:ring-4 focus:ring-clinico-azul/10"
              />
            </div>

            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <IconoCandado />
              </span>
              <input
                type={mostrarPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-11 text-sm text-slate-700 shadow-sm transition-all placeholder:text-slate-400 focus:border-clinico-azul focus:bg-white focus:outline-none focus:ring-4 focus:ring-clinico-azul/10"
              />
              <button
                type="button"
                onClick={() => setMostrarPassword((v) => !v)}
                aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
              >
                <IconoOjo tachado={mostrarPassword} />
              </button>
            </div>

            <div className="flex items-center justify-between pt-1 text-sm">
              <label className="flex items-center gap-2 text-slate-500">
                <input
                  type="checkbox"
                  checked={recordar}
                  onChange={(e) => setRecordar(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-clinico-azul focus:ring-clinico-azul"
                />
                Recordar usuario
              </label>
              <button
                type="button"
                onClick={() => setModalOlvideAbierto(true)}
                className="font-medium text-clinico-azul transition-colors hover:text-blue-700"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-clinico-rojo">{error}</p>
            )}

            <button
              type="submit"
              disabled={cargando}
              className="w-full rounded-xl bg-clinico-azul py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md active:scale-[0.99] disabled:opacity-60 disabled:hover:bg-clinico-azul"
            >
              {cargando ? 'Entrando…' : 'Iniciar sesión'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
            Sistema Integral de Registro Odontológico
          </p>
        </div>

        {/* Ilustración — 58%, ~500px, dentro de figura orgánica ~520px */}
        <div className="flex w-full max-w-[520px] animate-slide-in-right items-center justify-center lg:basis-[58%]">
          <div className="relative flex aspect-square w-full max-w-[520px] items-center justify-center">
            <div className="absolute inset-0 rounded-[45%_55%_60%_40%/50%_45%_55%_50%] bg-slate-100" />
            <img
              src="/ilustracion-login.svg"
              alt="Ilustración de una consulta odontológica"
              className="relative z-10 w-[500px] max-w-[92%]"
            />
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-100 py-5 text-center text-xs text-slate-400">
        © 2026 SIRO
      </footer>

      <ModalOlvidePassword
        abierto={modalOlvideAbierto}
        onCerrar={() => setModalOlvideAbierto(false)}
        correoInicial={correo}
      />
    </div>
  )
}

function IconoUsuario() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="6.5" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 17c1.2-4 4-6 7-6s5.8 2 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconoCandado() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="4" y="9" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function IconoOjo({ tachado }) {
  return tachado ? (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2.5 2.5l15 15M8.3 8.4a2.5 2.5 0 0 0 3.4 3.3M6.2 6.3C3.6 7.6 1.5 10 1.5 10s3 6 8.5 6c1.5 0 2.8-.4 3.9-1.1M15.5 14c1.9-1.5 3-4 3-4s-3-6-8.5-6c-.6 0-1.2.1-1.8.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}
