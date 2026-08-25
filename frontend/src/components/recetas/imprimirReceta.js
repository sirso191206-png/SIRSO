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
    (sv.presion_sistolica && sv.presion_diastolica)
      ? `Presión arterial: ${sv.presion_sistolica}/${sv.presion_diastolica} mmHg`
      : (sv.presion_arterial ? `Presión arterial: ${sv.presion_arterial}` : null),

    sv.frecuencia_cardiaca
      ? `Frecuencia cardiaca: ${sv.frecuencia_cardiaca} lpm`
      : null,

    sv.frecuencia_respiratoria
      ? `Frecuencia respiratoria: ${sv.frecuencia_respiratoria} rpm`
      : null,

    sv.temperatura
      ? `Temperatura: ${sv.temperatura} °C`
      : null,

    sv.saturacion_oxigeno
      ? `SpO₂: ${sv.saturacion_oxigeno} %`
      : null,

    sv.peso
      ? `Peso: ${sv.peso} kg`
      : null,

    sv.estatura
      ? `Talla: ${sv.estatura} m`
      : null,
  ].filter(Boolean)

  if (filas.length === 0) return ''

  return `
    <div class="signos-vitales">
      <div class="signos-vitales-titulo">Signos vitales</div>
      ${filas.map((f) => `<div class="signos-vitales-fila">${f}</div>`).join('')}
    </div>
  `
}

/**
 * Genera el bloque HTML del encabezado médico
 */
export function renderEncabezadoMedico(profesional, datosClinicaHtml = '') {
  return `
    <div class="encabezado-medico">
      ${datosClinicaHtml}

      <div class="encabezado-medico-nombre">
        ${profesional.nombre}
      </div>

      ${profesional.cedula
        ? `<div class="encabezado-medico-dato">
            Cédula profesional: ${profesional.cedula}
          </div>`
        : ''}

      ${profesional.rfc
        ? `<div class="encabezado-medico-dato">
            RFC: ${profesional.rfc}
          </div>`
        : ''}

      ${profesional.escuela
        ? `<div class="encabezado-medico-dato">
            ${profesional.escuela}
          </div>`
        : ''}
    </div>
  `
}

/**
 * Campo tipo recetario
 */
function campoFormulario(etiqueta, valor) {
  return `
    <div class="campo">
      <div class="campo-valor">${valor || '&nbsp;'}</div>
      <div class="campo-etiqueta">${etiqueta}</div>
    </div>
  `
}

