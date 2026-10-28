import { supabase } from '../../lib/supabase'
import { abrirVentanaImpresion, html, urlImagenSegura } from '../../lib/imprimir'
import { EXPORTACIONES } from '../../lib/reportes'

// Reporte del tablero en un solo documento (Imprimir → «Guardar como PDF»): logo y nombre de la clínica, filtros
// aplicados, un resumen y cada gráfica como barras SVG + su tabla. Solo datos agregados; sin datos de pacientes.

const moneda = (n) => `$${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const suma = (filas, f) => filas.reduce((a, x) => a + Number(f(x) || 0), 0)

// Barras horizontales: una fila por dato, escala al máximo. Todo texto pasa por la plantilla html (escapado).
export function barrasSvg(filas, { etiqueta, valor, formato = String, color = '#1E5F8C' }) {
  if (!filas.length) return html`<p class="vacio">Sin datos en el periodo.</p>`
  const max = Math.max(...filas.map((f) => Number(valor(f)) || 0), 1)
  const alto = 20
  const anchoBarra = 360
  return html`<svg class="grafica" viewBox="0 0 640 ${filas.length * alto + 4}" width="100%" role="img">
    ${filas.map((f, i) => {
      const v = Number(valor(f)) || 0
      const y = i * alto + 2
      return html`<text x="150" y="${y + 14}" text-anchor="end" font-size="11" fill="#475569">${String(etiqueta(f)).slice(0, 26)}</text>
      <rect x="158" y="${y + 3}" width="${Math.max((v / max) * anchoBarra, v > 0 ? 2 : 0).toFixed(1)}" height="${alto - 7}" rx="3" fill="${color}"/>
      <text x="${(158 + (v / max) * anchoBarra + 6).toFixed(1)}" y="${y + 14}" font-size="11" fill="#1E293B">${formato(v)}</text>`
    })}
  </svg>`
}

function tabla(clave, filas) {
  const { columnas } = EXPORTACIONES[clave]
  if (!filas.length) return ''
  return html`<table>
    <thead><tr>${columnas.map((c) => html`<th>${c.titulo}</th>`)}</tr></thead>
    <tbody>${filas.map((f) => html`<tr>${columnas.map((c) => html`<td>${c.valor(f)}</td>`)}</tr>`)}</tbody>
  </table>`
}

const seccion = (titulo, grafica, cuadro) => html`<section><h2>${titulo}</h2>${grafica}${cuadro}</section>`

// Puro (sin red) para poder probarlo: recibe la clínica ya leída.
export function armarReporte({ clinica, series, filtrosTexto = [], puedeVerFinanzas, generadoPor = '', ahora = new Date() }) {
  const ingresos = puedeVerFinanzas ? series.ingresosPorMes ?? [] : []
  const semanas = series.citasPorSemana ?? []
  const delMes = series.citasDelMes ?? []
  const tratamientos = series.tratamientosMasRealizados ?? []
  const nuevos = series.pacientesNuevosPorMes ?? []
  const completadas = delMes.find((d) => /complet/i.test(d.estado))

  const resumen = [
    puedeVerFinanzas && ['Ingresos netos del periodo', moneda(suma(ingresos, (f) => f.ingresos))],
    ['Citas en las semanas mostradas', suma(semanas, (f) => f.completadas + f.canceladas + f.pendientes)],
    ['Citas completadas este mes', completadas ? `${completadas.valor} (${completadas.porcentaje}%)` : '0'],
    ['Pacientes nuevos del periodo', suma(nuevos, (f) => f.pacientes)]
  ].filter(Boolean)

  const logo = urlImagenSegura(clinica?.logo_url)
  return html`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Reporte — ${clinica?.nombre ?? 'Clínica'}</title>
  <style>
    @page { size: letter portrait; margin: 14mm; }
    body { font-family: system-ui, sans-serif; color: #1E293B; max-width: 760px; margin: 0 auto; padding: 24px; font-size: 12px; }
    header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #E2E8F0; padding-bottom: 12px; }
    header img { max-height: 56px; max-width: 120px; object-fit: contain; }
    h1 { color: #1E5F8C; font-size: 20px; margin: 0; }
    .sub { color: #64748B; font-size: 11px; margin-top: 2px; }
    .filtros { color: #475569; font-size: 11px; margin: 10px 0 0; }
    .resumen { display: grid; grid-template-columns: repeat(${resumen.length}, 1fr); gap: 8px; margin: 16px 0; }
    .kpi { border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px 10px; }
    .kpi b { display: block; font-size: 16px; color: #1E5F8C; }
    .kpi span { font-size: 10px; color: #64748B; }
    section { page-break-inside: avoid; margin-top: 18px; }
    h2 { font-size: 14px; color: #1E5F8C; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px; }
    .grafica { margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #F1F5F9; font-size: 11px; }
    th { color: #64748B; background: #F8FAFC; }
    .vacio { color: #94A3B8; font-style: italic; }
    footer { margin-top: 28px; font-size: 10px; color: #94A3B8; text-align: center; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <header>
    ${logo ? html`<img src="${logo}" alt="" />` : ''}
    <div>
      <h1>${clinica?.nombre ?? 'Clínica'}</h1>
      <div class="sub">Reporte de actividad · generado el ${ahora.toLocaleString('es-MX')}${generadoPor ? html` por ${generadoPor}` : ''}</div>
    </div>
  </header>
  ${filtrosTexto.length ? html`<p class="filtros"><strong>Filtros:</strong> ${filtrosTexto.join(' · ')}</p>` : ''}

  <div class="resumen">${resumen.map(([t, v]) => html`<div class="kpi"><b>${v}</b><span>${t}</span></div>`)}</div>

  ${puedeVerFinanzas ? seccion('Ingresos por mes', barrasSvg(ingresos, { etiqueta: (f) => f.mes, valor: (f) => f.ingresos, formato: moneda }), tabla('ingresos', ingresos)) : ''}
  ${seccion('Citas por semana', barrasSvg(semanas, { etiqueta: (f) => f.semana, valor: (f) => f.completadas + f.canceladas + f.pendientes, color: '#22C55E' }), tabla('citasPorSemana', semanas))}
  ${seccion('Citas del mes por estado', barrasSvg(delMes, { etiqueta: (f) => f.estado, valor: (f) => f.valor, color: '#64748B' }), tabla('citasDelMes', delMes))}
  ${seccion('Tratamientos más realizados', barrasSvg(tratamientos, { etiqueta: (f) => f.descripcion, valor: (f) => f.cantidad, color: '#7C3AED' }), tabla('tratamientos', tratamientos))}
  ${seccion('Pacientes nuevos por mes', barrasSvg(nuevos, { etiqueta: (f) => f.mes, valor: (f) => f.pacientes, color: '#0EA5E9' }), tabla('pacientesNuevos', nuevos))}

  <footer>Generado con SIRO. Datos agregados de la clínica; no incluye datos personales de pacientes.</footer>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 150) })</script>
</body>
</html>`
}

export async function imprimirReporte({ clinicaId, ...resto }) {
  const { data: clinica } = await supabase.from('clinicas').select('nombre, logo_url').eq('id', clinicaId).single()
  abrirVentanaImpresion(armarReporte({ clinica, ...resto }))
}
