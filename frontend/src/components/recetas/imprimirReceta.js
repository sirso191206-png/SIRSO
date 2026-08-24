import { supabase } from '../../lib/supabase'
import { abrirVentanaImpresion } from '../../lib/imprimir'
import { calcularEdad } from '../../lib/fechas'
import { obtenerSignosVitales } from '../../services/signosVitales'

const NOMBRE_SEXO = { M: 'Masculino', F: 'Femenino', X: 'Otro' }

/**
 * `receta.dentista` (nombre/cedula_profesional) es la relación EN VIVO
 * con `usuarios` — cambia si el odontólogo edita su perfil después.
 * Para el encabezado impreso usamos el SNAPSHOT (los datos con los que
 * la receta se emitió de verdad), y solo caemos al dato en vivo como
 * respaldo para recetas creadas ANTES de que existiera el snapshot
 * (nombre_medico_snapshot nulo = receta vieja).
 */
export function datosProfesionalParaImprimir(receta) {
  return {
    nombre: receta.nombre_medico_snapshot ?? receta.dentista?.nombre ?? '',
    rfc: receta.rfc_snapshot ?? null,
    cedula: receta.cedula_profesional_snapshot ?? receta.dentista?.cedula_profesional ?? null,
    escuela: receta.escuela_snapshot ?? null,
  }
}

export function bloqueSignosVitales(sv) {
  if (!sv) return ''
  const filas = [
    (sv.presion_sistolica && sv.presion_diastolica) ? `Presión arterial: ${sv.presion_sistolica}/${sv.presion_diastolica} mmHg` : (sv.presion_arterial ? `Presión arterial: ${sv.presion_arterial}` : null),
    sv.frecuencia_cardiaca ? `Frecuencia cardiaca: ${sv.frecuencia_cardiaca} lpm` : null,
    sv.frecuencia_respiratoria ? `Frecuencia respiratoria: ${sv.frecuencia_respiratoria} rpm` : null,
    sv.temperatura ? `Temperatura: ${sv.temperatura} °C` : null,
    sv.saturacion_oxigeno ? `SpO₂: ${sv.saturacion_oxigeno} %` : null,
    sv.peso ? `Peso: ${sv.peso} kg` : null,
    sv.estatura ? `Talla: ${sv.estatura} m` : null,
  ].filter(Boolean)

  if (filas.length === 0) return '' // hay registro pero sin ningún valor útil — no mostrar sección vacía

  return `
    <div class="signos-vitales">
      <div class="signos-vitales-titulo">Signos vitales</div>
      ${filas.map((f) => `<div class="signos-vitales-fila">${f}</div>`).join('')}
    </div>
  `
}

/**
 * Genera el bloque HTML del encabezado médico — nombre + datos
 * profesionales, cada uno en su propia línea, en el orden pedido
 * (Cédula → RFC → Universidad), omitiendo por completo cualquier
 * campo vacío (nunca una línea en blanco ni "No disponible").
 */
export function renderEncabezadoMedico(profesional) {
  return `
    <div class="encabezado-medico">
      <div class="encabezado-medico-nombre">${profesional.nombre}</div>
      ${profesional.cedula ? `<div class="encabezado-medico-dato">Cédula profesional: ${profesional.cedula}</div>` : ''}
      ${profesional.rfc ? `<div class="encabezado-medico-dato">RFC: ${profesional.rfc}</div>` : ''}
      ${profesional.escuela ? `<div class="encabezado-medico-dato">Universidad: ${profesional.escuela}</div>` : ''}
    </div>
  `
}

