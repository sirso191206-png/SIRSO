// A dónde regresa cada pantalla que no está en el menú lateral. Una sola tabla para toda la app: así ninguna subpágina
// queda sin salida. null = la pantalla ya tiene su propio regreso (consulta) o es de primer nivel (está en el menú).
const REGLAS = [
  [/^\/pacientes\/[^/]+$/, '/pacientes', 'Pacientes'],
  [/^\/configuracion\/.+$/, '/configuracion', 'Configuración'],
  [/^\/administracion\/.+$/, '/administracion', 'Administración'],
  [/^\/superadmin\/.+$/, '/administracion', 'Administración'],
  [/^\/admin\/legal$/, '/administracion', 'Administración'],
  [/^\/legal\/cookies\/preferencias$/, '/legal/cookies', 'Cookies'],
  [/^\/legal\/.+$/, '/legal', 'Centro legal'],
]

export function rutaPadre(pathname) {
  const ruta = String(pathname || '').replace(/\/+$/, '') || '/'
  for (const [patron, to, etiqueta] of REGLAS) if (patron.test(ruta)) return { to, etiqueta }
  return null
}
