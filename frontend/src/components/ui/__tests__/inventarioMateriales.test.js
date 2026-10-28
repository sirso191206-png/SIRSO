// Inventario de materiales (migración 118): reglas de pantalla, CSV, reporte imprimible, servicio y la propia migración.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const h = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../../lib/supabase', () => ({ supabase: { rpc: h.rpc } }))

import {
  estadoStock, validarMovimiento, textoAvisoInventario, traducirErrorInventario, columnasCsvMateriales, columnasCsvMovimientos
} from '../../../lib/inventario'
import { esRechazoDeIntegridad } from '../../../lib/erroresDatos'
import { aCsv } from '../../../lib/csv'
import { documentoConPolitica } from '../../../lib/imprimir'
import { documentoInventario } from '../../inventario/imprimirInventario'
import { registrarMovimiento, obtenerStockBajo, obtenerAvisosTratamiento } from '../../../services/inventario'
import { ACCESO_RUTAS } from '../../../lib/accesoPorRol'

const RAIZ = fileURLToPath(new URL('../../../../../', import.meta.url))
const leer = (ruta) => readFileSync(RAIZ + ruta, 'utf8')

beforeEach(() => h.rpc.mockReset())

describe('estado del stock (igual que fn_inventario_stock_bajo)', () => {
  it('agotado en 0 o negativo, bajo en o bajo el mínimo, suficiente arriba', () => {
    expect(estadoStock({ stock: 0, stock_minimo: 2 })).toBe('agotado')
    expect(estadoStock({ stock: -1, stock_minimo: 0 })).toBe('agotado')
    expect(estadoStock({ stock: 2, stock_minimo: 2 })).toBe('bajo')
    expect(estadoStock({ stock: '3.5', stock_minimo: '2' })).toBe('ok')
  })
})

describe('validación de movimientos antes de mandarlos', () => {
  it('entrada solo pide una cantidad positiva', () => {
    expect(validarMovimiento({ tipo: 'entrada', cantidad: 5 })).toBeNull()
    expect(validarMovimiento({ tipo: 'entrada', cantidad: 0 })).toMatch(/mayor que cero/)
    expect(validarMovimiento({ tipo: 'entrada', cantidad: -2 })).toMatch(/negativa/)
    expect(validarMovimiento({ tipo: 'entrada', cantidad: '' })).toMatch(/cantidad/)
  })
  it('salida y ajuste exigen motivo; el ajuste admite contar 0', () => {
    expect(validarMovimiento({ tipo: 'salida', cantidad: 1, motivo: ' ' })).toMatch(/motivo/)
    expect(validarMovimiento({ tipo: 'ajuste', cantidad: 0, motivo: 'Conteo' })).toBeNull()
    expect(validarMovimiento({ tipo: 'regalo', cantidad: 1 })).toMatch(/tipo/)
  })
})

describe('aviso sin bloquear la atención', () => {
  it('sin avisos no se muestra nada; con avisos distingue agotados y bajos', () => {
    expect(textoAvisoInventario([])).toBeNull()
    expect(textoAvisoInventario(null)).toBeNull()
    const t = textoAvisoInventario([{ nombre: 'Guantes', agotado: true }, { nombre: 'Resina', agotado: false }])
    expect(t).toMatch(/Sesión registrada/)
    expect(t).toMatch(/sin stock: Guantes/)
    expect(t).toMatch(/stock bajo: Resina/)
  })
})

describe('servicio', () => {
  it('registrarMovimiento manda el id del navegador (idempotencia de la cola sin conexión)', async () => {
    h.rpc.mockResolvedValue({ data: { ok: true, stock: 7 }, error: null })
    await registrarMovimiento({ id: 'id-1', materialId: 'm1', tipo: 'entrada', cantidad: '3', motivo: '' })
    expect(h.rpc).toHaveBeenCalledWith('fn_inventario_registrar_movimiento', { p_material: 'm1', p_tipo: 'entrada', p_cantidad: 3, p_motivo: null, p_id: 'id-1' })
  })
  it('un rechazo de negocio del servidor es DEFINITIVO (la cola lo marca como conflicto en vez de reintentarlo)', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'Ya existe un movimiento con ese identificador…', hint: 'MOVIMIENTO_CONFLICTO', code: 'P0001' } })
    const err = await registrarMovimiento({ id: 'x', materialId: 'm1', tipo: 'entrada', cantidad: 1 }).catch((e) => e)
    expect(err.codigo).toBe('INTEGRIDAD_DATOS')
    expect(esRechazoDeIntegridad(err)).toBe(true)
    expect(err.message).toMatch(/identificador/)
  })
  it('un error de red NO se vuelve definitivo', () => {
    const red = { message: 'Failed to fetch' }
    expect(traducirErrorInventario(red)).toBe(red)
  })
  it('tablero y avisos devuelven lista vacía si la base no manda nada', async () => {
    h.rpc.mockResolvedValue({ data: null, error: null })
    expect(await obtenerStockBajo()).toEqual([])
    expect(await obtenerAvisosTratamiento('t1')).toEqual([])
    expect(h.rpc).toHaveBeenCalledWith('fn_inventario_stock_bajo', { p_sucursal: null })
  })
})

