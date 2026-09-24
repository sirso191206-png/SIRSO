import { Link } from 'react-router-dom'

export function FooterPublico() {
  return (
    <footer className="border-t border-slate-200 py-6">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 text-xs text-slate-400 sm:px-10">
        <Link to="/legal/privacidad" className="hover:text-clinico-azul">Aviso de Privacidad</Link>
        <Link to="/legal/terminos" className="hover:text-clinico-azul">Términos y Condiciones</Link>
        <Link to="/legal/cookies" className="hover:text-clinico-azul">Cookies y almacenamiento</Link>
        <Link to="/legal/cookies/preferencias" className="hover:text-clinico-azul">Preferencias de almacenamiento</Link>
        <Link to="/legal/arco" className="hover:text-clinico-azul">Derechos ARCO</Link>
        <Link to="/legal/seguridad" className="hover:text-clinico-azul">Seguridad</Link>
        <Link to="/contacto" className="hover:text-clinico-azul">Contacto</Link>
      </div>
    </footer>
  )
}
