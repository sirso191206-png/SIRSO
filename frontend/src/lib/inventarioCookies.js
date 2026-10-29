// Inventario REAL — cada entrada corresponde a algo que de verdad
// existe en el código (verificado por inspección directa: package.json,
// index.html, y grep de localStorage/document.cookie/indexedDB en todo src/ y public/sw.js).
// Lo de la categoría «preferencias» solo se guarda si la persona lo permitió (store/useCookiesStore.js:
// guardarPreferenciaLocal) y se borra al rechazarlo; consentimientoCookies.test.js lo vigila.
// No declarar aquí nada que no esté efectivamente en uso — si algún
// día se agrega analítica o marketing, este archivo es el único lugar
// que hay que actualizar, y con eso /legal/cookies queda al día.

export const CATEGORIAS = [
  { id: 'necesarias', label: 'Necesarias', desactivable: false },
  { id: 'preferencias', label: 'Preferencias', desactivable: true },
  { id: 'analiticas', label: 'Analíticas', desactivable: true },
  { id: 'marketing', label: 'Marketing', desactivable: true }
]

export const INVENTARIO_COOKIES = [
  {
    nombre: 'sb-<referencia-proyecto>-auth-token',
    proveedor: 'Supabase (autenticación)',
    finalidad: 'Mantener tu sesión iniciada — sin esto, SIRO te pediría iniciar sesión en cada acción.',
    categoria: 'necesarias',
    duracion: 'Mientras la sesión esté activa',
    dominio: 'Primera parte (el propio dominio de SIRO)',
    tipo: 'localStorage',
    tercero: false
  },
  {
    nombre: 'sirso_odontograma_view',
    proveedor: 'SIRO',
    finalidad: 'Recordar si prefieres ver el odontograma en 2D o en 3D la próxima vez que lo abras.',
    categoria: 'preferencias',
    duracion: 'Sin expiración — hasta que la borres o cambies de preferencia',
    dominio: 'Primera parte',
    tipo: 'localStorage',
    tercero: false
  },
  {
    nombre: 'siro_usuario_recordado',
    proveedor: 'SIRO',
    finalidad: 'Recordar tu correo para no tener que escribirlo cada vez que inicias sesión (solo si activaste "recordarme").',
    categoria: 'preferencias',
    duracion: 'Sin expiración — hasta que la borres o desactives "recordarme"',
    dominio: 'Primera parte',
    tipo: 'localStorage',
    tercero: false
  },
  {
    nombre: 'siro:onboarding-oculto:<usuario>',
    proveedor: 'SIRO',
    finalidad: 'Recordar que ocultaste el panel de «Primeros pasos» para no volver a mostrártelo.',
    categoria: 'preferencias',
    duracion: 'Sin expiración — hasta que la borres o rechaces las cookies de preferencias',
    dominio: 'Primera parte',
    tipo: 'localStorage',
    tercero: false
  },
  {
    nombre: 'siro-cache-lectura, siro-pacientes-clinica, siro-pacientes-offline, siro-indice-pacientes, siro-citas-clinica, siro-expedientes-clinica',
    proveedor: 'SIRO',
    finalidad: 'Copia local de los datos de la clínica, incluidos datos clínicos de pacientes, para poder trabajar sin conexión.',
    categoria: 'necesarias',
    duracion: 'Hasta que cierras sesión: se limpia al salir, salvo los cambios pendientes de sincronizar',
    dominio: 'Primera parte',
    tipo: 'IndexedDB',
    tercero: false
  },
  {
    nombre: 'siro-cola-offline, siro-mapeo-ids-offline',
    proveedor: 'SIRO',
    finalidad: 'Cambios hechos sin conexión que aún no se han enviado al servidor, para no perderlos.',
    categoria: 'necesarias',
    duracion: 'Hasta que se sincronizan',
    dominio: 'Primera parte',
    tipo: 'IndexedDB',
    tercero: false
  },
  {
    nombre: 'siro-auth-cache',
    proveedor: 'SIRO',
    finalidad: 'Datos de tu sesión y perfil para reanudar el trabajo sin conexión.',
    categoria: 'necesarias',
    duracion: 'Hasta que cierras sesión',
    dominio: 'Primera parte',
    tipo: 'IndexedDB',
    tercero: false
  },
  {
    nombre: 'siro-pin-offline',
    proveedor: 'SIRO',
    finalidad: 'Datos necesarios para el desbloqueo sin conexión con PIN (solo si lo activas).',
    categoria: 'necesarias',
    duracion: 'Hasta que desactivas el PIN o cierras sesión',
    dominio: 'Primera parte',
    tipo: 'IndexedDB',
    tercero: false
  },
  {
    nombre: 'siro-shell-<versión>',
    proveedor: 'SIRO (Service Worker)',
    finalidad: 'Archivos de la aplicación para que cargue sin conexión.',
    categoria: 'necesarias',
    duracion: 'Se reemplaza al publicarse una versión nueva',
    dominio: 'Primera parte',
    tipo: 'Caché del navegador (Service Worker)',
    tercero: false
  },
  {
    nombre: 'siro:recarga-por-version',
    proveedor: 'SIRO',
    finalidad: 'Recordar que la pestaña ya se recargó sola para traer una versión nueva de SIRO, y así no repetirlo en ciclo.',
    categoria: 'necesarias',
    duracion: 'Hasta cerrar la pestaña',
    dominio: 'Primera parte',
    tipo: 'sessionStorage',
    tercero: false
  }
]

export function agruparPorCategoria() {
  return CATEGORIAS.map((cat) => ({
    ...cat,
    items: INVENTARIO_COOKIES.filter((c) => c.categoria === cat.id)
  }))
}
