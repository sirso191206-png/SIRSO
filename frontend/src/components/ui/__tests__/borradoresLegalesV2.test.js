// Migración 105: borradores legales v2. Estado jurídico: PENDIENTE DE ABOGADO. Esta prueba NO valida nada jurídicamente: comprueba que los textos sigan siendo borradores, no inventen datos
// ni plazos, no afirmen funciones inexistentes y usen solo los marcadores que la interfaz sabe sustituir (lib/plantillaLegal.js).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../../../../../supabase/migrations/105_sirso_borradores_legales_v2.sql', import.meta.url), 'utf8')
const plantilla = readFileSync(new URL('../../../lib/plantillaLegal.js', import.meta.url), 'utf8')
const docs = [...sql.matchAll(/values \(null, '([a-z_]+)', '([0-9.]+-borrador)', '[^']+', \$legal\$([\s\S]*?)\$legal\$/g)].map((m) => ({ tipo: m[1], version: m[2], texto: m[3] }))
const de = (t) => docs.find((d) => d.tipo === t).texto

describe('migración 105 — borradores legales v2', () => {
  it('trae los 7 documentos, cada uno una vez', () => { expect(docs.map((d) => d.tipo).sort()).toEqual(['cookies', 'data_processing_agreement', 'privacy_integral', 'privacy_simplified', 'retention', 'security', 'terms']) })
  it('todos se declaran BORRADOR pendiente de revisión por un abogado y marcan lo que falta decidir', () => {
    for (const d of docs) { expect(d.texto, d.tipo).toMatch(/^⚠ BORRADOR[\s\S]*abogado/); expect(d.texto, d.tipo).toMatch(/\[(CONFIRMAR|DECISIÓN|DEFINIR|TODO LEGAL)/) }
  })
  it('solo usan marcadores {{…}} que la interfaz sabe sustituir (ninguno se mostraría «crudo»)', () => {
    const conocidos = new Set([...plantilla.matchAll(/\b([A-Z_]{3,}):/g)].map((m) => m[1]))
    for (const d of docs) for (const [, k] of d.texto.matchAll(/\{\{([A-Z_]+)\}\}/g)) expect(conocidos.has(k), `${d.tipo}: {{${k}}}`).toBe(true)
  })
  it('NO inventan datos corporativos (sin correos, RFC ni teléfonos concretos)', () => {
    for (const d of docs) { expect(d.texto, d.tipo).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i); expect(d.texto, d.tipo).not.toMatch(/\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/); expect(d.texto, d.tipo).not.toMatch(/\b\d{2}[ -]?\d{4}[ -]?\d{4}\b/) }
  })
  it('NO afirman lo que el software no hace (WhatsApp integrado, recordatorios o encuestas automáticos, IP guardada) y describen lo que sí existe', () => {
    for (const d of docs) expect(d.texto, d.tipo).not.toMatch(/integr[a-z]* .{0,40}whatsapp|encuestas de satisfacci|recordatorios adicionales|direcci[oó]n IP, navegador|a[uú]n no ofrece un panel/i)
    expect(de('security')).toContain('puede ver sus sesiones activas por dispositivo y cerrarlas'); expect(de('security')).toContain('contraseña temporal'); expect(de('terms')).toContain('SIRO no integra hoy servicios de mensajería automatizada')
    expect(de('cookies')).toContain('IndexedDB'); expect(de('cookies')).toContain('datos clínicos')
  })
  it('la política de conservación NO inventa plazos: solo el mínimo de 5 años del expediente (con fuente y por confirmar); el resto, por definir; nada automático', () => {
    const t = de('retention'); expect([...t.matchAll(/[0-9]+ años/g)].map((m) => m[0])).toEqual(['5 años'])
    expect(t).toContain('5 años contados desde la fecha del último acto médico'); expect(t).toContain('NOM-004-SSA3-2012'); expect(t).toMatch(/\[DEFINIR/); expect(t).toContain('nada se elimina automáticamente'); expect(t).toContain('retención legal')
  })
  it('la calificación responsable/encargado queda PARA EL ABOGADO (no se afirma en ninguna dirección)', () => {
    expect(de('privacy_integral')).toContain('quién es responsable y quién encargado'); expect(de('data_processing_agreement')).toContain('no se afirma aquí de forma absoluta'); expect(de('terms')).toMatch(/\[CONFIRMAR ABOGADO: el reparto de responsabilidades/)
  })
  it('ningún texto declara cumplimiento, aprobación ni certificación', () => { for (const d of docs) expect(d.texto, d.tipo).not.toMatch(/cumple con (la ley|la nom|el reglamento)|cumplimiento (total|integral)|aprobado por (un )?abogado|est[aá] certificad/i) })
  it('se aplica sin editar migraciones anteriores: desactiva la versión activa y conserva las anteriores (no hay DELETE)', () => {
    expect(sql).not.toMatch(/\bdelete\s+from\b/i); expect(sql).toMatch(/update legal_documents set activo = false/); expect(sql.match(/if not exists \(select 1 from legal_documents where tipo/g)).toHaveLength(7)
  })
})
