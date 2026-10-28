// ============================================================
// SIRO — Alertas de fallos de las Edge Functions (migración 116; auditoría P1-05 / P1-06).
// Registra el fallo en errores_app (lo ve el superadmin en «Errores») y, si es crítico, manda un correo a CORREO_SOPORTE
// por Resend, como máximo uno por función cada 30 minutos. Nunca lanza: una alerta que falla no debe tumbar la función.
// No incluye datos de pacientes: solo la función, el código y el mensaje técnico recortado.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

export async function registrarFalloEdge(funcion: string, error: unknown, critico = true): Promise<void> {
  try {
    const e = error as { code?: string; message?: string }
    const mensaje = `${e?.code ? `[${e.code}] ` : ''}${e?.message ?? String(error)}`.slice(0, 500)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    await admin.from('errores_app').insert({ origen: 'edge', gravedad: critico ? 'critico' : 'error', ruta: funcion, mensaje })
    if (!critico) return
    const { data: reciente } = await admin.rpc('fn_alerta_reciente', { p_ruta: funcion })
    if (reciente === true) return
    const llave = Deno.env.get('RESEND_API_KEY')
    const para = Deno.env.get('CORREO_SOPORTE')
    if (!llave || !para) return
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'SIRO <onboarding@resend.dev>',
        to: [para],
        subject: `SIRO — falla en ${funcion}`,
        html: `<p>La función <strong>${escapar(funcion)}</strong> falló el ${new Date().toISOString()}.</p>
               <p>${escapar(mensaje)}</p>
               <p>Revisa «Errores» en el panel de superadministrador y los registros de la función en Supabase.
               No se repetirá este aviso durante 30 minutos.</p>`,
      }),
    })
  } catch (err) {
    console.error('alertas: no se pudo registrar el fallo', funcion, (err as Error)?.message)
  }
}
