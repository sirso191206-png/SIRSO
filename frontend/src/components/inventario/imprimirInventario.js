import { supabase } from '../../lib/supabase'
import { abrirVentanaImpresion, html } from '../../lib/imprimir'
import { ETIQUETA_ESTADO, ETIQUETA_ORIGEN, ETIQUETA_TIPO, estadoStock, formatearCantidad } from '../../lib/inventario'

const COLOR_ESTADO = { agotado: '#B91C1C', bajo: '#B45309', ok: '#15803D' }

// Arma el documento del reporte de inventario (existencias + movimientos del periodo). Separado de la impresión para
// poder probar que todo dato se escapa (lib/imprimir.js).
export function documentoInventario({ clinicaNombre, materiales, movimientos, nombreSucursal, sucursalFiltro, desde, hasta }) {
  const enRiesgo = materiales.filter((m) => estadoStock(m) !== 'ok').length

  const filasMateriales = materiales.map((m) => {
    const estado = estadoStock(m)
    return html`
      <tr>
        <td>${m.nombre}${m.categoria ? html`<div class="sub">${m.categoria}</div>` : ''}</td>
        <td>${nombreSucursal(m.sucursal_id)}</td>
        <td class="num">${formatearCantidad(m.stock)} ${m.unidad}</td>
        <td class="num">${formatearCantidad(m.stock_minimo)}</td>
        <td style="color:${COLOR_ESTADO[estado]};font-weight:600">${ETIQUETA_ESTADO[estado]}</td>
      </tr>
    `
  })

  const filasMovimientos = movimientos.map((v) => html`
    <tr>
      <td>${new Date(v.creado_en).toLocaleString('es-MX')}</td>
      <td>${v.material?.nombre ?? ''}</td>
      <td>${ETIQUETA_TIPO[v.tipo] ?? v.tipo} · ${ETIQUETA_ORIGEN[v.origen] ?? v.origen}</td>
      <td class="num">${Number(v.cantidad) > 0 ? '+' : ''}${formatearCantidad(v.cantidad)}</td>
      <td class="num">${formatearCantidad(v.stock_resultante)}</td>
      <td>${v.motivo ?? ''}</td>
      <td>${v.usuario_nombre ?? ''}</td>
    </tr>
  `)

  return html`
    <!doctype html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Reporte de inventario</title>
      <style>
        body { font-family: system-ui, sans-serif; color: #1E293B; padding: 40px; max-width: 900px; margin: 0 auto; }
        h1 { color: #1E5F8C; font-size: 20px; margin-bottom: 4px; }
        .subtitulo { color: #64748B; font-size: 13px; margin-bottom: 20px; }
        .resumen { font-size: 13px; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { text-align: left; border-bottom: 2px solid #E2E8F0; padding: 6px; font-size: 11px; color: #64748B; }
        td { padding: 6px; border-bottom: 1px solid #F1F5F9; font-size: 12px; vertical-align: top; }
        .num { text-align: right; white-space: nowrap; }
        .sub { color: #94A3B8; font-size: 10px; }
        h2 { font-size: 13px; color: #475569; margin-top: 28px; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>${clinicaNombre ?? 'Consultorio'}</h1>
      <div class="subtitulo">
        Reporte de inventario${sucursalFiltro ? ` · ${sucursalFiltro}` : ''}<br/>
        Generado el ${new Date().toLocaleString('es-MX')}
      </div>
      <div class="resumen">${materiales.length} material(es) · ${enRiesgo} agotado(s) o en su mínimo</div>

      <h2>Existencias</h2>
      <table>
        <thead><tr><th>Material</th><th>Sucursal</th><th class="num">Stock</th><th class="num">Mínimo</th><th>Estado</th></tr></thead>
        <tbody>${filasMateriales}</tbody>
      </table>

      <h2>Movimientos del ${new Date(desde).toLocaleDateString('es-MX')} al ${new Date(hasta).toLocaleDateString('es-MX')}</h2>
      ${movimientos.length === 0 ? html`<p class="sub">Sin movimientos en el periodo.</p>` : html`
        <table>
          <thead><tr><th>Fecha</th><th>Material</th><th>Tipo</th><th class="num">Cantidad</th><th class="num">Stock</th><th>Motivo</th><th>Registró</th></tr></thead>
          <tbody>${filasMovimientos}</tbody>
        </table>`}

      <script>window.print()</script>
    </body>
    </html>
  `
}

export async function imprimirInventario({ clinicaId, ...datos }) {
  const { data: clinica } = await supabase.from('clinicas').select('nombre').eq('id', clinicaId).single()
  abrirVentanaImpresion(documentoInventario({ clinicaNombre: clinica?.nombre, ...datos }))
}
