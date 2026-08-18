// ============================================================
// SIRO — Interoperabilidad SIS: cliente del cifrado (corte E)
// ------------------------------------------------------------
// El cifrado real (DES-EDE3/ECB/PKCS5) corre en la Edge Function
// `sis-cifrar-archivo`, nunca aquí — este módulo solo empaqueta la
// llamada. Ver supabase/functions/_shared/sis-cifrado.ts para el
// algoritmo y supabase/functions/sis-cifrar-archivo/index.ts para
// el endpoint.
// ============================================================

import { supabase } from '../../../lib/supabase'

async function extraerMensajeError(error: unknown): Promise<string> {
  try {
    const err = error as { context?: { json?: () => Promise<{ error?: string }> }; message?: string }
    if (err?.context && typeof err.context.json === 'function') {
      const cuerpo = await err.context.json()
      if (cuerpo?.error) return cuerpo.error
    }
  } catch {
    // si no se pudo leer el cuerpo, cae al mensaje genérico de abajo
  }
  return (error as { message?: string })?.message ?? 'Ocurrió un error inesperado.'
}

export interface ResultadoCifrado {
  /** Bytes del .CIF, listos para descargar/subir a SINBA. */
  archivo: Uint8Array
  /** Nombre sugerido del archivo, ej. "CSB-MCIMB-2410.CIF". */
  nombreArchivo: string
}

/**
 * Pide a la Edge Function que cifre un archivo .TXT (ya generado por
 * sis-exporter.ts, en Windows-1252) y devuelva el .CIF listo.
 * `nombreBase` es el nombre sin extensión, ej. "CSB-MCIMB-2410"
 * (ver construirNombreArchivo en sis-exporter.ts).
 */
export async function cifrarReporteSis(contenidoTxt: Uint8Array, nombreBase: string): Promise<ResultadoCifrado> {
  let binario = ''
  for (let i = 0; i < contenidoTxt.length; i += 8192) {
    binario += String.fromCharCode(...contenidoTxt.subarray(i, i + 8192))
  }
  const contenidoBase64 = btoa(binario)

  const { data, error } = await supabase.functions.invoke('sis-cifrar-archivo', {
    body: { contenidoBase64, nombreBase },
  })
  if (error) throw new Error(await extraerMensajeError(error))
  if (data?.error) throw new Error(data.error)

  const archivo = Uint8Array.from(atob(data.archivoBase64), (c) => c.charCodeAt(0))
  return { archivo, nombreArchivo: data.nombreArchivo }
}
