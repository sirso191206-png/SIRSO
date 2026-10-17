// Guardia estática de las migraciones 085–091 y de la consulta de verificación en producción: no destruyen datos al aplicarse, son
// transaccionales, no abren permisos y toda función SECURITY DEFINER fija su search_path.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SUPABASE = fileURLToPath(new URL('../../../../../supabase/', import.meta.url))
const MIG = `${SUPABASE}migrations/`
const NUEVAS = readdirSync(MIG).filter((n) => /^(08[5-9]|09[0-9]|10[0-6])_/.test(n)).sort()
const leer = (ruta) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n')
// Sin comentarios y SIN los cuerpos de funciones ($$ … $$, $q$ … $q$): lo que queda es lo que se ejecuta AL APLICAR la migración.
const sinCuerpos = (t) => t.replace(/--.*$/gm, '').replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, '$$$$')

describe('migraciones 085–106', () => {
  it('existen las veintidós, numeradas sin huecos', () => {
    expect(NUEVAS.map((n) => n.slice(0, 3))).toEqual(['085', '086', '087', '088', '089', '090', '091', '092', '093', '094', '095', '096', '097', '098', '099', '100', '101', '102', '103', '104', '105', '106'])
  })
  it.each(NUEVAS)('%s: aplicarla NO ejecuta ninguna sentencia que borre o altere datos (DELETE, TRUNCATE, UPDATE, DROP TABLE/COLUMN); las operaciones destructivas viven solo dentro de funciones que se invocan explícitamente', (n) => {
    // Excepciones EXPLÍCITAS y mínimas: la 095 guarda una instantánea de lo que revoca en plataforma_config (para un rollback exacto) y la 096 sustituye una política de lectura y la 100 la política de inserción de auditoria (create policy inmediatamente después).
    const t = sinCuerpos(leer(MIG + n)).replace(/insert\s+into\s+public\.plataforma_config\s*\(clave, valor\)\s*select\s+'rollback_095_privilegios'[\s\S]*?on\s+conflict\s*\(clave\)\s+do\s+nothing;/gi, '').replace(/drop\s+policy\s+if\s+exists\s+storage_logos_select\s+on\s+storage\.objects;/gi, '').replace(/drop\s+policy\s+if\s+exists\s+auditoria_insert_eventos\s+on\s+public\.auditoria;/gi, '').replace(/insert\s+into\s+public\.politicas_conservacion\s*\([^)]*\)\s*values[\s\S]*?on\s+conflict\s*\(categoria\)\s+do\s+nothing;/gi, '')   // 104: datos semilla de la política (todas las categorías, SIN plazos)
    expect(t).not.toMatch(/\bdelete\s+from\b/i); expect(t).not.toMatch(/(^|;)\s*truncate\b/i); /* la SENTENCIA TRUNCATE; «truncate» como nombre de privilegio (revoke truncate…) es legítimo */ expect(t).not.toMatch(/\bupdate\s+\w+(\.\w+)?\s+set\b/i)
    expect(t).not.toMatch(/\bdrop\s+(table|column|schema|policy|function|type|view)\b/i); expect(t).not.toMatch(/\balter\s+table\s+\S+\s+(drop|alter\s+column)\b/i); expect(t).not.toMatch(/\binsert\s+into\b/i)
  })
  it.each(NUEVAS)('%s: es transaccional (begin … commit) y re-ejecutable (usa create or replace / if exists / drop trigger if exists)', (n) => {
    const t = leer(MIG + n)
    expect(t).toMatch(/^begin;$/m); expect(t).toMatch(/^commit;$/m)
    const sinCom = sinCuerpos(t)
    expect(sinCom).not.toMatch(/\bcreate\s+(function|trigger|table)\b(?!\s+if)/i.test(sinCom) ? /create\s+function(?!.*or replace)/i : /^$/)
    for (const m of sinCom.matchAll(/\bcreate\s+(?:or\s+replace\s+)?function\b/gi)) expect(m[0], n).toMatch(/or replace/i)
    for (const m of sinCom.matchAll(/\bcreate\s+trigger\b/gi)) { const antes = sinCom.slice(0, m.index); expect(antes, `${n}: create trigger sin drop trigger if exists previo`).toMatch(/drop\s+trigger\s+if\s+exists/i) }
  })
  it('NINGUNA concede privilegios a public ni a anon; a authenticated solo las cuatro funciones de uso clínico', () => {
    const permitidas = ['fn_finalizar_consulta', 'fn_completar_consulta_pendiente', 'fn_consultas_sin_nota', 'fn_corregir_estado_cita']
    const concedidas = []
    for (const n of NUEVAS) {
      const t = sinCuerpos(leer(MIG + n))
      expect(t, `${n}: grant a public/anon`).not.toMatch(/\bgrant\b[^;]*\bto\b[^;]*\b(public|anon)\b/i)
      expect(t, `${n}: grant sobre tablas`).not.toMatch(/\bgrant\s+(all|select|insert|update|delete)\b/i)
      for (const m of t.matchAll(/\bgrant\s+execute\s+on\s+function\s+(\w+)\([^)]*\)\s+to\s+([\w, ]+);/gi)) if (/authenticated/i.test(m[2])) concedidas.push(m[1])
    }
    expect([...new Set(concedidas)].sort()).toEqual([...permitidas].sort())
  })
  it('toda función SECURITY DEFINER fija su search_path (público y seguro)', () => {
    for (const n of NUEVAS) {
      const t = leer(MIG + n)
      for (const m of t.matchAll(/create or replace function\s+(\w+)\(([\s\S]*?)\$\$/gi)) { if (/security definer/i.test(m[0])) expect(m[0], `${n}: ${m[1]}`).toMatch(/set search_path\s*=\s*public/i) }
    }
  })
  it('las funciones destructivas y de limpieza se revocan de public, anon y authenticated y solo se conceden a service_role', () => {
    const t = leer(MIG + '089_sirso_conservacion_por_categorias_y_limpieza.sql')
    for (const f of ['fn_clinica_resumen_eliminacion', 'fn_eliminar_clinica', 'fn_limpieza_pendiente_clinica', 'fn_registrar_limpieza_clinica', 'fn_registrar_intento_eliminacion']) {
      expect(t).toMatch(new RegExp(`revoke all on function ${f}\\([^)]*\\) from public, anon, authenticated;`)); expect(t).toMatch(new RegExp(`grant execute on function ${f}\\([^)]*\\) to service_role;`))
    }
  })
  it('las funciones de trigger no son invocables por usuarios (revocadas de public, anon y authenticated)', () => {
    expect(leer(MIG + '090_sirso_completar_cita_solo_por_consulta.sql')).toMatch(/revoke all on function fn_bloquear_completar_cita_directo\(\) from public, anon, authenticated;/)
    expect(leer(MIG + '091_sirso_integridad_nota_cita.sql')).toMatch(/revoke all on function fn_validar_nota_cita\(\) from public, anon, authenticated;/)
    expect(leer(MIG + '094_sirso_correccion_citas_completadas.sql')).toMatch(/revoke all on function fn_proteger_cita_completada\(\) from public, anon, authenticated;/)
    for (const f of ['fn_validar_dentista_misma_clinica', 'fn_validar_tratamiento_mismo_paciente', 'fn_validar_actor']) expect(leer(MIG + '098_sirso_integridad_referencias_y_actores.sql')).toMatch(new RegExp(`revoke all on function ${f}\\(\\) from public, anon, authenticated;`))
    for (const f of ['fn_validar_autoria_nota', 'fn_validar_referencias_cita']) expect(leer(MIG + '092_sirso_integridad_autoria_y_referencias.sql')).toMatch(new RegExp(`revoke all on function ${f}\\(\\) from public, anon, authenticated;`))
  })
})

