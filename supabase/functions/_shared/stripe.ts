// ============================================================
// SIRO — Cliente de Stripe y autenticación común de stripe-checkout / stripe-portal (migración 114).
// Secretos (supabase secrets set …): STRIPE_SECRET_KEY (sk_test_… o sk_live_…) y STRIPE_WEBHOOK_SECRET (whsec_…).
// La versión de la API se FIJA aquí: los objetos que se vuelven a leer de Stripe tienen siempre la forma esperada.
// ============================================================
import Stripe from 'https://esm.sh/stripe@14.25.0?target=deno'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { ErrorDeSolicitud, exigirSinCambioPendiente } from './solicitud.ts'

export const STRIPE_API_VERSION = '2023-10-16'

export function clienteStripe(): Stripe {
  const llave = Deno.env.get('STRIPE_SECRET_KEY')
  if (!llave) throw new ErrorDeSolicitud('El pago en línea todavía no está configurado.', 503, 'STRIPE_NO_CONFIGURADO')
  return new Stripe(llave, { apiVersion: STRIPE_API_VERSION, httpClient: Stripe.createFetchHttpClient() })
}

export const proveedorCripto = Stripe.createSubtleCryptoProvider()

export function clienteAdmin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

// Valida el JWT de la petición y devuelve el perfil del llamante (con service_role, que no pasa por RLS).
export async function perfilDelLlamante(req: Request, admin: SupabaseClient) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new ErrorDeSolicitud('Falta autenticación', 401)
  const llamante = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data: { user }, error } = await llamante.auth.getUser(token)
  if (error || !user) throw new ErrorDeSolicitud('Token inválido', 401)
  const { data: perfil, error: errPerfil } = await admin
    .from('usuarios')
    .select('id, clinica_id, rol, correo, debe_cambiar_password')
    .eq('id', user.id)
    .single()
  if (errPerfil || !perfil) throw new ErrorDeSolicitud('No se encontró tu perfil', 403)
  exigirSinCambioPendiente(perfil)
  return perfil as { id: string; clinica_id: string; rol: string; correo: string | null }
}
