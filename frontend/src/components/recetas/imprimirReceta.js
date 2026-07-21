import { supabase } from '../../lib/supabase'

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null
  const hoy = new Date()
  const nacimiento = new Date(fechaNacimiento)
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const m = hoy.getMonth() - nacimiento.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--
  return edad
}

const NOMBRE_SEXO = { M: 'Masculino', F: 'Femenino', X: 'Otro' }

export async function imprimirReceta({ receta, paciente, clinicaId }) {
  const { data: clinica } = await supabase.from('clinicas').select('nombre, direccion, telefono').eq('id', clinicaId).single()

  const filas = (receta.medicamentos ?? []).map((m) => `
    <div class="medicamento">
      <div class="medicamento-nombre">${m.medicamento}${m.presentacion ? ` — ${m.presentacion}` : ''}</div>
      <div class="medicamento-detalle">
        ${[m.dosis && `Dosis: ${m.dosis}`, m.via && `Vía: ${m.via}`, m.frecuencia && `Frecuencia: ${m.frecuencia}`, m.duracion && `Duración: ${m.duracion}`]
          .filter(Boolean).join(' · ')}
      </div>
      ${m.indicaciones ? `<div class="medicamento-indicaciones">${m.indicaciones}</div>` : ''}
    </div>
  `).join('')

  const edad = calcularEdad(paciente.fecha_nacimiento)

  const html = `
    <!doctype html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Receta — ${paciente.nombre_completo}</title>
      <style>
        body { font-family: system-ui, sans-serif; color: #1E293B; padding: 40px; max-width: 600px; margin: 0 auto; }
        h1 { color: #1E5F8C; font-size: 18px; margin: 0 0 2px; }
        .clinica-datos { font-size: 11px; color: #64748B; margin-bottom: 20px; }
        .datos-paciente { border-top: 2px solid #E2E8F0; border-bottom: 2px solid #E2E8F0; padding: 12px 0; margin-bottom: 20px; font-size: 13px; }
        .datos-paciente div { margin-bottom: 3px; }
        .rp { font-size: 22px; font-weight: 800; color: #1E5F8C; margin-bottom: 12px; }
        .medicamento { margin-bottom: 16px; padding-left: 12px; border-left: 3px solid #E2E8F0; }
        .medicamento-nombre { font-weight: 700; font-size: 14px; }
        .medicamento-detalle { font-size: 12px; color: #475569; margin-top: 2px; }
        .medicamento-indicaciones { font-size: 12px; color: #64748B; font-style: italic; margin-top: 3px; }
        .indicaciones-generales { margin-top: 20px; font-size: 12px; color: #475569; }
        .firma { margin-top: 60px; text-align: center; }
        .firma-linea { border-top: 1px solid #94A3B8; width: 220px; margin: 0 auto 6px; }
        .firma-texto { font-size: 12px; color: #475569; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>${clinica?.nombre ?? 'Consultorio'}</h1>
      <div class="clinica-datos">${[clinica?.direccion, clinica?.telefono].filter(Boolean).join(' · ')}</div>

      <div class="datos-paciente">
        <div><strong>Paciente:</strong> ${paciente.nombre_completo}${paciente.numero_expediente ? ` (${paciente.numero_expediente})` : ''}</div>
        <div>${edad !== null ? `<strong>Edad:</strong> ${edad} años` : ''}${paciente.sexo ? ` · <strong>Sexo:</strong> ${NOMBRE_SEXO[paciente.sexo] ?? paciente.sexo}` : ''}</div>
        <div><strong>Fecha:</strong> ${new Date(receta.creado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
      </div>

      <div class="rp">Rp.</div>
      ${filas}

      ${receta.indicaciones_generales ? `<div class="indicaciones-generales"><strong>Indicaciones generales:</strong> ${receta.indicaciones_generales}</div>` : ''}

      <div class="firma">
        <div class="firma-linea"></div>
        <div class="firma-texto">
          ${receta.dentista?.nombre ?? ''}
          ${receta.dentista?.cedula_profesional ? `<br/>Céd. Prof. ${receta.dentista.cedula_profesional}` : ''}
        </div>
      </div>

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
