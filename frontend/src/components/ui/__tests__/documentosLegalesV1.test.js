// Migración 106: documentos legales v1.0 integrados. Comprueba el CONTENIDO publicado: identidad del titular, datos permitidos en cada documento, ausencia de marcadores y de
// advertencias editoriales, artículos citados (solo los que existen en el texto oficial leído) y que no se afirme lo que el software no hace. NO sustituye una revisión jurídica.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../../../../../supabase/migrations/106_sirso_documentos_legales_v1.sql', import.meta.url), 'utf8')
const docs = Object.fromEntries([...sql.matchAll(/values \(null, '([a-z_]+)', '1\.0', '([^']+)', \$legal\$([\s\S]*?)\$legal\$/g)].map((m) => [m[1], { titulo: m[2], texto: m[3] }]))
const todos = Object.entries(docs)
const NOMBRE = 'Eduardo Heriberto Iglesias Arines'
const CORREO = 'sirso191206@gmail.com'
const TELEFONO = '5525338668'
const DOMICILIO = 'Calle Laureles número 8, San Francisco Chiautla, San Andrés Chiautla, Estado de México'
// Artículos de la LFPDPPP (texto vigente, reforma DOF 14-11-2025) que SÍ se leyeron y que los documentos pueden citar.
const ARTICULOS_LEY = new Set([2, 7, 8, 9, 10, 11, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 40])

describe('documentos legales v1.0 (migración 106)', () => {
  it('trae los 9 documentos', () => { expect(Object.keys(docs).sort()).toEqual(['arco_procedure', 'consents', 'cookies', 'data_processing_agreement', 'privacy_integral', 'privacy_simplified', 'retention', 'security', 'terms']) })
  it('NO llevan advertencias editoriales ni marcadores sin resolver (borrador, pendiente de revisión, [TODO], [CONFIRMAR], [DEFINIR], [DECISIÓN] ni ningún texto entre corchetes)', () => {
    for (const [t, d] of todos) { expect(d.texto, t).not.toMatch(/borrador|provisional|pendiente de (revisi[oó]n|abogado|configurar)|revisi[oó]n (legal|jur[ií]dica) profesional/i); expect(d.texto, t).not.toMatch(/\[(TODO|CONFIRMAR|DEFINIR|DECISI[OÓ]N)|TODO LEGAL|CONFIRMAR ABOGADO|DECISI[OÓ]N DEL ABOGADO|\[[^\]]{0,40}\]/); expect(d.titulo, t).not.toMatch(/borrador/i) }
  })
  it('solo usan los marcadores que se resuelven con la propia versión ({{VERSION}} y {{FECHA_ACTUALIZACION}}); ninguno toma datos de la clínica', () => {
    for (const [t, d] of todos) { const k = new Set([...d.texto.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1])); expect([...k].sort(), t).toEqual(['FECHA_ACTUALIZACION', 'VERSION']) }
  })
  it('la identidad es la del titular, persona física, escrita siempre igual; SIRO no se presenta como sociedad ni se atribuye a una institución', () => {
    for (const t of ['privacy_simplified', 'privacy_integral', 'terms', 'data_processing_agreement', 'arco_procedure']) expect(docs[t].texto, t).toContain(NOMBRE)
    for (const [t, d] of todos) {
      for (const m of d.texto.matchAll(/Eduardo[^,.;:()\n]{0,40}/g)) expect(m[0].trim().startsWith(NOMBRE), `${t}: «${m[0]}»`).toBe(true)
      expect(d.texto, t).not.toMatch(/S\.A\.|S\. ?de R\.L\.|sociedad (an[oó]nima|de responsabilidad)|raz[oó]n social|Universidad|UPEMEX|Privada del Estado/i)
    }
    expect(docs.privacy_integral.texto).toContain('persona física'); expect(docs.privacy_integral.texto).toContain('SIRO no es una sociedad mercantil'); expect(docs.terms.texto).toContain('SIRO no es una sociedad mercantil')
  })
  it('el correo es SIEMPRE el proporcionado (sin enlaces ni otros correos), no se inventa un RFC y el teléfono solo está en el aviso integral', () => {
    for (const [t, d] of todos) {
      for (const m of d.texto.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) expect(m[0], t).toBe(CORREO)
      expect(d.texto, t).not.toMatch(/\bRFC\b|\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b|https?:\/\//)
      if (t !== 'privacy_integral') expect(d.texto, t).not.toContain(TELEFONO)
    }
    expect(docs.privacy_integral.texto).toContain(TELEFONO)
    for (const t of ['privacy_simplified', 'privacy_integral', 'terms', 'data_processing_agreement']) expect(docs[t].texto, t).toContain(CORREO)
  })
  it('el domicilio solo figura donde tiene una finalidad legal (avisos de privacidad y acuerdo de tratamiento; los términos lo usan para identificar al prestador) y nunca en seguridad, cookies, conservación, ARCO ni consentimientos', () => {
    for (const t of ['privacy_simplified', 'privacy_integral', 'terms', 'data_processing_agreement']) expect(docs[t].texto, t).toContain(DOMICILIO)
    for (const t of ['cookies', 'security', 'retention', 'arco_procedure', 'consents']) expect(docs[t].texto, t).not.toContain('Laureles')
  })
  it('todo artículo citado de «la Ley» existe en el texto oficial leído (no se citan artículos sin verificar)', () => {
    for (const [t, d] of todos) {
      for (const m of d.texto.matchAll(/art[ií]culos? ([0-9]+(?:(?:, | y | a |, y )[0-9]+)*)/gi)) for (const n of m[1].match(/[0-9]+/g)) expect(ARTICULOS_LEY.has(Number(n)), `${t}: artículo ${n}`).toBe(true)
    }
  })
  it('lo verificado en el texto oficial está reflejado: consentimiento expreso y por escrito (art. 8), 20 + 15 días hábiles (art. 31), gratuidad (art. 34), bloqueo previo a la supresión (arts. 10 y 24) y solicitud ante la Secretaría Anticorrupción y Buen Gobierno en 15 días (art. 40)', () => {
    expect(docs.privacy_integral.texto).toMatch(/artículo 8[\s\S]{0,60}consentimiento expreso y por escrito/); expect(docs.consents.texto).toMatch(/expreso y por escrito/)
    expect(docs.arco_procedure.texto).toMatch(/veinte días hábiles[\s\S]{0,120}quince días hábiles/); expect(docs.arco_procedure.texto).toMatch(/gratuito/); expect(docs.arco_procedure.texto).toContain('artículo 34')
    expect(docs.arco_procedure.texto).toMatch(/bloqueo[\s\S]{0,80}suprime/); expect(docs.retention.texto).toMatch(/previo bloqueo/)
    for (const t of ['privacy_integral', 'arco_procedure']) { expect(docs[t].texto, t).toContain('Secretaría Anticorrupción y Buen Gobierno'); expect(docs[t].texto, t).toMatch(/quince días/) }
    expect(docs.retention.texto).toMatch(/setenta y dos meses/)
  })
  it('conservación: NOM-004-SSA3-2012 numeral 5.4 (mínimo 5 años desde el último acto médico) es el ÚNICO plazo en años; ni fiscal ni contractual se inventan; cancelar la suscripción no elimina el expediente', () => {
    const t = docs.retention.texto; expect([...t.matchAll(/[0-9]+ años/g)].map((m) => m[0])).toEqual(['5 años']); expect(t).toContain('NOM-004-SSA3-2012, numeral 5.4'); expect(t).toContain('último acto médico')
    expect(t).toMatch(/Código Fiscal de la Federación establece para cada tipo de documento/); expect(t).toContain('Cancelar una suscripción no elimina el expediente clínico'); expect(t).toContain('Nada se elimina de forma automática'); expect(t).toContain('retención legal')
    expect(docs.terms.texto).toContain('no elimina el expediente clínico'); expect(docs.data_processing_agreement.texto).toContain('no elimina el expediente clínico')
  })
  it('distingue los papeles: responsable de los datos de cuenta y comerciales; encargado de los datos de pacientes (que son de la clínica); sin atribuir un papel único', () => {
    const i = docs.privacy_integral.texto; expect(i).toMatch(/respecto de sus datos de cuenta[\s\S]{0,200}el responsable es el titular de SIRO/); expect(i).toMatch(/Cuando la clínica determina las finalidades y los medios[\s\S]{0,120}la clínica es la responsable[\s\S]{0,120}persona encargada/)
    const a = docs.data_processing_agreement.texto; expect(a).toMatch(/la Clínica determina las finalidades y los medios del tratamiento y es la responsable; SIRO es persona encargada/); expect(a).toMatch(/SIRO es responsable según su Aviso de Privacidad/); expect(a).toMatch(/determinan conjuntamente/)
  })
  it('NO afirman lo que el software no hace: WhatsApp integrado, recordatorios o encuestas automáticos, IP guardada, anonimización automática, firma remota, certificaciones o aprobaciones', () => {
    for (const [t, d] of todos) expect(d.texto, t).not.toMatch(/integr[a-z]* .{0,40}whatsapp|recordatorios autom|direcci[oó]n IP, navegador|certificad|ISO ?27|aprobad[oa] por|avalad|homologad|cumple con (la ley|la nom)|cumplimiento (total|integral)/i)
    expect(docs.terms.texto).toContain('SIRO no integra servicios de mensajería automatizada'); expect(docs.retention.texto).toContain('ni ofrece anonimización automática'); expect(docs.consents.texto).toContain('SIRO no ofrece firma remota')
    expect(docs.privacy_integral.texto).toContain('La aplicación no guarda la dirección IP en su base de datos'); expect(docs.security.texto).toContain('Configuración → Seguridad'); expect(docs.cookies.texto).toContain('IndexedDB')
  })
  it('declaran el acceso de superadministración de SIRO a la información de las clínicas (solo soporte, seguridad y mantenimiento, con registro), que existe en el software', () => {
    for (const t of ['privacy_integral', 'data_processing_agreement']) expect(docs[t].texto, t).toMatch(/administrador de la plataforma, puede acceder a la información de (una|la) cl[ií]nica solo para soporte, seguridad y mantenimiento[\s\S]{0,80}quedan registrados/i)
  })
  it('el registro de aceptación y el versionado están descritos y existen (versión, fecha y persona; el servidor fija la fecha; las anteriores se conservan)', () => {
    expect(docs.consents.texto).toMatch(/versión aceptada, la fecha y hora \(que fija el servidor\)/); expect(docs.terms.texto).toContain('la aplicación registra qué versión aceptó cada persona')
    expect(sql).toContain('fn_validar_aceptacion_legal'); expect(sql).toMatch(/new\.aceptado_en := now\(\)/); expect(sql).toMatch(/new\.documento_version := v_doc\.version/); expect(sql).toMatch(/if auth\.uid\(\) is null then return new; end if;/); expect(sql).not.toMatch(/\bdelete\s+from\b/i)
    expect(sql.match(/if not exists \(select 1 from legal_documents where tipo/g)).toHaveLength(9); expect(sql).toMatch(/update legal_documents set activo = false/); expect(sql).toContain("'arco_procedure','consents'")
  })
})
