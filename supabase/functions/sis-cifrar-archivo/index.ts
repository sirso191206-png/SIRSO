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
import { cifrarDes3Ecb } from '../_shared/sis-cifrado.ts'

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
    if (!authHeader) throw new Error('Falta autenticación')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

    // Solo se valida que exista una sesión real — cualquier usuario
    // autenticado de una clínica puede cifrar su propio reporte.
    const supabaseCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await supabaseCaller.auth.getUser()
    if (userError || !user) throw new Error('Token inválido')

    const llaveB64 = Deno.env.get('SIS_CIFRADO_LLAVE_B64')
    if (!llaveB64) {
      throw new Error(
        'El secreto SIS_CIFRADO_LLAVE_B64 no está configurado en este proyecto de Supabase. ' +
          'Corre: supabase secrets set SIS_CIFRADO_LLAVE_B64="<primeros 24 bytes de transferencia.jks, en base64>"',
      )
    }
    const llave24 = base64ADatos(llaveB64)
    if (llave24.length !== 24) {
      throw new Error(`SIS_CIFRADO_LLAVE_B64 debe decodificar a exactamente 24 bytes (se obtuvieron ${llave24.length}).`)
    }

    const body = await req.json()
    const contenidoBase64 = body?.contenidoBase64
    const nombreBase = (body?.nombreBase ?? '').trim()
    if (!contenidoBase64) throw new Error('Falta contenidoBase64 (el .TXT ya generado, codificado en base64).')
    if (!nombreBase) throw new Error('Falta nombreBase (nombre del archivo sin extensión, ej. "CSB-MCIMB-2410").')

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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
