// Inventario REAL — cada entrada corresponde a algo que de verdad
// existe en el código (verificado por inspección directa: package.json,
// index.html, y grep de localStorage/document.cookie en todo src/).
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
  }
]

export function agruparPorCategoria() {
  return CATEGORIAS.map((cat) => ({
    ...cat,
    items: INVENTARIO_COOKIES.filter((c) => c.categoria === cat.id)
  }))
}