export async function imprimirReceta({ receta, paciente, clinicaId, incluirSignosVitales = true }) {
  const [{ data: clinica }, signosVitalesLista] = await Promise.all([
    supabase.from('clinicas').select('nombre, direccion, telefono').eq('id', clinicaId).single(),
    incluirSignosVitales ? obtenerSignosVitales(paciente.id) : Promise.resolve([]),
  ])

  // El más reciente — no hace falta que el odontólogo lo vuelva a
  // capturar, se recupera solo. Si el paciente no tiene ninguno
  // registrado, sencillamente no aparece la sección.
  const signosVitales = signosVitalesLista[0] ?? null

  const profesional = datosProfesionalParaImprimir(receta)

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
        .encabezado-medico { text-align: center; margin-bottom: 4px; }
        .encabezado-medico-nombre { font-size: 15px; font-weight: 700; color: #1E293B; }
        .encabezado-medico-dato { font-size: 10.5px; line-height: 1.5; color: #64748B; }
        h1 { color: #1E5F8C; font-size: 13px; font-weight: 600; text-align: center; margin: 14px 0 2px; text-transform: uppercase; letter-spacing: 0.03em; }
        .clinica-datos { font-size: 11px; color: #64748B; margin-bottom: 20px; text-align: center; }
        .datos-paciente { border-top: 2px solid #E2E8F0; border-bottom: 2px solid #E2E8F0; padding: 12px 0; margin-bottom: 20px; font-size: 13px; }
        .datos-paciente div { margin-bottom: 3px; }
        .rp { font-size: 22px; font-weight: 800; color: #1E5F8C; margin-bottom: 12px; }
        .medicamento { margin-bottom: 16px; padding-left: 12px; border-left: 3px solid #E2E8F0; }
        .medicamento-nombre { font-weight: 700; font-size: 14px; }
        .medicamento-detalle { font-size: 12px; color: #475569; margin-top: 2px; }
        .medicamento-indicaciones { font-size: 12px; color: #64748B; font-style: italic; margin-top: 3px; }
        .indicaciones-generales { margin-top: 20px; font-size: 12px; color: #475569; }
        .signos-vitales { margin-top: 20px; padding: 10px 12px; background: #F8FAFC; border-radius: 8px; }
        .signos-vitales-titulo { font-size: 11px; font-weight: 700; color: #1E5F8C; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 4px; }
        .signos-vitales-fila { font-size: 12px; color: #475569; }
        .firma { margin-top: 60px; text-align: center; }
        .firma-linea { border-top: 1px solid #94A3B8; width: 220px; margin: 0 auto 6px; }
        .firma-texto { font-size: 12px; color: #475569; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      ${renderEncabezadoMedico(profesional)}

      <h1>Receta médica / odontológica</h1>
      <div class="clinica-datos">${clinica?.nombre ?? ''}${clinica?.direccion ? ` — ${clinica.direccion}` : ''}${clinica?.telefono ? ` · ${clinica.telefono}` : ''}</div>

      <div class="datos-paciente">
        <div><strong>Paciente:</strong> ${paciente.nombre_completo}${paciente.numero_expediente ? ` (${paciente.numero_expediente})` : ''}</div>
        <div>${edad !== null ? `<strong>Edad:</strong> ${edad} años` : ''}${paciente.sexo ? ` · <strong>Sexo:</strong> ${NOMBRE_SEXO[paciente.sexo] ?? paciente.sexo}` : ''}</div>
        <div><strong>Fecha:</strong> ${new Date(receta.creado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
      </div>

      ${incluirSignosVitales ? bloqueSignosVitales(signosVitales) : ''}

      <div class="rp">Rp.</div>
      ${filas}

      ${receta.indicaciones_generales ? `<div class="indicaciones-generales"><strong>Indicaciones generales:</strong> ${receta.indicaciones_generales}</div>` : ''}

      <div class="firma">
        <div class="firma-linea"></div>
        <div class="firma-texto">
          ${profesional.nombre}
          ${profesional.cedula ? `<br/>Céd. Prof. ${profesional.cedula}` : ''}
        </div>
      </div>

      <script>window.print()</script>
    </body>
    </html>
  `

  abrirVentanaImpresion(html)
}
