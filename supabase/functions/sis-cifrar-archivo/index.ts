// Edge Function: sis-cifrar-archivo
// ------------------------------------------------------------
// Cifra el contenido de un reporte SIS (.TXT, ya generado por
// sis-exporter.ts en el frontend) a .CIF, reproduciendo exactamente
// la herramienta oficial de cifrado de la DGIS (cifrado.jar) — ver
// _shared/sis-cifrado.ts para el detalle completo de cómo se
// verificó el algoritmo.
//
// El cifrado SIEMPRE corre aquí (Edge Function, service_role), nunca
// en el frontend: la llave de 24 bytes es un secreto de Supabase
// (SIS_CIFRADO_LLAVE_B64), y no debe llegar jamás al navegador.
//
// Cualquier usuario autenticado de una clínica puede cifrar su
// propio reporte — no requiere ser super admin, es una operación de
// utilidad, no de administración de la plataforma.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { buildCorsHeaders } from '../_shared/cors.ts'
import { exigirSinCambioPendiente, ErrorDeSolicitud, leerCuerpoJson, responderError } from '../_shared/solicitud.ts'
import { cifrarDes3Ecb } from '../_shared/sis-cifrado.ts'

// Un reporte SIS es texto plano de unos cuantos KB; 8 MB de base64 (~6 MB de contenido) es un tope holgado que evita agotar la memoria de la función.
const MAX_BASE64 = 8 * 1024 * 1024

function base64ADatos(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

function datosABase64(datos: Uint8Array): string {
  let binario = ''
  const trozo = 8192 // evita desbordar el stack con archivos grandes
  for (let i = 0; i < datos.length; i += trozo) {
    binario += String.fromCharCode(...datos.subarray(i, i + trozo))
  }
  return btoa(binario)
}

serve(async (req) => {
  // CORS por petición: refleja el Origin si está en la lista blanca.
  const corsHeaders = buildCorsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new ErrorDeSolicitud('Falta autenticación')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Solo se valida que exista una sesión real — cualquier usuario
    // autenticado de una clínica puede cifrar su propio reporte.
    const supabaseCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await supabaseCaller.auth.getUser()
    if (userError || !user) throw new ErrorDeSolicitud('Token inválido')

    // Solo cuentas con perfil en una clínica (una cuenta sin perfil —p. ej. una baja a medias— no debe poder usar el cifrado).
    const { data: perfil } = await supabaseCaller.from('usuarios').select('id, debe_cambiar_password').eq('id', user.id).maybeSingle()
    if (!perfil) throw new ErrorDeSolicitud('No se encontró tu perfil', 403)
    exigirSinCambioPendiente(perfil)

    // La llave es un secreto: sus problemas se registran en el servidor y NO se describen al llamante (ni su longitud ni el nombre del secreto).
    const llaveB64 = Deno.env.get('SIS_CIFRADO_LLAVE_B64')
    let llave24: Uint8Array
    try { llave24 = llaveB64 ? base64ADatos(llaveB64) : new Uint8Array(0) } catch { llave24 = new Uint8Array(0) }
    if (llave24.length !== 24) {
      console.error('sis-cifrar-archivo: SIS_CIFRADO_LLAVE_B64 no está configurado o no decodifica a exactamente 24 bytes (supabase secrets set SIS_CIFRADO_LLAVE_B64=...)')
      throw new ErrorDeSolicitud('El cifrado no está configurado en este proyecto. Contacta a soporte.', 500, 'CIFRADO_NO_CONFIGURADO')
    }

    const body = await leerCuerpoJson(req)
    const contenidoBase64 = body.contenidoBase64
    const nombreBase = typeof body.nombreBase === 'string' ? body.nombreBase.trim() : ''
    if (typeof contenidoBase64 !== 'string' || !contenidoBase64) throw new ErrorDeSolicitud('Falta contenidoBase64 (el .TXT ya generado, codificado en base64).')
    if (contenidoBase64.length > MAX_BASE64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(contenidoBase64) || contenidoBase64.length % 4 !== 0) throw new ErrorDeSolicitud('contenidoBase64 no es base64 válido o excede el tamaño máximo permitido.')
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(nombreBase)) throw new ErrorDeSolicitud('nombreBase no es válido (letras, números, punto, guion y guion bajo; hasta 80 caracteres; ej. "CSB-MCIMB-2410").')

    const datosOriginales = base64ADatos(contenidoBase64)
    const datosCifrados = cifrarDes3Ecb(datosOriginales, llave24)

    return new Response(
      JSON.stringify({
        archivoBase64: datosABase64(datosCifrados),
        nombreArchivo: `${nombreBase}.CIF`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return responderError(err, corsHeaders, 'sis-cifrar-archivo')
  }
})