describe('exportación CSV', () => {
  it('existencias y movimientos, protegidos contra fórmulas', () => {
    const csv = aCsv(columnasCsvMateriales(() => 'General'), [{ nombre: '=HYPERLINK("x")', unidad: 'caja', stock: 0, stock_minimo: 1, activo: true }])
    expect(csv).toContain('Material,Categoría,Unidad,Sucursal,Stock,Mínimo,Estado,Activo')
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain('Agotado')
    const mov = aCsv(columnasCsvMovimientos(), [{ creado_en: '2026-10-28T10:00:00Z', material: { nombre: 'Resina' }, tipo: 'salida', origen: 'tratamiento', cantidad: -2, stock_anterior: 9, stock_resultante: 7, motivo: 'Tratamiento: Resina 36', usuario_nombre: 'Dante' }])
    expect(mov).toContain('Tipo,Origen,Entra,Sale,Stock anterior')
    expect(mov).toContain('Salida,Consulta,,2,9,7,Tratamiento: Resina 36,Dante')
  })
})

describe('reporte imprimible (plantilla html de lib/imprimir)', () => {
  const ATAQUE = '"><img src=x onerror="alert(1)"><script>alert(2)</script>'
  it('todo dato capturado se escapa y el único script es el propio, con nonce', () => {
    const doc = documentoInventario({
      clinicaNombre: ATAQUE,
      materiales: [{ nombre: ATAQUE, categoria: ATAQUE, unidad: ATAQUE, stock: 0, stock_minimo: 1, sucursal_id: null }],
      movimientos: [{ creado_en: '2026-10-28T10:00:00Z', material: { nombre: ATAQUE }, tipo: 'ajuste', origen: 'manual', cantidad: -1, stock_resultante: 0, motivo: ATAQUE, usuario_nombre: ATAQUE }],
      nombreSucursal: () => ATAQUE,
      sucursalFiltro: ATAQUE,
      desde: new Date('2026-10-01'),
      hasta: new Date('2026-10-28')
    })
    const texto = documentoConPolitica(doc, 'a'.repeat(32))
    expect(texto).not.toContain('<img')
    expect(texto).not.toContain('<script>alert')
    expect(texto.match(/<script/g)).toHaveLength(1)
    expect(texto).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
    expect(texto).toContain('Agotado')
  })
})

describe('acceso y migración', () => {
  it('/inventario es para propietario y asistente', () => {
    expect(ACCESO_RUTAS.find((r) => r.patron === '/inventario')?.roles).toEqual(['owner', 'asistente'])
  })
  it('la 118 protege sus tres tablas con RLS, sesión activa y plan, y trae rollback y prueba SQL', () => {
    const sql = leer('supabase/migrations/118_sirso_inventario_materiales.sql')
    for (const t of ['materiales', 'movimientos_inventario', 'receta_materiales']) {
      expect(sql).toMatch(new RegExp(`alter table ${t} enable row level security`))
    }
    expect(sql).toMatch(/'sesion_activa_' \|\| t/)
    expect(sql).toMatch(/'plan_func_' \|\| t/)
    expect(sql).not.toMatch(/grant\s+[^;]*\bstock\b[^_]/i)       // nadie escribe el stock directo
    expect(sql).not.toMatch(/grant[^;]*to[^;]*\banon\b/i)
    expect(leer('supabase/rollback/siro_v3/rollback_118.sql')).toMatch(/drop table if exists materiales/)
    expect(leer('supabase/tests/aislamiento_clinicas_test.sql')).toMatch(/'movimientos_inventario'/)
  })
})
