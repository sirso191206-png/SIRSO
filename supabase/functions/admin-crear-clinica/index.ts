// Edge Function: admin-crear-clinica
// Solo responde si quien llama tiene usuarios.es_super_admin = true.
// Crea una clínica NUEVA y su usuario DUEÑO (owner) de forma atómica:
// si algo falla a mitad, revierte para no dejar ni Auth ni clínica
// huérfanos. Usa service_role (nunca en el frontend) para poder crear
// el usuario de Auth y saltarse RLS de forma controlada.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { buildCorsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  // CORS por petición: refleja el Origin si está en la lista blanca.
  const corsHeaders = buildCorsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    console.log('admin-crear-clinica: Authorization presente:', !!authHeader, '— empieza con Bearer:', !!authHeader?.startsWith('Bearer '))
    if (!authHeader) throw new Error('Falta autenticación')

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    console.log('admin-crear-clinica: token presente:', !!token, '— longitud:', token.length)
    if (!token) throw new Error('Falta token de acceso')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    // Cliente efímero: sin persistir/refrescar sesión propia — esta
    // función corre una sola vez por petición; el único propósito de
    // este cliente es validar el token recibido en la petición.
    const supabaseCaller = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
    const { data: { user }, error: userError } = await supabaseCaller.auth.getUser(token)
    if (userError) {
      console.error('admin-crear-clinica: error validando JWT:', userError.message, '— status:', userError.status)
    }
    console.log('admin-crear-clinica: usuario autenticado:', !!user)
    if (userError || !user) throw new Error('Token inválido')

    // Cliente admin: el único que puede crear usuarios de Auth.
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // Autorización: SOLO super admin.
    const { data: perfilCaller, error: perfilError } = await supabaseAdmin
      .from('usuarios')
      .select('es_super_admin')
      .eq('id', user.id)
      .single()
    if (perfilError || !perfilCaller) throw new Error('No se encontró tu perfil')
    if (!perfilCaller.es_super_admin) throw new Error('No autorizado')

    // Entrada
    const body = await req.json()
    const nombreClinica = (body?.nombreClinica ?? '').trim()
    const ownerNombre = (body?.ownerNombre ?? '').trim()
    const ownerCorreo = (body?.ownerCorreo ?? '').trim().toLowerCase()
    // Plan: por compatibilidad con clientes anteriores al selector de plan,
    // si no viene se usa 'esencial'/'mensual'. NO hay precios ni límites
    // aquí: todo sale de la base de datos (planes_catalogo).
    const planCodigo = (body?.planCodigo ?? 'esencial').toString().trim().toLowerCase()
    const modalidad = (body?.modalidad ?? 'mensual').toString().trim().toLowerCase()
    const precioContratado = body?.precioContratado ?? null      // opcional: convenio a la medida
    const fechaFin = body?.fechaFin ?? null
    const autoRenovacion = body?.autoRenovacion ?? true

    if (!nombreClinica) throw new Error('Falta el nombre de la clínica')
    if (!ownerNombre) throw new Error('Falta el nombre del dueño')
    if (!ownerCorreo) throw new Error('Falta el correo del dueño')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerCorreo)) {
      throw new Error('El correo del dueño no es válido')
    }

    if (!['mensual', 'anual'].includes(modalidad)) throw new Error('Modalidad inválida (mensual o anual)')
    if (precioContratado !== null && (typeof precioContratado !== 'number' || precioContratado < 0)) {
      throw new Error('Precio contratado inválido')
    }
    // Se valida el plan ANTES de crear nada: así un plan inexistente o
    // desactivado no deja una clínica ni un usuario a medias.
    const { data: planDb, error: planError } = await supabaseAdmin
      .from('planes_catalogo')
      .select('plan, activo')
      .eq('plan', planCodigo)
      .maybeSingle()
    if (planError) throw planError
    if (!planDb) throw new Error('El plan seleccionado no existe')
    if (!planDb.activo) throw new Error('El plan seleccionado está desactivado')

    // 1) Crear la clínica CON su suscripción y su snapshot de límites y funcionalidades en UNA
    //    sola transacción (fn_crear_clinica_con_plan, migración 076 — solo service_role). La base
    //    de datos además rechaza cualquier clínica sin suscripción: no hay vía "a medias".
    const { data: alta, error: altaError } = await supabaseAdmin.rpc('fn_crear_clinica_con_plan', {
      p_actor: user.id,
      p_nombre: nombreClinica,
      p_plan: planCodigo,
      p_modalidad: modalidad,
      p_precio: precioContratado,
      p_fecha_fin: fechaFin,
      p_auto_renovacion: autoRenovacion,
    })
    if (altaError) throw altaError
    const asignacion = alta.suscripcion
    const { data: clinica, error: clinicaError } = await supabaseAdmin
      .from('clinicas')
      .select()
      .eq('id', alta.clinica_id)
      .single()
    if (clinicaError) throw clinicaError

    // 2) Crear el usuario de Auth (dueño) con contraseña temporal.
    const passwordTemporal = crypto.randomUUID().slice(0, 12)
    const { data: nuevoAuth, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: ownerCorreo,
        password: passwordTemporal,
        email_confirm: true,
      })
    if (createError) {
      // Revertir la clínica recién creada (p. ej. si el correo ya existe).
      await supabaseAdmin.from('clinicas').delete().eq('id', clinica.id)
      throw createError
    }

    // 3) Crear el perfil en `usuarios` como owner de ESTA clínica.
    const { error: insertError } = await supabaseAdmin.from('usuarios').insert({
      id: nuevoAuth.user.id,
      clinica_id: clinica.id,
      nombre: ownerNombre,
      correo: ownerCorreo,
      rol: 'owner',
    })
    if (insertError) {
      // Revertir todo: sin perfil, ni Auth ni clínica deben quedar.
      await supabaseAdmin.auth.admin.deleteUser(nuevoAuth.user.id)
      await supabaseAdmin.from('clinicas').delete().eq('id', clinica.id)
      throw insertError
    }

    // 4) Auditoría (clinicas no tiene trigger de auditoría; se registra a
    //    mano con el user.id del super admin que sí validamos arriba).
    await supabaseAdmin.from('auditoria').insert({
      usuario_id: user.id,
      accion: 'crear_clinica',
      entidad: 'clinicas',
      entidad_id: clinica.id,
      detalle: {
        nombreClinica: clinica.nombre,
        ownerCorreo,
        ownerNombre,
        planCodigo,
        modalidad,
        via: 'edge_function',
      },
    })

    return new Response(
      JSON.stringify({ clinica, correo: ownerCorreo, passwordTemporal, suscripcion: asignacion }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
