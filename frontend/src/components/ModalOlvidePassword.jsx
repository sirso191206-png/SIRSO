import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Modal } from './ui/Modal'

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ModalOlvidePassword({ abierto, onCerrar, correoInicial }) {
  const [correo, setCorreo] = useState(correoInicial ?? '')
  const [estado, setEstado] = useState('formulario') // formulario | cargando | enviado | error
  const [errorMensaje, setErrorMensaje] = useState('')

  const cerrar = () => {
    setEstado('formulario')
    setErrorMensaje('')
    onCerrar()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!REGEX_CORREO.test(correo.trim())) {
      setErrorMensaje('Ingresa un correo con formato válido.')
      return
    }

    setErrorMensaje('')
    setEstado('cargando')

    const { error } = await supabase.auth.resetPasswordForEmail(correo.trim(), {
      redirectTo: `${window.location.origin}/restablecer-password`
    })

    if (error) {
      setEstado('error')
      setErrorMensaje('No fue posible enviar el correo. Intenta de nuevo en unos minutos.')
      return
    }

    setEstado('enviado')
  }

  return (
    <Modal abierto={abierto} onCerrar={cerrar} titulo="Recuperar contraseña">
      {estado === 'enviado' ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-slate-600">
            Correo enviado correctamente. Revisa tu bandeja de entrada (y la carpeta de spam) y sigue el enlace para
            crear una nueva contraseña.
          </p>
          <button
            onClick={cerrar}
            className="w-full rounded-xl bg-clinico-azul py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Entendido
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <p className="text-sm text-slate-500">
            Escribe el correo con el que inicias sesión. Te vamos a mandar un enlace para crear una nueva contraseña.
          </p>
          <input
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            placeholder="tu.correo@clinica.com"
            autoFocus
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-sm transition-all placeholder:text-slate-400 focus:border-clinico-azul focus:bg-white focus:outline-none focus:ring-4 focus:ring-clinico-azul/10"
          />
          {errorMensaje && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-clinico-rojo">{errorMensaje}</p>
          )}
          <button
            type="submit"
            disabled={estado === 'cargando'}
            className="w-full rounded-xl bg-clinico-azul py-3 text-sm font-semibold text-white transition-all hover:bg-blue-700 disabled:opacity-60"
          >
            {estado === 'cargando' ? 'Cargando…' : 'Enviar enlace de recuperación'}
          </button>
        </form>
      )}
    </Modal>
  )
}
