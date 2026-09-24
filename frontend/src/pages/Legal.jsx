import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { HeaderPublico } from '../components/layout/HeaderPublico'
import { FooterPublico } from '../components/layout/FooterPublico'

const CATEGORIAS = [
  {
    titulo: 'Privacidad',
    enlaces: [
      { to: '/legal/privacidad', label: 'Aviso de Privacidad' },
      { to: '/legal/arco', label: 'Derechos ARCO' }
    ]
  },
  {
    titulo: 'Uso de SIRO',
    enlaces: [
      { to: '/legal/terminos', label: 'Términos y Condiciones' },
      { to: '/legal/cookies', label: 'Cookies y tecnologías de almacenamiento' },
      { to: '/legal/cookies/preferencias', label: 'Preferencias de almacenamiento' },
      { to: '/legal/seguridad', label: 'Seguridad' },
      { to: '/legal/retencion', label: 'Conservación de información' },
      { to: '/legal/proveedores', label: 'Proveedores' },
      { to: '/legal/acuerdo-tratamiento-datos', label: 'Acuerdo de Tratamiento de Datos' }
    ]
  },
  {
    titulo: 'Soporte',
    enlaces: [
      { to: '/contacto', label: 'Contacto' }
    ]
  }
]

export function Legal() {
  const session = useAuthStore((s) => s.session)

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {!session && <HeaderPublico enlace="/login" textoEnlace="Iniciar sesión" />}
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:px-10">
        <h1 className="mb-2 text-2xl font-semibold text-slate-800">Centro Legal</h1>
        <p className="mb-8 text-sm text-slate-500">
          Aquí encuentras los documentos que rigen el uso de SIRO y el tratamiento de tu información.
        </p>

        <div className="space-y-6">
          {CATEGORIAS.map((cat) => (
            <div key={cat.titulo} className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{cat.titulo}</h2>
              <div className="space-y-2">
                {cat.enlaces.map((e) => (
                  <Link
                    key={e.to}
                    to={e.to}
                    className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-clinico-azulClaro hover:text-clinico-azul"
                  >
                    {e.label} →
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
      <FooterPublico />
    </div>
  )
}
