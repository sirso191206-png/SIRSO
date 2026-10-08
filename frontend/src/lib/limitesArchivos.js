// Tope por archivo y tipos permitidos al subir a Storage. DEBEN coincidir con lo que fija la migración 082 en
// storage.buckets (lo aplica el propio Storage; esto solo avisa ANTES de subir, con un mensaje claro). Una
// prueba compara ambos lados para que no se desalineen.
const MB = 1024 * 1024
const IMAGENES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

export const LIMITES_ARCHIVOS = {
  'fotos-clinicas': { maxBytes: 10 * MB, tipos: IMAGENES, etiqueta: 'una fotografía', formatos: 'JPG, PNG, WebP o HEIC' },
  'documentos-clinicos': { maxBytes: 20 * MB, tipos: ['application/pdf', ...IMAGENES], etiqueta: 'un documento', formatos: 'PDF, JPG, PNG, WebP o HEIC' },
  'logos-clinicas': { maxBytes: 2 * MB, tipos: ['image/jpeg', 'image/png', 'image/webp'], etiqueta: 'un logotipo', formatos: 'JPG, PNG o WebP' }
}

// Algunos navegadores (sobre todo con HEIC del iPhone) no informan el tipo: se deduce de la extensión.
const POR_EXTENSION = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf' }

function tipoDe(archivo) {
  if (archivo.type) return archivo.type.toLowerCase()
  const ext = String(archivo.name ?? '').split('.').pop()?.toLowerCase()
  return POR_EXTENSION[ext] ?? ''
}

export function validarArchivo(bucket, archivo) {
  const regla = LIMITES_ARCHIVOS[bucket]
  if (!regla) return { ok: true }
  if (!archivo) return { ok: false, mensaje: 'Elige un archivo.' }
  if (!archivo.size) return { ok: false, mensaje: 'El archivo está vacío.' }
  if (!regla.tipos.includes(tipoDe(archivo))) {
    return { ok: false, mensaje: `Ese tipo de archivo no está permitido para ${regla.etiqueta}. Usa ${regla.formatos}.` }
  }
  if (archivo.size > regla.maxBytes) {
    const mb = (archivo.size / MB).toFixed(1)
    return { ok: false, mensaje: `El archivo pesa ${mb} MB y el máximo para ${regla.etiqueta} es ${regla.maxBytes / MB} MB.` }
  }
  return { ok: true }
}

// Traduce los errores de Storage (tamaño, tipo, política) a algo útil; nunca el texto técnico.
export function mensajeErrorArchivo(err, bucket) {
  const t = `${err?.message ?? ''} ${err?.error ?? ''} ${err?.statusCode ?? ''}`.toLowerCase()
  const regla = LIMITES_ARCHIVOS[bucket]
  if (/413|maximum allowed size|too large|payload/.test(t)) {
    return `El archivo es demasiado grande${regla ? ` (máximo ${regla.maxBytes / MB} MB)` : ''}.`
  }
  if (/mime|not supported|invalid.*type|415/.test(t)) {
    return `Ese tipo de archivo no está permitido${regla ? `. Usa ${regla.formatos}` : ''}.`
  }
  if (/row-level security|403|unauthorized|violates/.test(t)) {
    return 'No se pudo subir el archivo. Si tu clínica alcanzó el límite de almacenamiento de su plan, mejora tu plan; si no, revisa tus permisos.'
  }
  if (/failed to fetch|network|load failed/.test(t)) {
    return 'No hay conexión. Intenta subir el archivo cuando vuelva Internet.'
  }
  return 'No se pudo subir el archivo. Intenta de nuevo.'
}
