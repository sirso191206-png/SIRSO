// Fase 8: un rechazo de integridad de la base (migraciones 091–098) lanzado CRUDO por un servicio no debe reintentarse para siempre en la cola offline.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { HINTS_INTEGRIDAD, esRechazoDeIntegridad, ErrorDeDatos } from '../../../../lib/erroresDatos.js'

describe('esRechazoDeIntegridad', () => {
  it('reconoce el error CRUDO de PostgREST (hint) y el ya tipificado (codigo)', () => {
    for (const hint of HINTS_INTEGRIDAD) expect(esRechazoDeIntegridad({ code: 'P0001', hint, message: 'x' }), hint).toBe(true)
    expect(esRechazoDeIntegridad(new ErrorDeDatos('INTEGRIDAD_DATOS', 'x'))).toBe(true)
  })
  it('NO confunde otros errores: un hint desconocido, un fallo de red, nulo o indefinido siguen siendo transitorios', () => {
    for (const e of [{ code: 'P0001', hint: 'OTRA_COSA' }, { message: 'Failed to fetch' }, { hint: 123 }, new Error('x'), null, undefined]) expect(esRechazoDeIntegridad(e), JSON.stringify(e)).toBe(false)
  })
  it('GUARDIA contra la deriva: todo hint de integridad que declaren las migraciones 091 en adelante (…_INCOHERENTE, …FUERA_DE_LIMITE) está en la lista del frontend', () => {
    const dir = fileURLToPath(new URL('../../../../../../supabase/migrations/', import.meta.url))
    const hints = new Set()
    for (const n of readdirSync(dir).filter((x) => /^(09[1-9]|[1-9]\d\d)_/.test(x))) for (const m of readFileSync(dir + n, 'utf8').matchAll(/hint\s*=\s*'([A-Z_]+)'/g)) if (/_INCOHERENTE$|FUERA_DE_LIMITE$/.test(m[1])) hints.add(m[1])
    expect(hints.size).toBeGreaterThanOrEqual(10)
    for (const h of hints) expect(HINTS_INTEGRIDAD, `el hint ${h} de una migración no está en HINTS_INTEGRIDAD`).toContain(h)
    for (const h of HINTS_INTEGRIDAD) expect([...hints], `el hint ${h} del frontend no existe en ninguna migración`).toContain(h)
  })
})
