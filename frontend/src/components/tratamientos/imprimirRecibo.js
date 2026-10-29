import { supabase } from '../../lib/supabase'
import { abrirVentanaImpresion, html } from '../../lib/imprimir'
import { formatearMoneda } from '../../lib/formato'

const NOMBRE_METODO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', otro: 'Otro' }
const NOMBRE_TIPO = { anticipo: 'Anticipo', pago: 'Pago', reembolso: 'Reembolso' }

// `saldo` (opcional): saldo pendiente del paciente después de este pago. `registradoPor` (opcional): quién cobró.
export async function imprimirRecibo({ pago, paciente, clinicaId, saldo = null, registradoPor = null }) {
  // Datos del establecimiento: Configuración dice que aparecen en los recibos.
  const { data: clinica } = await supabase.from('clinicas').select('nombre, direccion, telefono, rfc, razon_social').eq('id', clinicaId).single()
  const datosClinica = [clinica?.razon_social && clinica.razon_social !== clinica?.nombre ? clinica.razon_social : null, clinica?.direccion,
    clinica?.telefono ? `Tel. ${clinica.telefono}` : null, clinica?.rfc ? `RFC ${clinica.rfc}` : null].filter(Boolean)

  const documento = html`
    <!doctype html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Recibo ${pago.numero_recibo}</title>
      <style>
        body { font-family: system-ui, sans-serif; color: #1E293B; padding: 40px; max-width: 480px; margin: 0 auto; }
        .encabezado { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #E2E8F0; padding-bottom: 16px; margin-bottom: 20px; }
        h1 { color: #1E5F8C; font-size: 18px; margin: 0 0 4px; }
        .folio { text-align: right; }
        .folio-numero { font-size: 16px; font-weight: 700; color: #1E5F8C; }
        .folio-fecha { font-size: 12px; color: #64748B; }
        dl { margin: 0; }
        dt { font-size: 11px; color: #94A3B8; margin-top: 12px; }
        dd { margin: 2px 0 0; font-size: 14px; color: #1E293B; }
        .monto { text-align: center; margin: 28px 0; padding: 20px; background: #F8FAFC; border-radius: 12px; }
        .monto-numero { font-size: 32px; font-weight: 800; color: #15803D; }
        .monto-tipo { font-size: 12px; color: #64748B; margin-top: 4px; }
        .pie { margin-top: 32px; font-size: 11px; color: #94A3B8; text-align: center; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="encabezado">
        <div>
          <h1>${clinica?.nombre ?? 'Consultorio'}</h1>
          ${datosClinica.map((d) => html`<div style="font-size:11px;color:#64748B;">${d}</div>`)}
          <div style="font-size:12px;color:#64748B;margin-top:4px;">Recibo de pago</div>
        </div>
        <div class="folio">
          <div class="folio-numero">${pago.numero_recibo}</div>
          <div class="folio-fecha">${new Date(pago.creado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
      </div>

      <dl>
        <dt>Paciente</dt>
        <dd>${paciente.nombre_completo}${paciente.numero_expediente ? ` (${paciente.numero_expediente})` : ''}</dd>
        <dt>Método de pago</dt>
        <dd>${NOMBRE_METODO[pago.metodo] ?? pago.metodo}</dd>
        ${registradoPor ? html`<dt>Recibió</dt><dd>${registradoPor}</dd>` : ''}
      </dl>

      <div class="monto">
        <div class="monto-numero">$${formatearMoneda(pago.monto)}</div>
        <div class="monto-tipo">${NOMBRE_TIPO[pago.tipo] ?? pago.tipo}</div>
      </div>
      ${saldo !== null && saldo !== undefined ? html`<p style="text-align:center;font-size:13px;color:#475569;">Saldo pendiente al imprimir: <strong>$${formatearMoneda(Math.max(0, Number(saldo)))}</strong></p>` : ''}

      <div class="pie">Este recibo es un comprobante de pago, no sustituye una factura fiscal.</div>
    </body>
    </html>
  `

  abrirVentanaImpresion(documento)
}
