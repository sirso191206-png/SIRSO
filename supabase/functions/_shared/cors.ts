// ============================================================
// SIRO — CORS compartido para Edge Functions (Fase 1)
// ------------------------------------------------------------
// Antes cada función respondía con `Access-Control-Allow-Origin: *`,
// lo que permite que CUALQUIER sitio web llame a las funciones desde
// el navegador. Aquí se restringe a los dominios oficiales de SIRO.
//
// Como `Access-Control-Allow-Origin` solo admite UN valor (o "*"),
// el patrón correcto para varios orígenes permitidos es REFLEJAR el
// Origin de la petición cuando está en la lista blanca. Si el Origin
// no está permitido, se responde con el dominio de producción, con lo
// que el navegador bloquea la respuesta (no coincide con su origen).
//
// La lista se puede sobreescribir sin tocar código con el secreto
// CORS_ALLOWED_ORIGINS (orígenes separados por coma). Configúralo con:
//   supabase secrets set CORS_ALLOWED_ORIGINS="https://sirso.vercel.app"
// ============================================================

const ORIGENES_POR_DEFECTO = [
  'https://sirso.vercel.app', // producción
  'http://localhost:5173', // vite dev
  'http://localhost:4173', // vite preview
]

function origenesPermitidos(): string[] {
  const desdeEnv = Deno.env.get('CORS_ALLOWED_ORIGINS')
  if (desdeEnv && desdeEnv.trim()) {
    return desdeEnv
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
  }
  return ORIGENES_POR_DEFECTO
}

/**
 * Cabeceras CORS para una petición concreta. Refleja el Origin si está
 * permitido; si no, cae al primer origen de la lista (producción), lo
 * que efectivamente niega a orígenes no autorizados.
 */
export function buildCorsHeaders(origin: string | null): Record<string, string> {
  const permitidos = origenesPermitidos()
  const origen = origin && permitidos.includes(origin) ? origin : permitidos[0]
  return {
    'Access-Control-Allow-Origin': origen,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // Necesario al reflejar el origen: evita que un caché entregue la
    // respuesta con el Allow-Origin de otro origen.
    Vary: 'Origin',
  }
}

/** Respuesta estándar al preflight OPTIONS. */
export function preflight(req: Request): Response {
  return new Response('ok', {
    headers: buildCorsHeaders(req.headers.get('Origin')),
  })
}
