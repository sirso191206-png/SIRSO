// H24 — fechas en zona horaria de México. Antes: la nueva cita proponía el día SIGUIENTE desde las 18:00 y el corte de caja «de hoy»
// consultaba los cobros de AYER (toISOString / new Date('AAAA-MM-DD') trabajan en UTC). Reproducido en el navegador real (v9).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fechaInputLocal } from '../../../lib/fechas'
import { fechaLocal } from '../../../lib/reportes'

const tzOriginal = process.env.TZ
beforeAll(() => { process.env.TZ = 'America/Mexico_City' })
afterAll(() => { process.env.TZ = tzOriginal })
const fuente = (ruta) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8')

describe('H24 — fecha local en México (UTC−6)', () => {
  it('la zona de la prueba es la de México y reproduce el problema de toISOString', () => {
    expect(new Date(2026, 9, 16, 18, 0).getTimezoneOffset()).toBe(360)
    expect(new Date(2026, 9, 16, 18, 0).toISOString().slice(0, 10)).toBe('2026-10-17')   // el comportamiento ANTERIOR (incorrecto)
  })
  it('fechaInputLocal da el día local a cualquier hora (00:00, 17:59, 18:00, 23:59)', () => {
    for (const [h, m] of [[0, 0], [17, 59], [18, 0], [23, 59]]) expect(fechaInputLocal(new Date(2026, 9, 16, h, m))).toBe('2026-10-16')
  })
  it('"AAAA-MM-DD" se interpreta como el día local (el corte de hoy no consulta ayer)', () => {
    const d = fechaLocal('2026-10-16')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 16, 0])
  })
  it('ModalNuevaCita y CorteDeCaja ya no calculan la fecha con toISOString().slice(0, 10)', () => {
    expect(fuente('../../agenda/ModalNuevaCita.jsx')).not.toMatch(/toISOString\(\)\.slice\(0, 10\)/)
    expect(fuente('../../../pages/CorteDeCaja.jsx')).not.toMatch(/toISOString\(\)\.slice\(0, 10\)/)
    expect(fuente('../../../pages/CorteDeCaja.jsx')).toMatch(/fechaLocal\(fecha\)/)
  })
})