export async function imprimirReceta({
  receta,
  paciente,
  clinicaId,
  incluirSignosVitales = true
}) {

  const [{ data: clinica }, signosVitalesLista] = await Promise.all([
    supabase
      .from('clinicas')
      .select('nombre, direccion, telefono, logo_url')
      .eq('id', clinicaId)
      .single(),

    incluirSignosVitales
      ? obtenerSignosVitales(paciente.id)
      : Promise.resolve([])
  ])

  // Signos vitales más recientes
  const signosVitales = signosVitalesLista[0] ?? null

  const profesional = datosProfesionalParaImprimir(receta)

  /*
   * MEDICAMENTOS
   */
  const filas = (receta.medicamentos ?? []).map((m) => `
    <div class="medicamento">

      <div class="medicamento-nombre">
        ${m.medicamento}${m.presentacion ? ` — ${m.presentacion}` : ''}
      </div>

      <div class="medicamento-detalle">
        ${
          [
            m.dosis && `Dosis: ${m.dosis}`,
            m.via && `Vía: ${m.via}`,
            m.frecuencia && `Frecuencia: ${m.frecuencia}`,
            m.duracion && `Duración: ${m.duracion}`
          ]
            .filter(Boolean)
            .join(' · ')
        }
      </div>

      ${
        m.indicaciones
          ? `<div class="medicamento-indicaciones">
              ${m.indicaciones}
            </div>`
          : ''
      }

    </div>
  `).join('')

  const edad = calcularEdad(paciente.fecha_nacimiento)

  const html = `
    <!doctype html>

    <html lang="es">

    <head>

      <meta charset="utf-8" />

      <title>
        Receta — ${paciente.nombre_completo}
      </title>

      <style>

        /*
         * ==========================================================
         * CONFIGURACIÓN DE IMPRESIÓN
         * ==========================================================
         */

        @page {
          size: letter portrait;
          margin: 0;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          padding: 0;
          width: 8.5in;
          min-height: 11in;
        }

        body {
          font-family: Arial, Helvetica, sans-serif;
          color: #111827;
          background: white;
        }


        /*
         * ==========================================================
         * MEDIA CARTA
         * ==========================================================
         *
         * La receta ocupa EXACTAMENTE la mitad superior
         * de una hoja carta.
         *
         * 8.5in × 5.5in
         */

        .hoja-media-carta {

          width: 8.5in;
          height: 5.5in;

          padding: 3mm 16mm 5mm;

          position: relative;

          display: flex;
          flex-direction: column;

          font-size: 16px;

          overflow: hidden;

          border-bottom: 1.5px dashed #9CA3AF;
        }


        /*
         * ==========================================================
         * ENCABEZADO
         * ==========================================================
         */

        .encabezado {

          position: relative;

          text-align: center;

          padding: 2px 60px 7px;

          flex-shrink: 0;
        }


        .logo-clinica {

          position: absolute;

          top: 0;
          left: 0;
        }


        .logo-clinica img {

          max-height: 54px;
          max-width: 115px;

          object-fit: contain;
        }


        .folio {

          position: absolute;

          top: 0;
          right: 0;

          font-size: 12px;

          font-style: italic;

          color: #374151;
        }


        .clinica-datos-nombre {

          font-size: 18px;

          font-weight: 700;
        }


        .encabezado-medico-nombre {

          font-size: 17px;

          font-weight: 700;

          margin-top: 3px;
        }


        .encabezado-medico-dato {

          font-size: 11.5px;

          line-height: 1.35;

          color: #374151;
        }


        .clinica-datos {

          font-size: 11.5px;

          line-height: 1.35;

          color: #374151;
        }


        /*
         * ==========================================================
         * LÍNEAS DEL ENCABEZADO
         * ==========================================================
         */

        .doble-linea {

          border-top: 1.5px solid #111827;

          border-bottom: 1.5px solid #111827;

          height: 3px;

          margin: 6px 0 9px;

          flex-shrink: 0;
        }


        /*
         * ==========================================================
         * TÍTULO
         * ==========================================================
         */

        h1 {

          color: #111827;

          font-size: 12px;

          font-weight: 700;

          text-align: center;

          margin: 0 0 9px;

          text-transform: uppercase;

          letter-spacing: 0.04em;

          flex-shrink: 0;
        }


        /*
         * ==========================================================
         * DATOS DEL PACIENTE
         * ==========================================================
         */

        .campo-fila {

          display: flex;

          gap: 24px;

          margin-bottom: 8px;

          flex-shrink: 0;
        }


        .campo {

          flex: 1;

          min-width: 0;
        }


        .campo-valor {

          font-size: 13.5px;

          padding-bottom: 2px;

          border-bottom: 1.5px solid #111827;

          min-height: 18px;

          white-space: nowrap;

          overflow: hidden;

          text-overflow: ellipsis;
        }


        .campo-etiqueta {

          font-size: 8.5px;

          letter-spacing: 0.05em;

          text-transform: uppercase;

          color: #374151;

          margin-top: 2px;

          text-align: center;
        }


        .campo-fila .campo:first-child {

          flex: 2;
        }


        /*
         * ==========================================================
         * ZONA DE RECETA
         * ==========================================================
         */

        .contenido-receta {

          flex: 1;

          min-height: 0;

          display: flex;

          flex-direction: column;

          overflow: hidden;
        }


        /*
         * ==========================================================
         * RP
         * ==========================================================
         */

        .rp {

          font-size: 20px;

          font-weight: 800;

          margin: 3px 0 7px;

          flex-shrink: 0;
        }


        /*
         * ==========================================================
         * MEDICAMENTOS
         * ==========================================================
         */

        .medicamentos {

          flex-shrink: 0;
        }


        .medicamento {

          margin-bottom: 8px;

          padding-left: 10px;

          border-left: 3px solid #D1D5DB;
        }


        .medicamento:last-child {

          margin-bottom: 0;
        }


        .medicamento-nombre {

          font-weight: 700;

          font-size: 13.5px;

          line-height: 1.25;
        }


        .medicamento-detalle {

          font-size: 11.5px;

          color: #374151;

          margin-top: 2px;

          line-height: 1.25;
        }


        .medicamento-indicaciones {

          font-size: 11.5px;

          color: #4B5563;

          font-style: italic;

          margin-top: 2px;

          line-height: 1.25;
        }


        /*
         * ==========================================================
         * INDICACIONES GENERALES
         * ==========================================================
         */

        .indicaciones-generales {

          margin-top: 7px;

          font-size: 11.5px;

          color: #374151;

          line-height: 1.3;

          flex-shrink: 0;
        }


        /*
         * ==========================================================
         * SIGNOS VITALES
         * ==========================================================
         */

        .signos-vitales {

          margin-top: 7px;

          padding: 6px 10px;

          border: 1.5px solid #D1D5DB;

          border-radius: 6px;

          flex-shrink: 0;
        }


        .signos-vitales-titulo {

          font-size: 11px;

          font-weight: 700;

          text-transform: uppercase;

          letter-spacing: 0.04em;

          margin-bottom: 3px;
        }


        .signos-vitales-fila {

          font-size: 11px;

          color: #374151;

          line-height: 1.2;
        }


        /*
         * ==========================================================
         * FIRMA
         * ==========================================================
         *
         * IMPORTANTE:
         * La firma ya NO utiliza margin-top: 24mm.
         *
         * Se coloca automáticamente hacia la parte inferior
         * disponible de la media hoja.
         */

        .firma {

          margin-top: auto;

          padding-top: 10px;

          text-align: center;

          flex-shrink: 0;
        }


        .firma-linea {

          border-top: 1.5px solid #111827;

          width: 210px;

          margin: 0 auto 4px;
        }


        .firma-texto {

          font-size: 11.5px;

          line-height: 1.25;

          color: #374151;
        }


        /*
         * ==========================================================
         * GUÍA DE CORTE
         * ==========================================================
         */

        .guia-corte {

          position: absolute;

          bottom: -7px;

          right: 16mm;

          font-size: 8px;

          color: #9CA3AF;

          background: #fff;

          padding: 0 4px;
        }


        /*
         * ==========================================================
         * IMPRESIÓN
         * ==========================================================
         */

        @media print {

          html,
          body {

            width: 8.5in;

            height: 11in;

            margin: 0;

            padding: 0;
          }


          .hoja-media-carta {

            width: 8.5in;

            height: 5.5in;

            page-break-after: avoid;

            break-after: avoid;
          }
        }

      </style>

    </head>


    <body>

      <div class="hoja-media-carta">


        <!-- =====================================================
             ENCABEZADO
             ===================================================== -->

        <div class="encabezado">

          ${
            clinica?.logo_url
              ? `
                <div class="logo-clinica">
                  <img
                    src="${clinica.logo_url}"
                    alt=""
                  />
                </div>
              `
              : ''
          }


          ${
            receta.folio
              ? `
                <div class="folio">
                  Folio ${receta.folio}
                </div>
              `
              : ''
          }


          ${renderEncabezadoMedico(
            profesional,

            (
              clinica?.nombre ||
              clinica?.direccion ||
              clinica?.telefono
            )

              ? `
                <div class="clinica-datos">

                  ${
                    clinica?.nombre
                      ? `
                        <div class="clinica-datos-nombre">
                          ${clinica.nombre}
                        </div>
                      `
                      : ''
                  }

                  ${
                    clinica?.direccion ||
                    clinica?.telefono

                      ? `
                        <div>
                          ${
                            [
                              clinica?.direccion,
                              clinica?.telefono
                            ]
                              .filter(Boolean)
                              .join(' · ')
                          }
                        </div>
                      `
                      : ''
                  }

                </div>
              `

              : ''
          )}

        </div>


        <!-- =====================================================
             SEPARADOR
             ===================================================== -->

        <div class="doble-linea"></div>


        <!-- =====================================================
             TÍTULO
             ===================================================== -->

        <h1>
          Receta médica / odontológica
        </h1>


        <!-- =====================================================
             DATOS DEL PACIENTE
             ===================================================== -->

        <div class="campo-fila">

          ${campoFormulario(
            'Nombre del paciente',
            paciente.nombre_completo
          )}

          ${campoFormulario(
            'Fecha',
            new Date(receta.creado_en).toLocaleDateString(
              'es-MX',
              {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              }
            )
          )}

        </div>


        <div class="campo-fila">

          ${campoFormulario(
            'Edad',
            edad !== null
              ? `${edad} años`
              : ''
          )}


          ${campoFormulario(
            'Sexo',
            paciente.sexo
              ? (
                  NOMBRE_SEXO[paciente.sexo]
                  ?? paciente.sexo
                )
              : ''
          )}


          ${
            paciente.numero_expediente
              ? campoFormulario(
                  'Expediente',
                  paciente.numero_expediente
                )
              : ''
          }

        </div>


        <!-- =====================================================
             CONTENIDO PRINCIPAL
             ===================================================== -->

        <div class="contenido-receta">


          ${
            incluirSignosVitales
              ? bloqueSignosVitales(signosVitales)
              : ''
          }


          <div class="rp">
            Rp.
          </div>


          <div class="medicamentos">

            ${filas}

          </div>


          ${
            receta.indicaciones_generales

              ? `
                <div class="indicaciones-generales">

                  <strong>
                    Indicaciones generales:
                  </strong>

                  ${receta.indicaciones_generales}

                </div>
              `

              : ''
          }


        </div>


        <!-- =====================================================
             FIRMA
             ===================================================== -->

        <div class="firma">

          <div class="firma-linea"></div>

          <div class="firma-texto">

            ${profesional.nombre}

            ${
              profesional.cedula
                ? `
                  <br />
                  Céd. Prof. ${profesional.cedula}
                `
                : ''
            }

          </div>

        </div>


        <!-- =====================================================
             GUÍA DE CORTE
             ===================================================== -->

        <div class="guia-corte">
          ✂ cortar aquí
        </div>


      </div>


      <script>

        /*
         * Esperamos a que el logo termine de cargar antes
         * de abrir la ventana de impresión.
         */

        window.addEventListener('load', function () {

          setTimeout(function () {

            window.print()

          }, 150)

        })

      </script>


    </body>

    </html>
  `

  abrirVentanaImpresion(html)
}
