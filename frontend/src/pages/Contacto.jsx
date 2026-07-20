import { useState } from 'react'
import { enviarMensajeContacto } from '../services/contacto'
import { HeaderPublico } from '../components/layout/HeaderPublico'

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function Contacto() {
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [errores, setErrores] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [estadoEnvio, setEstadoEnvio] = useState(null) // null | 'exito' | 'error'
  const [mensajeEstado, setMensajeEstado] = useState('')

  const validar = () => {
    const nuevosErrores = {}
    if (!nombre.trim()) nuevosErrores.nombre = 'El nombre es obligatorio.'
    if (!REGEX_CORREO.test(correo.trim())) nuevosErrores.correo = 'Ingresa un correo válido.'
    if (!mensaje.trim()) nuevosErrores.mensaje = 'Escribe tu mensaje.'
    setErrores(nuevosErrores)
    return Object.keys(nuevosErrores).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setEstadoEnvio(null)

    if (!validar()) return

    setEnviando(true)
    try {
      await enviarMensajeContacto({ nombre: nombre.trim(), correo: correo.trim(), mensaje: mensaje.trim() })
      setEstadoEnvio('exito')
      setMensajeEstado('Tu mensaje fue enviado correctamente. Te responderemos pronto.')
      setNombre('')
      setCorreo('')
      setMensaje('')
      setErrores({})
    } catch (err) {
      setEstadoEnvio('error')
      setMensajeEstado(err.message || 'No se pudo enviar el mensaje. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <HeaderPublico enlace="/login" textoEnlace="Iniciar sesión" />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 animate-fade-in sm:px-10">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Contacto</h1>
        <p className="mb-10 max-w-xl text-sm leading-relaxed text-slate-500">
          ¿Tienes dudas sobre SIRO o necesitas soporte con tu clínica? Escríbenos y te respondemos lo antes posible.
        </p>

        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2">
          <div className="space-y-6">
            <div>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Correo</h2>
              <a href="mailto:soporte@siro.app" className="text-sm text-clinico-azul hover:underline">
                soporte@siro.app
              </a>
            </div>
            <div>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Teléfono</h2>
              <p className="text-sm text-slate-700">55 0000 0000</p>
            </div>
            <div>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Horario de soporte</h2>
              <p className="text-sm text-slate-700">Lunes a viernes, 9:00 a 18:00</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <div>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-sm transition-all placeholder:text-slate-400 focus:border-clinico-azul focus:bg-white focus:outline-none focus:ring-4 focus:ring-clinico-azul/10"
              />
              {errores.nombre && <p className="mt-1 text-xs text-clinico-rojo">{errores.nombre}</p>}
            </div>

            <div>
              <input
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="Correo"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-sm transition-all placeholder:text-slate-400 focus:border-clinico-azul focus:bg-white focus:outline-none focus:ring-4 focus:ring-clinico-azul/10"
              />
              {errores.correo && <p className="mt-1 text-xs text-clinico-rojo">{errores.correo}</p>}
            </div>

            <div>
              <textarea
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                placeholder="Mensaje"
                rows={4}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-sm transition-all placeholder:text-slate-400 focus:border-clinico-azul focus:bg-white focus:outline-none focus:ring-4 focus:ring-clinico-azul/10"
              />
              {errores.mensaje && <p className="mt-1 text-xs text-clinico-rojo">{errores.mensaje}</p>}
            </div>

            {estadoEnvio && (
              <p className={`rounded-lg px-3 py-2 text-sm ${estadoEnvio === 'exito' ? 'bg-green-50 text-clinico-verde' : 'bg-red-50 text-clinico-rojo'}`}>
                {mensajeEstado}
              </p>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="rounded-xl bg-clinico-azul px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md active:scale-[0.99] disabled:opacity-60 disabled:hover:bg-clinico-azul"
            >
              {enviando ? 'Enviando…' : 'Enviar mensaje'}
            </button>
          </form>
        </div>
      </main>

      <footer className="border-t border-slate-100 py-5 text-center text-xs text-slate-400">
        © 2026 SIRO
      </footer>
    </div>
  )
}
