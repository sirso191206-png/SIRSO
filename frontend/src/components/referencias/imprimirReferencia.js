import { supabase } from '../../lib/supabase'
import { abrirVentanaImpresion } from '../../lib/imprimir'
import { calcularEdad } from '../../lib/fechas'

export async function imprimirReferencia({ referencia, paciente, clinicaId }) {
  const { data: clinica } = await supabase.from('clinicas').select('nombre, direccion, telefono').eq('id', clinicaId).single()
  const edad = calcularEdad(paciente.fecha_nacimiento)

  const html = `
    <!doctype html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Referencia médica — ${paciente.nombre_completo}</title>
      <style>
        body { font-family: system-ui, sans-serif; color: #1E293B; padding: 40px; max-width: 620px; margin: 0 auto; }
        h1 { color: #1E5F8C; font-size: 18px; margin: 0 0 2px; }
        .clinica-datos { font-size: 11px; color: #64748B; margin-bottom: 24px; }
        .destinatario { margin-bottom: 20px; font-size: 13px; }
        .destinatario strong { display: block; font-size: 14px; }
        h2 { font-size: 13px; color: #1E5F8C; margin: 16px 0 4px; }
        p { font-size: 13px; color: #334155; line-height: 1.5; margin: 0; }
        .datos-paciente { border-top: 1px solid #E2E8F0; border-bottom: 1px solid #E2E8F0; padding: 10px 0; margin: 16px 0; font-size: 13px; }
        .firma { margin-top: 60px; text-align: center; }
        .firma-linea { border-top: 1px solid #94A3B8; width: 240px; margin: 0 auto 6px; }
        .firma-texto { font-size: 12px; color: #475569; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>${clinica?.nombre ?? 'Consultorio'}</h1>
      <div class="clinica-datos">${[clinica?.direccion, clinica?.telefono].filter(Boolean).join(' · ')}</div>

      <div class="destinatario">
        <strong>Para: ${referencia.medico_nombre}</strong>
        ${referencia.especialidad ? referencia.especialidad : ''}
      </div>

      <p>Por medio de la presente, refiero a mi cargo al paciente:</p>

      <div class="datos-paciente">
        <div><strong>${paciente.nombre_completo}</strong>${paciente.numero_expediente ? ` (${paciente.numero_expediente})` : ''}</div>
        <div>${edad !== null ? `${edad} años` : ''}${paciente.telefono ? ` · Tel. ${paciente.telefono}` : ''}</div>
      </div>

      ${referencia.motivo ? `<h2>Motivo de la referencia</h2><p>${referencia.motivo}</p>` : ''}
      ${referencia.diagnostico ? `<h2>Diagnóstico</h2><p>${referencia.diagnostico}</p>` : ''}
      ${referencia.tratamiento_realizado ? `<h2>Tratamiento realizado hasta ahora</h2><p>${referencia.tratamiento_realizado}</p>` : ''}

      <p style="margin-top: 20px;">Agradezco de antemano su valiosa atención y quedo atento a sus comentarios.</p>

      <div class="firma">
        <div class="firma-linea"></div>
        <div class="firma-texto">
          ${referencia.dentista?.nombre ?? ''}
          ${referencia.dentista?.cedula_profesional ? `<br/>Céd. Prof. ${referencia.dentista.cedula_profesional}` : ''}
        </div>
      </div>

      <script>window.print()</script>
    </body>
    </html>
  `

  abrirVentanaImpresion(html)
}
