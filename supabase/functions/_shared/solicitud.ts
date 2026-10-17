// ============================================================
// SIRO — Utilidades compartidas de las Edge Functions: errores de solicitud, validación y respuesta de error segura (fase final).
// ------------------------------------------------------------
// Regla: al llamante solo se le devuelve un mensaje que ESCRIBIMOS NOSOTROS (un ErrorDeSolicitud, un RAISE EXCEPTION de nuestras funciones SQL —SQLSTATE P0001—,
// un límite de plan PT4xx, o un error con `hint` de negocio). Cualquier otro error (PostgreSQL, Auth, red, un fallo de programación) es INESPERADO: se registra en el
// servidor y se responde un texto genérico, para no revelar nombres de tablas, restricciones, longitudes de llaves ni detalles de proveedores.
// ============================================================
export class ErrorDeSolicitud extends Error {
  status: number
  codigo: string | null
  constructor(mensaje: string, status = 400, codigo: string | null = null) {
    super(mensaje)
    this.status = status
    this.codigo = codigo
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

// Cambio OBLIGATORIO de la contraseña temporal (migración 103): una cuenta con `debe_cambiar_password` no puede usar NINGUNA función hasta cambiarla (salvo cambiar-password).
// Las Edge Functions usan service_role y no pasan por RLS, por eso comprueban el indicador aquí, con el MISMO criterio que la base de datos.
export function exigirSinCambioPendiente(perfil: { debe_cambiar_password?: boolean | null } | null | undefined): void {
  if (perfil?.debe_cambiar_password === true) throw new ErrorDeSolicitud('Debes cambiar tu contraseña temporal antes de continuar.', 403, 'CAMBIO_PASSWORD_PENDIENTE')
}

// Lee el cuerpo como un OBJETO JSON; cualquier otra cosa (null, arreglo, número, texto, JSON inválido) es una solicitud inválida, no un fallo del servidor.
export async function leerCuerpoJson(req: Request): Promise<Record<string, unknown>> {
  let cuerpo: unknown
  try { cuerpo = await req.json() } catch { throw new ErrorDeSolicitud('Solicitud inválida') }
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) throw new ErrorDeSolicitud('Solicitud inválida')
  return cuerpo as Record<string, unknown>
}

// Fecha opcional: vacío o null → null; si no, debe ser una fecha ISO válida (AAAA-MM-DD, con hora opcional).
export function fechaOpcional(valor: unknown, nombre: string): string | null {
  if (valor === undefined || valor === null || valor === '') return null
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}([T ][0-9:.+\-Zz]+)?$/.test(valor) || Number.isNaN(Date.parse(valor))) {
    throw new ErrorDeSolicitud(`${nombre} no es una fecha válida (AAAA-MM-DD).`)
  }
  return valor
}

// Contraseña temporal: 16 caracteres de un alfabeto de 56 símbolos sin ambigüedades (sin 0/O, 1/l/I), con el generador criptográfico del sistema (~93 bits).
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
export function generarPasswordTemporal(longitud = 16): string {
  const limite = 256 - (256 % ALFABETO.length)   // descarta los valores que sesgarían la distribución
  let salida = ''
  while (salida.length < longitud) {
    for (const b of crypto.getRandomValues(new Uint8Array(longitud * 2))) {
      if (b < limite && salida.length < longitud) salida += ALFABETO[b % ALFABETO.length]
    }
  }
  return salida
}

export function responderError(err: unknown, corsHeaders: Record<string, string>, funcion: string): Response {
  const json = (cuerpo: unknown, status: number) => new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if (err instanceof ErrorDeSolicitud) return json(err.codigo ? { error: err.message, codigo: err.codigo } : { error: err.message }, err.status)
  const e = err as { hint?: string; message?: string; code?: string }
  const negocio = e && typeof e === 'object' && ((typeof e.hint === 'string' && e.hint !== '') || e.code === 'P0001' || (typeof e.code === 'string' && /^PT4\d\d$/.test(e.code)))
  if (negocio && typeof e.message === 'string') return json(e.hint ? { error: e.message, codigo: e.hint } : { error: e.message }, 400)
  console.error(`${funcion}: error inesperado`, e?.code ?? '', e?.message ?? String(err))
  return json({ error: 'No se pudo completar la operación. Revisa los registros de la función.', codigo: e?.code ? `DB_${e.code}` : null }, 500)
}
