import { Link } from 'react-router-dom'

// Compartido entre Login y Contacto para que el logotipo oficial de SIRO
// (SIRO.png + texto) se vea exactamente igual en ambas pantallas, sin
// duplicar el marcado en cada archivo.
export function HeaderPublico({ enlace, textoEnlace }) {
  return (
    <header className="border-b border-slate-200">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-5 sm:px-10">
        <Link to="/login" className="flex items-center gap-2">
          <img src="/SIRO.png" alt="" className="h-8 w-auto" aria-hidden="true" />
          <span className="text-xl font-bold text-clinico-azul">SIRO</span>
        </Link>
        <Link to={enlace} className="text-sm font-semibold tracking-wide text-slate-700 transition-colors hover:text-clinico-azul">
          {textoEnlace}
        </Link>
      </div>
    </header>
  )
}
