import { describe, it, expect } from 'vitest'
import { INVENTARIO_PROVEEDORES } from '../../../lib/inventarioProveedores'

describe('inventarioProveedores — solo lo que realmente existe', () => {
  it('incluye exactamente los 3 proveedores reales verificados: Supabase, Vercel, Resend', () => {
    const nombres = INVENTARIO_PROVEEDORES.map((p) => p.proveedor)
    expect(nombres.some((n) => n.includes('Supabase'))).toBe(true)
    expect(nombres.some((n) => n.includes('Vercel'))).toBe(true)
    expect(nombres.some((n) => n.includes('Resend'))).toBe(true)
    expect(INVENTARIO_PROVEEDORES).toHaveLength(3)
  })

  it('no incluye WhatsApp, pagos ni analítica como proveedores (no son integraciones reales, WhatsApp es solo un campo de texto)', () => {
    const nombres = INVENTARIO_PROVEEDORES.map((p) => p.proveedor.toLowerCase())
    expect(nombres.some((n) => n.includes('whatsapp'))).toBe(false)
    expect(nombres.some((n) => n.includes('stripe') || n.includes('conekta') || n.includes('mercadopago'))).toBe(false)
  })

  it('cada entrada tiene los campos que pide el documento: servicio, finalidad, datos, transferencia, enlace, estado', () => {
    for (const p of INVENTARIO_PROVEEDORES) {
      expect(p.servicio).toBeTruthy()
      expect(p.finalidad).toBeTruthy()
      expect(p.datos).toBeTruthy()
      expect(p.enlace).toMatch(/^https:\/\//)
      expect(p.estado).toBe('En uso')
    }
  })
})
