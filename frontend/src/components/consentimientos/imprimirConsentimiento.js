import { supabase } from '../../lib/supabase'

export async function imprimirConsentimiento({ consentimiento, paciente, clinicaId }) {
  const { data: clinica } = await supabase.from('clinicas').select('nombre, direccion').eq('id', clinicaId).single()

  const bloqueFirma = (titulo, nombre, png) => `
    <div class="firma-bloque">
      <div class="firma-titulo">${titulo}</div>
      ${png ? `<img src="${png}" class="firma-img" />` : '<div class="firma-vacia">Sin firma</div>'}
      <div class="firma-linea"></div>
      <div class="firma-nombre">${nombre || ''}</div>
    </div>
  `

  const html = `
    <!doctype html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Consentimiento informado — ${paciente.nombre_completo}</title>
      <style>
        body { font-family: system-ui, sans-serif; color: #1E293B; padding: 40px; max-width: 650px; margin: 0 auto; }
        h1 { color: #1E5F8C; font-size: 18px; margin: 0 0 2px; }
        .clinica-datos { font-size: 11px; color: #64748B; margin-bottom: 20px; }
        .datos-paciente { border-top: 2px solid #E2E8F0; border-bottom: 2px solid #E2E8F0; padding: 12px 0; margin-bottom: 20px; font-size: 13px; }
        h2 { font-size: 13px; color: #1E5F8C; margin: 18px 0 4px; }
        p { font-size: 13px; color: #334155; line-height: 1.5; margin: 0; }
        .firmas { display: flex; gap: 24px; margin-top: 40px; }
        .firma-bloque { flex: 1; text-align: center; }
        .firma-titulo { font-size: 11px; color: #64748B; margin-bottom: 6px; }
        .firma-img { max-height: 70px; max-width: 100%; }
        .firma-vacia { height: 70px; display: flex; align-items: center; justify-content: center; color: #CBD5E1; font-size: 11px; }
        .firma-linea { border-top: 1px solid #94A3B8; margin-top: 4px; }
        .firma-nombre { font-size: 12px; color: #475569; margin-top: 4px; }
        .testigos { margin-top: 24px; font-size: 12px; color: #64748B; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>${clinica?.nombre ?? 'Consultorio'}</h1>
      <div class="clinica-datos">${clinica?.direccion ?? ''}</div>

      <div class="datos-paciente">
        <div><strong>Paciente:</strong> ${paciente.nombre_completo}${paciente.numero_expediente ? ` (${paciente.numero_expediente})` : ''}</div>
        <div><strong>Fecha:</strong> ${new Date(consentimiento.creado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
      </div>

      <h2>Procedimiento</h2>
      <p>${consentimiento.procedimiento}</p>

      ${consentimiento.riesgos ? `<h2>Riesgos</h2><p>${consentimiento.riesgos}</p>` : ''}
      ${consentimiento.beneficios ? `<h2>Beneficios</h2><p>${consentimiento.beneficios}</p>` : ''}
      ${consentimiento.alternativas ? `<h2>Alternativas</h2><p>${consentimiento.alternativas}</p>` : ''}

      <p style="margin-top: 20px; font-style: italic;">
        Declaro que se me ha explicado el procedimiento descrito, sus riesgos, beneficios y alternativas,
        y que todas mis dudas han sido resueltas. Doy mi consentimiento de manera libre e informada.
      </p>

      <div class="firmas">
        ${bloqueFirma('Firma del paciente', consentimiento.firma_paciente_nombre, consentimiento.firma_paciente_png)}
        ${bloqueFirma('Firma del profesional', consentimiento.firma_medico_nombre ?? consentimiento.dentista?.nombre, consentimiento.firma_medico_png)}
      </div>

      ${(consentimiento.testigo1_nombre || consentimiento.testigo2_nombre) ? `
        <div class="testigos">
          <strong>Testigos:</strong> ${[consentimiento.testigo1_nombre, consentimiento.testigo2_nombre].filter(Boolean).join(' · ')}
        </div>
      ` : ''}

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
