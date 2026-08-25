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
    rfc: receta.rfc_snapshot ?? receta.dentista?.rfc ?? null,
    cedula: receta.cedula_profesional_snapshot ?? receta.dentista?.cedula_profesional ?? null,
    escuela: receta.escuela_snapshot ?? receta.dentista?.escuela_procedencia ?? null,
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
 * Genera el bloque HTML del encabezado médico — clínica (si se pasa)
 * + nombre del médico + datos profesionales, cada uno en su propia
 * línea, en el orden pedido (Clínica → Médico → Cédula → RFC →
 * Universidad), omitiendo por completo cualquier campo vacío (nunca
 * una línea en blanco ni "No disponible").
 */
export function renderEncabezadoMedico(profesional, datosClinicaHtml = '') {
  return `
    <div class="encabezado-medico">
      ${datosClinicaHtml}
      <div class="encabezado-medico-nombre">${profesional.nombre}</div>
      ${profesional.cedula ? `<div class="encabezado-medico-dato">Cédula profesional: ${profesional.cedula}</div>` : ''}
      ${profesional.rfc ? `<div class="encabezado-medico-dato">RFC: ${profesional.rfc}</div>` : ''}
      ${profesional.escuela ? `<div class="encabezado-medico-dato">${profesional.escuela}</div>` : ''}
    </div>
  `
}

/**
 * Un campo de formulario "de recetario" — etiqueta pequeña arriba,
 * valor abajo, con una línea inferior (como si fuera un renglón para
 * llenar a mano). Se usa para Paciente / Fecha / Edad / Sexo / etc.
 */
function campoFormulario(etiqueta, valor) {
  return `
    <div class="campo">
      <div class="campo-valor">${valor || '&nbsp;'}</div>
      <div class="campo-etiqueta">${etiqueta}</div>
    </div>
  `
}

export async function imprimirReceta({ receta, paciente, clinicaId, incluirSignosVitales = true }) {
  const [{ data: clinica }, signosVitalesLista] = await Promise.all([
    supabase.from('clinicas').select('nombre, direccion, telefono, logo_url').eq('id', clinicaId).single(),
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
        @page { size: letter portrait; margin: 0; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111827; }

        /* La receta vive en un bloque fijo de 5.5in — exactamente la
           mitad de una hoja carta (11in) — con una línea punteada al
           final marcando dónde cortar. Todo lo que sigue después del
           corte (la mitad inferior de la hoja) queda en blanco. */
        .hoja-media-carta {
          width: 8.5in;
          height: 5.5in;
          padding: 1mm 16mm 7mm;
          border-bottom: 1.5px dashed #9CA3AF;
          position: relative;
          font-size: 16px;
        }
        .guia-corte {
          position: absolute;
          bottom: -8px;
          right: 16mm;
          font-size: 9px;
          color: #9CA3AF;
          background: #fff;
          padding: 0 4px;
        }

        .encabezado {
          position: relative;
          text-align: center;
          padding: 4px 60px 10px;
        }
        .logo-clinica { position: absolute; top: 0; left: 0; }
        .logo-clinica img { max-height: 60px; max-width: 120px; object-fit: contain; }
        .folio { position: absolute; top: 0; right: 0; font-size: 13px; font-style: italic; color: #374151; }
        .clinica-datos-nombre { font-size: 20px; font-weight: 700; }
        .encabezado-medico-nombre { font-size: 19px; font-weight: 700; margin-top: 4px; }
        .encabezado-medico-dato { font-size: 13px; line-height: 1.55; color: #374151; }
        .clinica-datos { font-size: 13px; line-height: 1.55; color: #374151; }

        .doble-linea { border-top: 1.5px solid #111827; border-bottom: 1.5px solid #111827; height: 3px; margin: 8px 0 14px; }

        h1 { color: #111827; font-size: 13px; font-weight: 700; text-align: center; margin: 0 0 14px; text-transform: uppercase; letter-spacing: 0.04em; }

        .campo-fila { display: flex; gap: 28px; margin-bottom: 12px; }
        .campo { flex: 1; }
        .campo-valor { font-size: 15px; padding-bottom: 3px; border-bottom: 1.5px solid #111827; min-height: 19px; }
        .campo-etiqueta { font-size: 9.5px; letter-spacing: 0.05em; text-transform: uppercase; color: #374151; margin-top: 3px; text-align: center; }
        .campo-fila .campo:first-child { flex: 2; }

        .rp { font-size: 22px; font-weight: 800; margin: 8px 0 10px; }
        .medicamento { margin-bottom: 10px; padding-left: 12px; border-left: 3px solid #D1D5DB; }
        .medicamento-nombre { font-weight: 700; font-size: 15px; }
        .medicamento-detalle { font-size: 12.5px; color: #374151; margin-top: 2px; }
        .medicamento-indicaciones { font-size: 12.5px; color: #4B5563; font-style: italic; margin-top: 3px; }
        .indicaciones-generales { margin-top: 10px; font-size: 12.5px; color: #374151; }
        .signos-vitales { margin-top: 10px; padding: 8px 12px; border: 1.5px solid #D1D5DB; border-radius: 6px; }
        .signos-vitales-titulo { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
        .signos-vitales-fila { font-size: 12.5px; color: #374151; }
        .firma { margin-top: 24mm; text-align: center; }
        .firma-linea { border-top: 1.5px solid #111827; width: 220px; margin: 0 auto 5px; }
        .firma-texto { font-size: 12.5px; color: #374151; }
      </style>
    </head>
    <body>
      <div class="hoja-media-carta">
      <div class="encabezado">
        ${clinica?.logo_url ? `<div class="logo-clinica"><img src="${clinica.logo_url}" alt="" /></div>` : ''}
        ${receta.folio ? `<div class="folio">Folio ${receta.folio}</div>` : ''}

        ${renderEncabezadoMedico(
          profesional,
          (clinica?.nombre || clinica?.direccion || clinica?.telefono)
            ? `<div class="clinica-datos">${clinica?.nombre ? `<div class="clinica-datos-nombre">${clinica.nombre}</div>` : ''}${clinica?.direccion || clinica?.telefono ? `<div>${[clinica?.direccion, clinica?.telefono].filter(Boolean).join(' · ')}</div>` : ''}</div>`
            : ''
        )}
      </div>

      <div class="doble-linea"></div>

      <h1>Receta médica / odontológica</h1>

      <div class="campo-fila">
        ${campoFormulario('Nombre del paciente', paciente.nombre_completo)}
        ${campoFormulario('Fecha', new Date(receta.creado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }))}
      </div>
      <div class="campo-fila">
        ${campoFormulario('Edad', edad !== null ? `${edad} años` : '')}
        ${campoFormulario('Sexo', paciente.sexo ? (NOMBRE_SEXO[paciente.sexo] ?? paciente.sexo) : '')}
        ${paciente.numero_expediente ? campoFormulario('Expediente', paciente.numero_expediente) : ''}
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
      <div class="guia-corte">✂ cortar aquí</div>
      </div>

      <script>
        // window.print() no debe llamarse de inmediato: si hay logo,
        // la imagen aún puede estar descargándose desde Supabase Storage
        // y se imprimiría en blanco. 'load' sí espera a que todas las
        // imágenes terminen de cargar (o fallen) antes de disparar.
        window.addEventListener('load', function () {
          setTimeout(function () { window.print() }, 150)
        })
      </script>
    </body>
    </html>
  `

  abrirVentanaImpresion(html)
}