describe('consultas de verificación (solo lectura): TODAS las de supabase/verificacion/', () => {
  const ARCHIVOS = readdirSync(`${SUPABASE}verificacion/`).filter((n) => n.endsWith('.sql')).sort()
  it('existen las cuatro: el estado de producción, la conservación, los logos y los marcadores de migraciones', () => { expect(ARCHIVOS).toEqual(['conservacion_estado_solo_lectura.sql', 'estado_produccion_solo_lectura.sql', 'logos_solo_lectura.sql', 'marcadores_de_migraciones_solo_lectura.sql']) })
  describe.each(ARCHIVOS)('%s', (nombre) => {
    const t = leer(`${SUPABASE}verificacion/${nombre}`)
    const ejecutable = t.replace(/--.*$/gm, '')
    it('está envuelta en BEGIN READ ONLY … ROLLBACK: PostgreSQL rechaza cualquier escritura aunque alguien edite el archivo', () => {
      expect(ejecutable).toMatch(/^\s*begin read only;/i); expect(ejecutable).toMatch(/rollback;\s*$/i)
    })
    it('solo contiene SELECT (ni INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, GRANT, TRUNCATE, SET ROLE ni funciones que escriban)', () => {
      // Las palabras clave solo importan FUERA de los literales entre comillas: 'TRUNCATE' como NOMBRE de un privilegio dentro de una cadena no es una sentencia.
      const sinLiterales = ejecutable.replace(/'(?:[^']|'')*'/g, "''")
      expect(sinLiterales).not.toMatch(/\b(insert|update|delete|create|drop|alter|grant|revoke|truncate|copy|vacuum|reindex|set\s+role|set\s+session)\b/i)
      expect(ejecutable).not.toMatch(/\bfn_(finalizar|eliminar|completar|registrar|corregir)\w*\s*\(/i)
    })
    it('no selecciona datos de pacientes ni contenido clínico, ni nombres de archivos de Storage: solo conteos, configuración y nombres de objetos', () => {
      // `contenido` también es un VALOR de estado de incidente ('contenido'); solo preocupa como columna (sin comillas).
      expect(ejecutable).not.toMatch(/\b(nombre_completo|diagnostico|curp|telefono|correo|direccion)\b/i)
      expect(ejecutable).not.toMatch(/(?<!')\bcontenido\b(?!')/i)
      expect(ejecutable).not.toMatch(/select\s+(name|id)\s+from\s+storage\.objects/i)
    })
  })
})
