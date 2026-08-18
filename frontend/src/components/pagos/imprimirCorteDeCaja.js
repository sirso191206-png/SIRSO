import { supabase } from '../../lib/supabase'
import { abrirVentanaImpresion } from '../../lib/imprimir'

const NOMBRE_METODO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', otro: 'Otro' }

export async function imprimirCorteDeCaja({ pagos, desde, hasta, clinicaId, totalesPorMetodo, totalGeneral }) {
  const { data: clinica } = await supabase.from('clinicas').select('nombre').eq('id', clinicaId).single()

  const filasMetodo = Object.entries(totalesPorMetodo)
    .filter(([, monto]) => monto !== 0)
    .map(([metodo, monto]) => `
      <tr>
        <td>${NOMBRE_METODO[metodo] ?? metodo}</td>
        <td style="text-align:right">$${monto.toFixed(2)}</td>
      </tr>
    `).join('')

  const filasDetalle = pagos.map((p) => `
    <tr>
      <td>${p.numero_recibo}</td>
      <td>${p.paciente?.nombre_completo ?? ''}</td>
      <td>${NOMBRE_METODO[p.metodo] ?? p.metodo}</td>
      <td>${p.tipo}</td>
      <td style="text-align:right">${p.tipo === 'reembolso' ? '-' : ''}$${Number(p.monto).toFixed(2)}</td>
    </tr>
  `).join('')

  const html = `
    <!doctype html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Corte de caja</title>
      <style>
        body { font-family: system-ui, sans-serif; color: #1E293B; padding: 40px; max-width: 700px; margin: 0 auto; }
        h1 { color: #1E5F8C; font-size: 20px; margin-bottom: 4px; }
        .subtitulo { color: #64748B; font-size: 13px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { text-align: left; border-bottom: 2px solid #E2E8F0; padding: 6px; font-size: 11px; color: #64748B; }
        td { padding: 6px; border-bottom: 1px solid #F1F5F9; font-size: 12px; }
        .total { text-align: right; font-size: 18px; margin: 20px 0; font-weight: 800; color: #15803D; }
        h2 { font-size: 13px; color: #475569; margin-top: 28px; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>${clinica?.nombre ?? 'Consultorio'}</h1>
      <div class="subtitulo">
        Corte de caja · ${new Date(desde).toLocaleDateString('es-MX')} a ${new Date(hasta).toLocaleDateString('es-MX')}<br/>
        Generado el ${new Date().toLocaleString('es-MX')}
      </div>

      <h2>Totales por método de pago</h2>
      <table>
        <thead><tr><th>Método</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${filasMetodo}</tbody>
      </table>

      <div class="total">Total del periodo: $${totalGeneral.toFixed(2)}</div>

      <h2>Detalle de movimientos</h2>
      <table>
        <thead><tr><th>Recibo</th><th>Paciente</th><th>Método</th><th>Tipo</th><th style="text-align:right">Monto</th></tr></thead>
        <tbody>${filasDetalle}</tbody>
      </table>

      <script>window.print()</script>
    </body>
    </html>
  `

  abrirVentanaImpresion(html)
}
