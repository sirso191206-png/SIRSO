import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Icon } from '../ui/Icon'

// Compartido entre las páginas públicas para que el logotipo oficial de SIRO (SIRO.png + texto) se vea exactamente igual
// en todas, sin duplicar el marcado. Con `navegacion` muestra además el menú del sitio (Producto · Precios · Contacto);
// en teléfono ese menú se abre con el botón ☰.
const MENU = [['/inicio', 'Producto'], ['/precios', 'Precios'], ['/contacto', 'Contacto']]

export function HeaderPublico({ enlace, textoEnlace, navegacion = false }) {
  const [abierto, setAbierto] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => { setAbierto(false) }, [pathname])

  const claseEnlace = ({ isActive }) => `inline-flex min-h-[44px] items-center px-3 text-sm font-medium transition-colors ${isActive ? 'text-clinico-azul' : 'text-slate-600 hover:text-clinico-azul'}`

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-6 py-5 sm:px-10">
        <Link to="/inicio" className="flex items-center gap-2">
          <img src="/SIRO.png" alt="" className="h-8 w-auto" aria-hidden="true" />
          <span className="text-xl font-bold text-clinico-azul">SIRO</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          {navegacion && (
            <nav aria-label="Sitio" className="hidden items-center sm:flex">
              {MENU.map(([ruta, texto]) => <NavLink key={ruta} to={ruta} className={claseEnlace}>{texto}</NavLink>)}
            </nav>
          )}
          <Link to={enlace} className={`inline-flex min-h-[44px] items-center whitespace-nowrap text-sm font-semibold tracking-wide transition-colors ${navegacion ? 'rounded-xl border border-slate-300 px-3 text-slate-700 hover:border-clinico-azul hover:text-clinico-azul sm:px-4' : 'text-slate-700 hover:text-clinico-azul'}`}>
            {textoEnlace}
          </Link>
          {navegacion && (
            <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} aria-controls="menu-sitio-movil"
              aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 sm:hidden">
              {abierto ? <Icon.x /> : <Icon.menu />}
            </button>
          )}
        </div>
      </div>
      {navegacion && abierto && (
        <nav id="menu-sitio-movil" aria-label="Sitio" className="border-t border-slate-100 px-6 pb-3 sm:hidden">
          {MENU.map(([ruta, texto]) => (
            <NavLink key={ruta} to={ruta} className={({ isActive }) => `${claseEnlace({ isActive })} w-full border-b border-slate-100 last:border-0`}>{texto}</NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}
