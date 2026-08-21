import { supabase } from '../../lib/supabase'
import { abrirVentanaImpresion } from '../../lib/imprimir'

const NOMBRE_URGENCIA = { electivo: 'Electivo', urgente: 'Urgente', emergencia: 'Emergencia' }

export async function imprimirConsentimiento({ consentimiento, paciente, clinicaId }) {
  const { data: clinica } = await supabase.from('clinicas').select('nombre, direccion, responsable_sanitario').eq('id', clinicaId).single()

  const bloqueFirma = (titulo, nombre, png) => `
    <div class="firma-bloque">
      <div class="firma-titulo">${titulo}</div>
      ${png ? `<img src="${png}" class="firma-img" />` : '<div class="firma-vacia">Sin firma</div>'}
      <div class="firma-linea"></div>
      <div class="firma-nombre">${nombre || ''}</div>
    </div>
  `

  const fila = (etiqueta, valor) => (valor ? `<div class="campo"><span class="campo-etiqueta">${etiqueta}:</span> ${valor}</div>` : '')

  const html = `
    <!doctype html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Consentimiento informado — ${paciente.nombre_completo}</title>
      <style>
        body { font-family: system-ui, sans-serif; color: #1E293B; padding: 40px; max-width: 700px; margin: 0 auto; }
        h1 { color: #1E5F8C; font-size: 18px; margin: 0 0 2px; text-align: center; }
        .titulo-carta { text-align: center; font-size: 15px; font-weight: 600; color: #334155; margin: 6px 0 18px; text-transform: uppercase; letter-spacing: 0.02em; }
        .clinica-datos { font-size: 11px; color: #64748B; margin-bottom: 16px; text-align: center; }
        .datos-paciente { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; border-top: 2px solid #E2E8F0; border-bottom: 2px solid #E2E8F0; padding: 12px 0; margin-bottom: 16px; font-size: 12.5px; }
        .campo { font-size: 13px; color: #334155; line-height: 1.6; margin-bottom: 8px; }
        .campo-etiqueta { font-weight: 600; color: #1E5F8C; }
        p.parrafo { font-size: 13px; color: #334155; line-height: 1.6; margin: 10px 0; text-align: justify; }
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
      <div class="clinica-datos">${[clinica?.direccion, clinica?.responsable_sanitario ? `Responsable sanitario: ${clinica.responsable_sanitario}` : null].filter(Boolean).join(' · ')}</div>
      <div class="titulo-carta">Carta de consentimiento informado odontológico</div>

      <div class="datos-paciente">
        <div><strong>Paciente:</strong> ${paciente.nombre_completo}${paciente.numero_expediente ? ` (${paciente.numero_expediente})` : ''}</div>
        <div><strong>Fecha:</strong> ${new Date(consentimiento.creado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        <div><strong>Lugar:</strong> ${consentimiento.lugar || clinica?.direccion || '—'}</div>
        <div><strong>Grado de urgencia:</strong> ${NOMBRE_URGENCIA[consentimiento.grado_urgencia] ?? 'Electivo'}</div>
        ${consentimiento.fecha_procedimiento ? `<div><strong>Fecha del procedimiento:</strong> ${new Date(consentimiento.fecha_procedimiento + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</div>` : ''}
      </div>

      ${consentimiento.revocado_en ? `
        <div style="background:#FEF2F2; border:1px solid #FCA5A5; border-radius:8px; padding:12px; margin-bottom:16px; font-size:13px; color:#991B1B;">
          <strong>⚠ Este consentimiento fue revocado</strong> el ${new Date(consentimiento.revocado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}.
          ${consentimiento.motivo_revocacion ? `Motivo: ${consentimiento.motivo_revocacion}` : ''}
        </div>
      ` : ''}

      ${fila('Diagnóstico', consentimiento.diagnostico)}
      ${fila('Procedimiento(s) estomatológico(s)', consentimiento.procedimiento)}
      ${fila('Pronóstico', consentimiento.pronostico)}

      <p class="parrafo">
        La o el profesional me ha informado satisfactoriamente de la naturaleza y propósito del/los
        procedimiento(s) descritos. Además, he sido informado(a) del tipo de anestesia (cuando aplique) y
        de los riesgos derivados de dicho procedimiento.
      </p>

      ${fila('Riesgos y complicaciones', consentimiento.riesgos)}
      ${fila('Posibles molestias o efectos secundarios', consentimiento.molestias_efectos_secundarios)}
      ${fila('Beneficios esperados', consentimiento.beneficios)}
      ${fila('Alternativa(s) de tratamiento', consentimiento.alternativas)}
      ${fila('Motivo de elección', consentimiento.motivo_eleccion)}

      <p class="parrafo">
        Autorizo al personal de este consultorio/clínica para que realice el o los estudios y
        tratamientos previamente descritos, así como, ante cualquier complicación o efecto adverso durante
        el/los procedimiento(s) — especialmente ante una urgencia — que se practiquen las técnicas y
        procedimientos necesarios.
      </p>
      <p class="parrafo">
        Acepto que no se me pueden dar garantías o seguridad absoluta respecto a que el resultado del
        procedimiento sea el más satisfactorio, por lo que existe la posibilidad de necesitar cualquier
        intervención posterior para mejorar el resultado final, y me comprometo a seguir responsablemente
        las recomendaciones recibidas antes y después de la intervención, así como a acudir a las citas de
        revisión post-operatoria durante el tiempo indicado.
      </p>
      <p class="parrafo">
        Tengo la plena libertad de revocar esta autorización en cualquier momento antes de realizarse el
        tratamiento.
      </p>

      <div class="firmas">
        ${bloqueFirma('Firma del paciente o tutor', consentimiento.firma_paciente_nombre, consentimiento.firma_paciente_png)}
        ${bloqueFirma('Firma del profesional', consentimiento.firma_medico_nombre ?? consentimiento.dentista?.nombre, consentimiento.firma_medico_png)}
      </div>

      ${(consentimiento.testigo1_nombre || consentimiento.testigo2_nombre) ? `
        <div class="testigos">
          <strong>Testigo(s):</strong> ${[consentimiento.testigo1_nombre, consentimiento.testigo2_nombre].filter(Boolean).join(' · ')}
        </div>
      ` : ''}

      <script>window.print()</script>
    </body>
    </html>
  `

  abrirVentanaImpresion(html)
}
