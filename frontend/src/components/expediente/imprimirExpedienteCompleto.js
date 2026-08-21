import { supabase } from '../../lib/supabase'
import { abrirVentanaImpresion } from '../../lib/imprimir'
import { calcularEdad } from '../../lib/fechas'
import { obtenerExpediente, obtenerNotasClinicas } from '../../services/expedientes'
import { obtenerOdontogramaCompleto } from '../../services/odontograma'
import { obtenerTratamientos } from '../../services/tratamientos'
import { obtenerConsentimientos } from '../../services/consentimientos'
import { obtenerSignosVitales } from '../../services/signosVitales'

const NOMBRE_SEXO = { M: 'Masculino', F: 'Femenino', X: 'Otro' }
const NOMBRE_ESTADO_TRATAMIENTO = { planeado: 'Planeado', en_progreso: 'En progreso', completado: 'Completado', cancelado: 'Cancelado' }
const NOMBRE_HABITO = { no: 'No', ocasional: 'Ocasional', frecuente: 'Frecuente' }

// Mismos colores que usa el odontograma en pantalla (constantesOdontograma.js)
// — a propósito duplicados aquí y no importados: ese archivo exporta también
// helpers de React/SVG que no aplican en un documento HTML plano de impresión.
const COLOR_CARA = {
  sano: '#F1F5F9', caries: '#FCA5A5', obturado: '#93C5FD',
  fracturado: '#FDBA74', en_tratamiento: '#67E8F9',
}
const COLOR_PIEZA_COMPLETA = {
  ausente: '#E2E8F0', corona: '#FCD34D', implante: '#C4B5FD',
  endodoncia: '#FECACA', en_tratamiento: '#67E8F9',
}
const ETIQUETA_ESTADO_PIEZA = {
  ausente: 'Ausente', corona: 'Corona', implante: 'Implante',
  endodoncia: 'Endodoncia', en_tratamiento: 'En tratamiento',
}
const FILA_SUPERIOR = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
const FILA_INFERIOR = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']

function fecha(iso, conHora = false) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric',
    ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

function listaOTexto(valor) {
  if (!valor) return null
  if (Array.isArray(valor)) {
    if (valor.length === 0) return null
    return valor
      .map((v) => {
        if (typeof v === 'string') return v
        const nombre = v.nombre || v.enfermedad || JSON.stringify(v)
        const detalle = [
          v.desde_cuando && `desde ${v.desde_cuando}`,
          v.controlada && (v.controlada === 'controlada' ? 'controlada' : 'no controlada'),
          v.medicacion && `medicación: ${v.medicacion}`,
        ].filter(Boolean).join(', ')
        return detalle ? `${nombre} (${detalle})` : nombre
      })
      .join('; ')
  }
  return String(valor).trim() || null
}

// -------- Odontograma: una pieza como SVG (diamante de 5 caras, o
// sello completo si el estado aplica a todo el diente) --------
function svgPieza(pieza) {
  const numero = pieza.numero_pieza
  const caras = pieza.caras || []
  const porCara = Object.fromEntries(caras.map((c) => [c.cara, c.estado]))

  if (pieza.estado && pieza.estado !== 'sano') {
    const color = COLOR_PIEZA_COMPLETA[pieza.estado] || '#F1F5F9'
    const etiqueta = ETIQUETA_ESTADO_PIEZA[pieza.estado] || pieza.estado
    return `
      <div class="diente" title="Pieza ${numero} — ${etiqueta}">
        <svg viewBox="0 0 40 40" width="30" height="30">
          <rect x="2" y="2" width="36" height="36" rx="4" fill="${color}" stroke="#94A3B8" stroke-width="1.5"/>
          ${pieza.estado === 'ausente' ? '<line x1="6" y1="6" x2="34" y2="34" stroke="#94A3B8" stroke-width="2"/><line x1="34" y1="6" x2="6" y2="34" stroke="#94A3B8" stroke-width="2"/>' : ''}
        </svg>
        <div class="diente-num">${numero}</div>
      </div>`
  }

  const c = (nombre) => COLOR_CARA[porCara[nombre]] || COLOR_CARA.sano
  return `
    <div class="diente" title="Pieza ${numero} — sano/por caras">
      <svg viewBox="0 0 40 40" width="30" height="30">
        <rect x="2" y="2" width="36" height="36" fill="#fff" stroke="#94A3B8" stroke-width="1"/>
        <polygon points="20,2 30,12 10,12" fill="${c('vestibular')}" stroke="#CBD5E1"/>
        <polygon points="20,38 30,28 10,28" fill="${c('lingual')}" stroke="#CBD5E1"/>
        <polygon points="2,2 12,12 12,28 2,38" fill="${c('mesial')}" stroke="#CBD5E1"/>
        <polygon points="38,2 28,12 28,28 38,38" fill="${c('distal')}" stroke="#CBD5E1"/>
        <rect x="12" y="12" width="16" height="16" fill="${c('oclusal')}" stroke="#CBD5E1"/>
      </svg>
      <div class="diente-num">${numero}</div>
    </div>`
}

