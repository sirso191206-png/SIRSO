import { Link, NavLink } from 'react-router-dom'

// Compartido entre las páginas públicas para que el logotipo oficial de SIRO (SIRO.png + texto) se vea exactamente igual
// en todas, sin duplicar el marcado. Con `navegacion` muestra además el menú del sitio (Producto · Precios · Contacto;
// en teléfono solo Precios: el logotipo ya lleva a Producto).
const MENU = [['/inicio', 'Producto'], ['/precios', 'Precios'], ['/contacto', 'Contacto']]

export function HeaderPublico({ enlace, textoEnlace, navegacion = false }) {
  return (
    <header className="border-b border-slate-200">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-6 py-5 sm:px-10">
        <Link to="/inicio" className="flex items-center gap-2">
          <img src="/SIRO.png" alt="" className="h-8 w-auto" aria-hidden="true" />
          <span className="text-xl font-bold text-clinico-azul">SIRO</span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-4">
          {navegacion && (
            <nav aria-label="Sitio" className="flex items-center">
              {MENU.map(([ruta, texto]) => (
                <NavLink key={ruta} to={ruta}
                  className={({ isActive }) => `inline-flex min-h-[44px] items-center px-2 text-sm font-medium transition-colors sm:px-3 ${isActive ? 'text-clinico-azul' : 'text-slate-600 hover:text-clinico-azul'} ${ruta === '/precios' ? '' : 'hidden sm:inline-flex'}`}>
                  {texto}
                </NavLink>
              ))}
            </nav>
          )}
          <Link to={enlace} className={`inline-flex min-h-[44px] items-center whitespace-nowrap text-sm font-semibold tracking-wide transition-colors ${navegacion ? 'rounded-xl border border-slate-300 px-3 text-slate-700 hover:border-clinico-azul hover:text-clinico-azul sm:px-4' : 'text-slate-700 hover:text-clinico-azul'}`}>
            {textoEnlace}
          </Link>
        </div>
      </div>
    </header>
  )
}
