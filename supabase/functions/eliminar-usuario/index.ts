// Edge Function: eliminar-usuario
// Solo el 'owner' puede eliminar usuarios, y solo de su propia clínica.
// No se puede eliminar a sí mismo (evita que una clínica se quede sin owner).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { buildCorsHeaders } from '../_shared/cors.ts'
import { exigirSinCambioPendiente, ErrorDeSolicitud, esUuid, leerCuerpoJson, responderError } from '../_shared/solicitud.ts'

// Esta baja toca DOS sistemas que NO comparten transacción (Auth y la base). Si el segundo paso falla, el primero no se deshace solo.
// Por eso la cuenta de acceso se DESACTIVA primero: pase lo que pase después, nunca queda una cuenta VIVA sin perfil (con acceso y sin fila
// en `usuarios`, con el correo reservado y sin rastro de auditoría).
const DESACTIVADA_PARA_SIEMPRE = '876000h'   // ~100 años
class ErrorCuentaPendiente extends ErrorDeSolicitud {
  constructor() { super('El perfil se eliminó y la cuenta de acceso quedó DESACTIVADA (no puede iniciar sesión), pero no se pudo eliminar del todo. Avisa a soporte para completar la baja.', 500, 'CUENTA_PENDIENTE') }
}

serve(async (req) => {
  // CORS por petición: refleja el Origin si está en la lista blanca.
  const corsHeaders = buildCorsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    console.log('eliminar-usuario: Authorization presente:', !!authHeader, '— empieza con Bearer:', !!authHeader?.startsWith('Bearer '))
    if (!authHeader) throw new ErrorDeSolicitud('Falta autenticación')

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    console.log('eliminar-usuario: token presente:', !!token, '— longitud:', token.length)
    if (!token) throw new ErrorDeSolicitud('Falta token de acceso')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Cliente efímero: sin persistir/refrescar sesión propia — esta
    // función corre una sola vez por petición; el único propósito de
    // este cliente es validar el token recibido en la petición.
    const supabaseCaller = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
    const { data: { user }, error: userError } = await supabaseCaller.auth.getUser(token)
    if (userError) {
      console.error('eliminar-usuario: error validando JWT:', userError.message, '— status:', userError.status)
    }
    console.log('eliminar-usuario: usuario autenticado:', !!user)
    if (userError || !user) throw new ErrorDeSolicitud('Token inválido')

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    const { data: perfilCaller, error: perfilError } = await supabaseAdmin
      .from('usuarios')
      .select('clinica_id, rol, debe_cambiar_password')
      .eq('id', user.id)
      .single()
    if (perfilError || !perfilCaller) throw new ErrorDeSolicitud('No se encontró tu perfil')
    exigirSinCambioPendiente(perfilCaller)
    if (perfilCaller.rol !== 'owner') throw new ErrorDeSolicitud('Solo el owner puede eliminar usuarios')

    // Clínica suspendida: ninguna acción administrativa. Igual que en
    // crear-usuario, esta función usa service_role y por sí sola no pasa
    // por RLS, así que el bloqueo se valida aquí explícitamente.
    const { data: clinicaCaller, error: clinicaCallerError } = await supabaseAdmin
      .from('clinicas')
      .select('estado')
      .eq('id', perfilCaller.clinica_id)
      .single()
    if (clinicaCallerError || !clinicaCaller) throw new ErrorDeSolicitud('No se encontró tu clínica')
    if (clinicaCaller.estado === 'suspendida') {
      throw new ErrorDeSolicitud('Tu clínica está suspendida. No puedes eliminar usuarios en este momento.')
    }

    const { usuarioId } = await leerCuerpoJson(req)
    if (!usuarioId) throw new ErrorDeSolicitud('Falta usuarioId')
    if (!esUuid(usuarioId)) throw new ErrorDeSolicitud('Usuario no encontrado')   // mismo texto que un id inexistente: sin pistas
    if (usuarioId === user.id) throw new ErrorDeSolicitud('No puedes eliminarte a ti mismo')

    const { data: perfilObjetivo, error: objetivoError } = await supabaseAdmin
      .from('usuarios')
      .select('clinica_id, nombre, correo, rol')
      .eq('id', usuarioId)
      .single()
    if (objetivoError || !perfilObjetivo) throw new ErrorDeSolicitud('Usuario no encontrado')
    if (perfilObjetivo.clinica_id !== perfilCaller.clinica_id) {
      throw new ErrorDeSolicitud('Ese usuario no pertenece a tu clínica')
    }

    // 1) Desactivar la cuenta de acceso. Si no se puede, se aborta ANTES de borrar nada.
    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(usuarioId, { ban_duration: DESACTIVADA_PARA_SIEMPRE })
    if (banError) throw new ErrorDeSolicitud('No se pudo desactivar la cuenta de acceso; no se eliminó nada. Inténtalo de nuevo.')
    const reactivar = async () => { try { await supabaseAdmin.auth.admin.updateUserById(usuarioId, { ban_duration: 'none' }) } catch { /* mejor esfuerzo */ } }

    // 2) Borrar el perfil. Es el que puede RECHAZARSE (citas, tratamientos o pagos a su nombre): en ese caso no se elimina nada y se REACTIVA la cuenta.
    const { error: deleteProfileError } = await supabaseAdmin
      .from('usuarios')
      .delete()
      .eq('id', usuarioId)
    if (deleteProfileError) {
      await reactivar()
      if (deleteProfileError.code === '23503') {
        throw new ErrorDeSolicitud(
          'No se puede eliminar: este usuario tiene citas, tratamientos o pagos registrados a su nombre. Desactívalo en vez de eliminarlo.'
        )
      }
      throw deleteProfileError
    }

    // 3) Borrar la cuenta de acceso. Si falla, la cuenta sigue DESACTIVADA (no operativa); se deja constancia para completar la baja.
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(usuarioId)
    if (deleteAuthError) {
      console.error('eliminar-usuario: la cuenta quedó DESACTIVADA pero no se pudo eliminar:', deleteAuthError.message)
      await supabaseAdmin.from('auditoria').insert({
        usuario_id: user.id,
        accion: 'eliminar_usuario_cuenta_pendiente',
        entidad: 'usuarios',
        entidad_id: usuarioId,
        detalle: { ...perfilObjetivo, clinica_id: perfilCaller.clinica_id, via: 'edge_function', motivo: deleteAuthError.message }
      })
      throw new ErrorCuentaPendiente()
    }

    // Mismo motivo que en crear-usuario: esta conexión es service_role,
    // sin auth.uid(), así que se audita a mano con el actor real.
    await supabaseAdmin.from('auditoria').insert({
      usuario_id: user.id,
      accion: 'eliminar_usuarios',
      entidad: 'usuarios',
      entidad_id: usuarioId,
      detalle: { ...perfilObjetivo, via: 'edge_function' }
    })

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return responderError(err, corsHeaders, 'eliminar-usuario')
  }
})
