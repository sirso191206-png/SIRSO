import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Título de la pestaña según la pantalla (antes era el mismo en todas, incluso en la página «no encontrada»).
const TITULOS = [
  [/^\/$/, 'Mi día'], [/^\/inicio/, 'Software para clínicas dentales'], [/^\/login/, 'Iniciar sesión'], [/^\/agenda/, 'Agenda'], [/^\/pacientes\/.+/, 'Expediente'],
  [/^\/pacientes/, 'Pacientes'], [/^\/consulta/, 'Consulta'], [/^\/catalogo/, 'Catálogo'], [/^\/corte-de-caja/, 'Corte de caja'],
  [/^\/inventario/, 'Inventario'], [/^\/reportes/, 'Reportes'], [/^\/auditoria/, 'Auditoría'], [/^\/usuarios/, 'Usuarios'],
  [/^\/sucursales/, 'Sucursales'], [/^\/configuracion\/seguridad/, 'Seguridad'], [/^\/configuracion/, 'Configuración'],
  [/^\/ayuda/, 'Ayuda'], [/^\/contacto/, 'Contacto'], [/^\/reservar\//, 'Agenda tu cita'], [/^\/legal\/arco/, 'Derechos ARCO'],
  [/^\/legal\/privacidad/, 'Aviso de Privacidad'], [/^\/legal\/terminos/, 'Términos y Condiciones'], [/^\/legal\/cookies/, 'Cookies'],
  [/^\/legal\/consentimientos/, 'Consentimientos'], [/^\/legal\/seguridad/, 'Seguridad de la información'],
  [/^\/legal\/retencion/, 'Conservación de datos'], [/^\/legal\/proveedores/, 'Proveedores'],
  [/^\/legal\/acuerdo-tratamiento-datos/, 'Acuerdo de tratamiento de datos'],
  [/^\/legal/, 'Centro legal'], [/^\/restablecer-password/, 'Nueva contraseña'], [/^\/administracion\/arco/, 'Solicitudes ARCO'], [/^\/administracion\/incidentes/, 'Incidentes de seguridad'],
  [/^\/administracion|^\/superadmin|^\/admin/, 'Administración']
]

export function tituloDeRuta(pathname) {
  const encontrado = TITULOS.find(([patron]) => patron.test(pathname))
  return encontrado ? `${encontrado[1]} · SIRO` : 'Página no encontrada · SIRO'
}

export function TituloDePagina() {
  const { pathname } = useLocation()
  useEffect(() => { document.title = tituloDeRuta(pathname) }, [pathname])
  return null
}