function svgOdontograma(piezas) {
  const porNumero = Object.fromEntries(piezas.map((p) => [p.numero_pieza, p]))
  const fila = (numeros) => numeros.map((n) => (porNumero[n] ? svgPieza(porNumero[n]) : `<div class="diente"></div>`)).join('')
  return `
    <div class="odontograma">
      <div class="fila-dientes">${fila(FILA_SUPERIOR)}</div>
      <div class="fila-dientes">${fila(FILA_INFERIOR)}</div>
      <div class="leyenda">
        ${Object.entries({ ...COLOR_CARA, ...COLOR_PIEZA_COMPLETA }).map(([k, v]) =>
          `<span class="leyenda-item"><span class="leyenda-color" style="background:${v}"></span>${ETIQUETA_ESTADO_PIEZA[k] || k}</span>`
        ).join('')}
      </div>
    </div>`
}

/**
 * Genera y abre para imprimir el expediente clínico completo de un
 * paciente: datos generales, antecedentes, signos vitales, odontograma,
 * evolución (notas clínicas), plan de tratamiento y consentimientos —
 * todo en un solo documento, en ese orden.
 */
export async function imprimirExpedienteCompleto({ paciente, clinicaId }) {
  const [{ data: clinica }, expediente, odontograma, tratamientos, consentimientos, signosVitales] = await Promise.all([
    supabase.from('clinicas').select('nombre, direccion, telefono, responsable_sanitario').eq('id', clinicaId).single(),
    obtenerExpediente(paciente.id),
    obtenerOdontogramaCompleto(paciente.id),
    obtenerTratamientos(paciente.id),
    obtenerConsentimientos(paciente.id),
    obtenerSignosVitales(paciente.id),
  ])
  const notas = await obtenerNotasClinicas(expediente.id)

  const edad = calcularEdad(paciente.fecha_nacimiento)
  const apellidos = [paciente.primer_apellido, paciente.segundo_apellido].filter(Boolean).join(' ')
  const nombreCompleto = paciente.nombre_completo || [paciente.nombre, apellidos].filter(Boolean).join(' ')
  const domicilio = paciente.calle
    ? [
        [paciente.calle, paciente.numero_exterior, paciente.numero_interior && `Int. ${paciente.numero_interior}`].filter(Boolean).join(' '),
        [paciente.colonia, paciente.municipio, paciente.estado_domicilio, paciente.codigo_postal].filter(Boolean).join(', '),
      ].filter(Boolean).join(' — ')
    : paciente.direccion
  const emergencia = paciente.contacto_emergencia || {}

  const filasSignos = signosVitales.length === 0
    ? '<tr><td colspan="6" class="vacio">Sin registros de signos vitales.</td></tr>'
    : signosVitales.map((s) => `
        <tr>
          <td>${fecha(s.creado_en)}</td>
          <td>${s.peso ?? '—'}</td>
          <td>${s.estatura ?? '—'}</td>
          <td>${s.presion_sistolica && s.presion_diastolica ? `${s.presion_sistolica}/${s.presion_diastolica}` : (s.presion_arterial ?? '—')}</td>
          <td>${s.temperatura ?? '—'}</td>
          <td>${s.frecuencia_cardiaca ?? '—'}</td>
        </tr>`).join('')

  const bloqueAntecedente = (titulo, valor) => {
    const texto = listaOTexto(valor)
    return texto ? `<div class="antecedente"><strong>${titulo}:</strong> ${texto}</div>` : ''
  }

  const heredo = (expediente.antecedentes_heredofamiliares || [])
    .map((h) => `${h.parentesco}: ${(h.enfermedades || []).join(', ')}${h.notas ? ` (${h.notas})` : ''}`)
    .join(' · ')

  const bloquesNotas = notas.length === 0
    ? '<p class="vacio">Sin notas clínicas registradas.</p>'
    : notas.map((n) => `
        <div class="nota">
          <div class="nota-cabecera">
            <strong>${fecha(n.creado_en, true)}</strong> — ${n.usuario?.nombre ?? 'Sin registrar'}
            ${n.diagnostico_cie10_codigo ? ` · Diagnóstico: ${n.diagnostico_cie10_codigo}` : ''}
            ${n.editado ? ' <span class="etiqueta-editado">(corregida posteriormente)</span>' : ''}
          </div>
          ${n.hallazgos ? `<div class="nota-campo"><em>Hallazgos:</em> ${n.hallazgos}</div>` : ''}
          <div class="nota-contenido">${n.contenido || ''}</div>
        </div>`).join('')

  const filasTratamientos = tratamientos.length === 0
    ? '<tr><td colspan="6" class="vacio">Sin tratamientos registrados.</td></tr>'
    : tratamientos.map((t) => `
        <tr>
          <td>${t.descripcion}</td>
          <td>${t.pieza_dental ?? '—'}</td>
          <td>${NOMBRE_ESTADO_TRATAMIENTO[t.estado] ?? t.estado}</td>
          <td>${t.dentista?.nombre ?? '—'}</td>
          <td>$${Number(t.costo).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
          <td>${t.completado_en ? fecha(t.completado_en) : fecha(t.creado_en)}</td>
        </tr>`).join('')

  const filasConsentimientos = consentimientos.length === 0
    ? '<tr><td colspan="4" class="vacio">Sin consentimientos registrados.</td></tr>'
    : consentimientos.map((c) => `
        <tr>
          <td>${fecha(c.creado_en)}</td>
          <td>${c.procedimiento}</td>
          <td>${c.dentista?.nombre ?? '—'}</td>
          <td>${c.firma_paciente_png ? 'Firmado digitalmente' : (c.firma_paciente_nombre ? 'Firmado en papel' : 'Sin firmar')}</td>
        </tr>`).join('')

  const html = `
    <!doctype html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Expediente clínico — ${nombreCompleto}</title>
      <style>
        body { font-family: system-ui, sans-serif; color: #1E293B; padding: 40px; max-width: 820px; margin: 0 auto; font-size: 13px; }
        h1 { color: #1E5F8C; font-size: 20px; margin: 0 0 2px; }
        h2 { color: #1E5F8C; font-size: 15px; margin: 26px 0 8px; border-bottom: 2px solid #E2E8F0; padding-bottom: 4px; }
        .clinica-datos { font-size: 11px; color: #64748B; margin-bottom: 20px; }
        .datos-paciente { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px 20px; border-top: 2px solid #E2E8F0; border-bottom: 2px solid #E2E8F0; padding: 12px 0; margin-bottom: 10px; }
        .datos-paciente div { font-size: 12.5px; }
        .antecedente { margin-bottom: 4px; }
        .vacio { color: #94A3B8; font-style: italic; }
        table { width: 100%; border-collapse: collapse; margin-top: 6px; }
        th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #E2E8F0; font-size: 12px; }
        th { color: #64748B; font-weight: 600; background: #F8FAFC; }
        .nota { margin-bottom: 14px; padding-left: 10px; border-left: 3px solid #E2E8F0; }
        .nota-cabecera { font-size: 12px; color: #475569; margin-bottom: 3px; }
        .nota-campo { font-size: 12px; color: #475569; margin-bottom: 2px; }
        .nota-contenido { font-size: 12.5px; white-space: pre-wrap; }
        .etiqueta-editado { color: #D97706; font-size: 11px; }
        .odontograma { margin-top: 10px; }
        .fila-dientes { display: flex; gap: 3px; margin-bottom: 8px; justify-content: center; }
        .diente { display: flex; flex-direction: column; align-items: center; width: 32px; }
        .diente-num { font-size: 9px; color: #64748B; margin-top: 1px; }
        .leyenda { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; font-size: 10.5px; color: #64748B; }
        .leyenda-item { display: flex; align-items: center; gap: 4px; }
        .leyenda-color { width: 10px; height: 10px; display: inline-block; border: 1px solid #CBD5E1; }
        .pie-pagina { margin-top: 40px; font-size: 10px; color: #94A3B8; text-align: center; }
        @media print { body { padding: 0; } h2 { page-break-after: avoid; } .nota { page-break-inside: avoid; } }
      </style>
    </head>
    <body>
      <h1>${clinica?.nombre ?? 'Consultorio'}</h1>
      <div class="clinica-datos">${[clinica?.direccion, clinica?.telefono].filter(Boolean).join(' · ')}${clinica?.responsable_sanitario ? ` · Responsable sanitario: ${clinica.responsable_sanitario}` : ''}</div>

      <h2 style="margin-top:0; border:none;">Expediente clínico completo</h2>
      <div class="datos-paciente">
        <div><strong>Paciente:</strong> ${nombreCompleto}</div>
        <div><strong>Folio:</strong> ${paciente.numero_expediente ?? '—'}</div>
        <div><strong>CURP:</strong> ${paciente.curp ?? '—'}</div>
        <div><strong>Fecha de nacimiento:</strong> ${fecha(paciente.fecha_nacimiento)}</div>
        <div><strong>Edad:</strong> ${edad !== null ? `${edad} años` : '—'}</div>
        <div><strong>Sexo:</strong> ${paciente.sexo ? (NOMBRE_SEXO[paciente.sexo] ?? paciente.sexo) : '—'}</div>
        <div><strong>Teléfono:</strong> ${paciente.telefono ?? '—'}${paciente.whatsapp ? ` · WhatsApp: ${paciente.whatsapp}` : ''}</div>
        <div><strong>Domicilio:</strong> ${domicilio ?? '—'}</div>
        <div><strong>Contacto de emergencia:</strong> ${emergencia.nombre ? `${emergencia.nombre}${emergencia.parentesco ? ` (${emergencia.parentesco})` : ''}${emergencia.telefono ? ` — ${emergencia.telefono}` : ''}` : '—'}</div>
        <div><strong>Fecha de impresión:</strong> ${fecha(new Date().toISOString())}</div>
      </div>

      <h2>Antecedentes</h2>
      ${bloqueAntecedente('Alergias', expediente.alergias)}
      ${bloqueAntecedente('Enfermedades', expediente.enfermedades)}
      ${bloqueAntecedente('Medicamentos actuales', expediente.medicamentos_actuales)}
      ${bloqueAntecedente('Cirugías anteriores', expediente.cirugias_anteriores)}
      ${bloqueAntecedente('Hospitalizaciones', expediente.hospitalizaciones)}
      ${expediente.antecedentes_familiares ? `<div class="antecedente"><strong>Antecedentes familiares:</strong> ${expediente.antecedentes_familiares}</div>` : ''}
      ${heredo ? `<div class="antecedente"><strong>Antecedentes heredofamiliares:</strong> ${heredo}</div>` : ''}
      ${expediente.antecedentes_odontologicos ? `<div class="antecedente"><strong>Antecedentes odontológicos:</strong> ${expediente.antecedentes_odontologicos}</div>` : ''}
      <div class="antecedente">
        <strong>Hábitos:</strong>
        Tabaquismo: ${NOMBRE_HABITO[expediente.tabaquismo] ?? '—'} ·
        Alcohol: ${NOMBRE_HABITO[expediente.consumo_alcohol] ?? '—'} ·
        Bruxismo: ${expediente.bruxismo === true ? 'Sí' : expediente.bruxismo === false ? 'No' : '—'} ·
        Higiene dental: ${expediente.higiene_dental ?? '—'}${expediente.frecuencia_cepillado ? ` (cepillado: ${expediente.frecuencia_cepillado})` : ''}
      </div>

      <h2>Signos vitales</h2>
      <table>
        <thead><tr><th>Fecha</th><th>Peso (kg)</th><th>Talla (cm)</th><th>Presión</th><th>Temp. (°C)</th><th>F. Cardiaca</th></tr></thead>
        <tbody>${filasSignos}</tbody>
      </table>

      <h2>Odontograma</h2>
      ${svgOdontograma(odontograma)}

      <h2>Evolución — notas clínicas</h2>
      ${bloquesNotas}

      <h2>Plan de tratamiento</h2>
      <table>
        <thead><tr><th>Tratamiento</th><th>Pieza</th><th>Estado</th><th>Dentista</th><th>Costo</th><th>Fecha</th></tr></thead>
        <tbody>${filasTratamientos}</tbody>
      </table>

      <h2>Consentimientos informados</h2>
      <table>
        <thead><tr><th>Fecha</th><th>Procedimiento</th><th>Dentista</th><th>Estado de firma</th></tr></thead>
        <tbody>${filasConsentimientos}</tbody>
      </table>

      <div class="pie-pagina">Documento generado por SIRO — expediente clínico de ${nombreCompleto}.</div>
    </body>
    </html>
  `

  abrirVentanaImpresion(html)
}
