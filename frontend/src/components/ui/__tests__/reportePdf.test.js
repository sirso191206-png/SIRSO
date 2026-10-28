// Reporte del tablero en PDF: contenido, permisos de finanzas y escape de los textos (descripción de tratamientos).
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../lib/supabase', () => ({ supabase: {} }))
import { armarReporte, barrasSvg } from '../../dashboard/imprimirReporte'
import { documentoConPolitica } from '../../../lib/imprimir'

const series = {
  ingresosPorMes: [{ mes: 'Sep', ingresos: 1500 }, { mes: 'Oct', ingresos: 2500.5 }],
  citasPorSemana: [{ semana: '06/10', completadas: 3, canceladas: 1, pendientes: 2 }],
  citasDelMes: [{ estado: 'Completadas', valor: 3, porcentaje: 60 }, { estado: 'Canceladas', valor: 2, porcentaje: 40 }],
  tratamientosMasRealizados: [{ descripcion: '<img src=x onerror=alert(1)>Resina', cantidad: 4 }],
  pacientesNuevosPorMes: [{ mes: 'Sep', pacientes: 2 }, { mes: 'Oct', pacientes: 5 }]
}
const clinica = { nombre: 'Clínica Sonrisa', logo_url: 'https://x.supabase.co/logo.png' }

describe('reporte en PDF del tablero', () => {
  it('incluye clínica, filtros, resumen y las cinco secciones', () => {
    const doc = String(armarReporte({ clinica, series, filtrosTexto: ['Últimos 6 meses'], puedeVerFinanzas: true, generadoPor: 'Ana' }))
    for (const t of ['Clínica Sonrisa', 'Últimos 6 meses', 'por Ana', 'Ingresos por mes', 'Citas por semana', 'Citas del mes por estado', 'Tratamientos más realizados', 'Pacientes nuevos por mes'])
      expect(doc).toContain(t)
    expect(doc).toContain('$4,000.50') // ingresos netos del periodo
    expect(doc).toContain('3 (60%)')
    expect(doc).toContain('<img src="https://x.supabase.co/logo.png"')
  })

  it('sin permiso de finanzas no aparece ningún ingreso', () => {
    const doc = String(armarReporte({ clinica, series, puedeVerFinanzas: false }))
    expect(doc).not.toContain('Ingresos')
    expect(doc).not.toContain('1500')
    expect(doc).not.toContain('$')
  })

  it('escapa los textos y pasa la política de la ventana de impresión', () => {
    const doc = documentoConPolitica(armarReporte({ clinica: { nombre: '<b>x</b>', logo_url: 'javascript:alert(1)' }, series, puedeVerFinanzas: true }), 'a'.repeat(32))
    expect(doc).not.toMatch(/<img src=x/i)
    expect(doc).not.toContain('<b>x</b>')
    expect(doc).not.toContain('javascript:')
    expect(doc).toContain(`<script nonce="${'a'.repeat(32)}">`)
  })

  it('sin datos muestra un aviso en vez de una gráfica vacía', () => {
    expect(String(barrasSvg([], { etiqueta: String, valor: Number }))).toContain('Sin datos')
    const svg = String(barrasSvg([{ e: 'A', v: 0 }, { e: 'B', v: 10 }], { etiqueta: (f) => f.e, valor: (f) => f.v }))
    expect(svg).toContain('width="0.0"')
    expect(svg).toContain('width="360.0"')
  })
})
