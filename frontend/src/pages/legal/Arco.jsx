import { useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { crearSolicitudArco } from '../../services/arco'
import { HeaderPublico } from '../../components/layout/HeaderPublico'
import { FooterPublico } from '../../components/layout/FooterPublico'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'

const TIPOS = [
  { value: 'acceso', label: 'Acceso', descripcion: 'Quiero saber qué datos personales tienen sobre mí.' },
  { value: 'rectificacion', label: 'Rectificación', descripcion: 'Mis datos están incorrectos o desactualizados.' },
  { value: 'cancelacion', label: 'Cancelación', descripcion: 'Quiero que dejen de tratar mis datos.' },
  { value: 'oposicion', label: 'Oposición', descripcion: 'Me opongo a un uso específico de mis datos.' }
]

export function Arco() {
  const session = useAuthStore((s) => s.session)
  const perfil = useAuthStore((s) => s.perfil)
  const [tipo, setTipo] = useState('acceso')
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [trampa, setTrampa] = useState('') // honeypot — un humano nunca ve ni llena este campo
  const [enviando, setEnviando] = useState(false)
  const [enviada, setEnviada] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!nombre.trim() || !correo.trim() || !descripcion.trim()) {
      toastError('Completa nombre, correo y descripción de tu solicitud.')
      return
    }
    // Si el campo trampa tiene algo, es un bot — nunca un humano real
    // llega a verlo. Se finge éxito sin enviar nada, para no revelarle
    // al bot que fue detectado.
    if (trampa) {
      setEnviada(true)
      return
    }
    setEnviando(true)
    try {
      await crearSolicitudArco({
        tipo,
        solicitante_nombre: nombre.trim(),
        solicitante_correo: correo.trim(),
        descripcion: descripcion.trim(),
        usuario_id: session ? perfil?.id : null,
        clinica_id: session ? perfil?.clinica_id : null
      })
      setEnviada(true)
      toastExito('Tu solicitud fue registrada.')
    } catch (err) {
      toastError('No se pudo enviar la solicitud: ' + err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {!session && <HeaderPublico enlace="/login" textoEnlace="Iniciar sesión" />}
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12 sm:px-10">
        <h1 className="mb-2 text-2xl font-semibold text-slate-800">Derechos ARCO</h1>
        <p className="mb-8 text-sm text-slate-500">
          Puedes solicitar Acceso, Rectificación, Cancelación u Oposición sobre tus datos personales. Responderemos
          al correo que nos indiques.
        </p>

        {enviada ? (
          <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-sm text-green-800">
            Recibimos tu solicitud. Te contactaremos al correo que proporcionaste.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
            <input
              type="text"
              value={trampa}
              onChange={(e) => setTrampa(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }}
            />
            <div>
              <span className="mb-2 block text-sm font-medium text-slate-700">Tipo de solicitud</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {TIPOS.map((t) => (
                  <button
                    type="button"
                    key={t.value}
                    onClick={() => setTipo(t.value)}
                    className={`rounded-lg border p-3 text-left text-sm ${tipo === t.value ? 'border-clinico-azul bg-clinico-azulClaro' : 'border-slate-200'}`}
                  >
                    <div className="font-medium text-slate-700">{t.label}</div>
                    <div className="text-xs text-slate-400">{t.descripcion}</div>
                  </button>
                ))}
              </div>
            </div>

            <Input label="Nombre completo" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <Input label="Correo de contacto" type="email" required value={correo} onChange={(e) => setCorreo(e.target.value)} />

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Describe tu solicitud</span>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Cuéntanos qué necesitas — mientras más específico, más rápido podemos ayudarte."
              />
            </label>

            <Button type="submit" disabled={enviando} className="w-full">
              {enviando ? 'Enviando…' : 'Enviar solicitud'}
            </Button>
          </form>
        )}
      </main>
      <FooterPublico />
    </div>
  )
}
