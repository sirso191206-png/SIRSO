import { supabase } from '../../lib/supabase'

export async function imprimirPresupuesto({ paciente, tratamientos, clinicaId }) {
  const { data: clinica } = await supabase.from('clinicas').select('nombre').eq('id', clinicaId).single()

  const filas = tratamientos.map((t) => {
    const costo = Number(t.costo)
    const descuento = Number(t.descuento ?? 0)
    const total = costo - descuento
    return `
      <tr>
        <td>${t.descripcion}${t.pieza_dental ? ` (pieza ${t.pieza_dental})` : ''}</td>
        <td style="text-align:center">${t.numero_sesiones ?? 1}</td>
        <td style="text-align:right">$${costo.toFixed(2)}</td>
        <td style="text-align:right">${descuento > 0 ? '-$' + descuento.toFixed(2) : '—'}</td>
        <td style="text-align:right"><strong>$${total.toFixed(2)}</strong></td>
      </tr>
    `
  }).join('')

  const totalGeneral = tratamientos.reduce((acc, t) => acc + Number(t.costo) - Number(t.descuento ?? 0), 0)

  const html = `
    <!doctype html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Presupuesto — ${paciente.nombre_completo}</title>
      <style>
        body { font-family: system-ui, sans-serif; color: #1E293B; padding: 40px; max-width: 700px; margin: 0 auto; }
        h1 { color: #1E5F8C; font-size: 20px; margin-bottom: 4px; }
        .subtitulo { color: #64748B; font-size: 13px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { text-align: left; border-bottom: 2px solid #E2E8F0; padding: 8px 6px; font-size: 12px; color: #64748B; }
        td { padding: 8px 6px; border-bottom: 1px solid #F1F5F9; font-size: 13px; }
        .total { text-align: right; font-size: 16px; margin-top: 16px; }
        .pie { margin-top: 40px; font-size: 11px; color: #94A3B8; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>${clinica?.nombre ?? 'Consultorio'}</h1>
      <div class="subtitulo">
        Presupuesto de tratamiento · ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}<br/>
        Paciente: ${paciente.nombre_completo} ${paciente.numero_expediente ? `(${paciente.numero_expediente})` : ''}
      </div>
      <table>
        <thead>
          <tr>
            <th>Tratamiento</th>
            <th style="text-align:center">Sesiones</th>
            <th style="text-align:right">Costo</th>
            <th style="text-align:right">Descuento</th>
            <th style="text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      <div class="total">Total general: <strong>$${totalGeneral.toFixed(2)}</strong></div>
      <div class="pie">Este presupuesto es una estimación y puede variar según la evolución del tratamiento.</div>
      <script>window.print()</script>
    </body>
    </html>
  `

  const ventana = window.open('', '_blank')
  if (!ventana) {
    throw new Error('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio.')
  }
  ventana.document.write(html)
  ventana.document.close()
}
