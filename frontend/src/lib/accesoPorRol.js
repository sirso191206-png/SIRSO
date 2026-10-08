// ÚNICA fuente de verdad de "qué rol puede entrar a qué pantalla". La usan el menú lateral (qué
// enlaces se ven) y ProtectedRoute (qué pasa si alguien escribe la dirección a mano). Es protección
// de interfaz: lo que realmente se puede LEER o ESCRIBIR lo decide la base de datos (RLS), nunca esta
// tabla. Una ruta sin regla (p. ej. una dirección inexistente) no se bloquea aquí.
const TODOS = ['owner', 'dentista', 'asistente', 'recepcion']
const SOLO_SUPERADMIN = 'superadmin'

// `patron` coincide con la ruta exacta o con cualquier ruta que cuelgue de ella ("/pacientes" cubre
// "/pacientes/123"). Gana el patrón MÁS ESPECÍFICO (el más largo).
export const ACCESO_RUTAS = [
  { patron: '/', exacta: true, roles: ['owner', 'dentista', 'asistente'] }, // Mi día (recepción trabaja en Agenda)
  { patron: '/agenda', roles: TODOS },
  { patron: '/pacientes', roles: TODOS },
  { patron: '/consulta', roles: ['owner', 'dentista', 'asistente'] }, // la consulta es clínica: recepción no entra
  { patron: '/catalogo', roles: ['owner', 'dentista'] },
  { patron: '/corte-de-caja', roles: ['owner', 'recepcion'] },
  { patron: '/reportes', roles: ['owner'] },
  { patron: '/auditoria', roles: ['owner'] },
  { patron: '/usuarios', roles: ['owner'] },
  { patron: '/sucursales', roles: ['owner'] },
  { patron: '/configuracion', roles: ['owner'] },
  { patron: '/configuracion/seguridad', roles: TODOS }, // cada persona cuida su propia contraseña y sesiones
  { patron: '/ayuda', roles: TODOS },
  { patron: '/administracion/arco', roles: ['owner'] },
  { patron: '/administracion/incidentes', roles: ['owner'] },
  // Plataforma: solo el personal de SIRO. "/administracion/<id>" (detalle de una clínica) cae aquí.
  { patron: '/administracion', roles: [SOLO_SUPERADMIN] },
  { patron: '/superadmin', roles: [SOLO_SUPERADMIN] },
  { patron: '/admin', roles: [SOLO_SUPERADMIN] }
]

function normalizar(pathname) {
  const p = (pathname || '/').split('?')[0].split('#')[0]
  const sinBarraFinal = p.replace(/\/+$/, '')
  return sinBarraFinal === '' ? '/' : sinBarraFinal // "//" es la raíz, no una ruta vacía sin regla
}

function coincide(regla, ruta) {
  if (regla.exacta) return ruta === regla.patron
  return ruta === regla.patron || ruta.startsWith(regla.patron + '/')
}

export function reglaDeRuta(pathname) {
  const ruta = normalizar(pathname)
  let mejor = null
  for (const r of ACCESO_RUTAS) {
    if (coincide(r, ruta) && (!mejor || r.patron.length > mejor.patron.length)) mejor = r
  }
  return mejor
}

// Roles de clínica con acceso (para el menú). Las rutas solo de plataforma devuelven [].
export function rolesDeRuta(pathname) {
  const regla = reglaDeRuta(pathname)
  return regla ? regla.roles.filter((r) => r !== SOLO_SUPERADMIN) : TODOS
}

// ¿Puede esta persona entrar a esa pantalla? El superadmin entra a todo (acceso de plataforma).
// Sin perfil cargado todavía no se bloquea: no hay forma de decidir y la base protege los datos.
export function puedeEntrarARuta(pathname, perfil) {
  if (!perfil) return true
  if (perfil.es_super_admin) return true
  const regla = reglaDeRuta(pathname)
  if (!regla) return true
  return regla.roles.includes(perfil.rol)
}

export function rutaInicioPorRol(rol) {
  return rol === 'recepcion' ? '/agenda' : '/'
}
