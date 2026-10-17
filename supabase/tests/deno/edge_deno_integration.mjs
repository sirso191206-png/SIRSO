// Integración de admin-eliminar-clinica en DENO REAL. Qué es REAL y qué NO:
//   REAL:      el runtime Deno 1.x, el código de la función (sin modificar), supabase-js 2.45.0 (el que fija la función), PostgREST y PostgreSQL con
//              las migraciones, RLS, privilegios y JWT HS256.
//   SIMULADO:  Auth y Storage de Supabase (una pasarela local sobre la misma base: borra auth.users y storage.objects, y permite INYECTAR fallos).
//   NO PROBADO: Supabase real (Auth/Storage reales, red, límites). Eso sigue PENDIENTE DE ENTORNO.
// Requisitos: base desechable con las migraciones + `psql -f semilla_deno.sql`; PostgREST en POSTGREST_URL; `./preparar.sh`; binario de Deno en DENO.
// Uso: DENO=/ruta/deno node edge_deno_integration.mjs      (código de salida 1 si algo falla)
import http from 'node:http'
import crypto from 'node:crypto'
import { spawn, execSync } from 'node:child_process'
import { writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const C = { deno: process.env.DENO ?? 'deno', dir: process.env.DENO_TEST_DIR ?? '/tmp/deno_tests', rest: process.env.POSTGREST_URL ?? 'http://127.0.0.1:3000', secret: process.env.JWT_SECRET ?? 'una-clave-local-solo-para-pruebas-0123456789', db: process.env.PGDATABASE ?? 'siro_test', gw: 54321, fn: 8787, psql: process.env.PSQL_PREFIX ?? 'su postgres -c' }
const REPO = fileURLToPath(new URL('../../../', import.meta.url))
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const firmar = (claims, clave = C.secret) => { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64(claims); return `${h}.${p}.${crypto.createHmac('sha256', clave).update(`${h}.${p}`).digest('base64url')}` }
const ahora = () => Math.floor(Date.now() / 1000)
const jwtUsuario = (sub, exp = ahora() + 3600, clave) => firmar({ sub, role: 'authenticated', aud: 'authenticated', exp }, clave)
const SERVICIO = firmar({ role: 'service_role', iss: 'supabase', exp: ahora() + 36000 }), ANON = firmar({ role: 'anon', iss: 'supabase', exp: ahora() + 36000 })

mkdirSync(`${C.dir}/sql`, { recursive: true }); let nSql = 0
function sql(q) { const f = `${C.dir}/sql/q${nSql++}.sql`; writeFileSync(f, q); chmodSync(f, 0o644); return execSync(`${C.psql} "psql -q -At -d ${C.db} -f ${f}"`, { encoding: 'utf8' }).trim() }
const uuidOk = (s) => /^[0-9a-f-]{36}$/i.test(s)
const uid = (k, n) => sql(`select zz_u('${k}', ${n})`)
const info = (k) => { const [clinica, paciente, owner, dentista] = sql(`select clinica, coalesce(paciente::text, ''), owner, dentista from zz_semilla_info where k = '${k}'`).split('|'); return { k, clinica, paciente, owner, dentista } }
const existe = (clinica) => sql(`select count(*) from clinicas where id = '${clinica}'`) === '1'
const huella = (clinica) => sql(`select zz_huella('${clinica}')::text`)
const auditoria = (accion, clinica) => Number(sql(`select count(*) from auditoria where accion = '${accion}' and entidad_id = '${clinica}'`))
const auditoriaTotal = () => Number(sql('select count(*) from auditoria'))

// ---------- Pasarela local: Auth y Storage SIMULADOS sobre la misma base; /rest/v1 → PostgREST REAL ----------
const control = { failAuth: new Set(), failStorage: new Set(), failRpc: new Map() }   // failRpc: nombre de función → { status, cuerpo } (error INESPERADO de la base)
const log = []
const rol = (req) => { try { return JSON.parse(Buffer.from((req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').split('.')[1], 'base64url').toString()).role } catch { return null } }
function verificar(token) {
  const [h, p, s] = (token ?? '').split('.'); if (!s) return null
  const esperado = crypto.createHmac('sha256', C.secret).update(`${h}.${p}`).digest('base64url'); if (esperado !== s) return null
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString()); if (claims.exp && claims.exp < ahora()) return null; return claims
}
const gateway = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c); const cuerpo = Buffer.concat(chunks)
  const responder = (st, obj, cab = {}) => { res.writeHead(st, { 'Content-Type': 'application/json', ...cab }); res.end(typeof obj === 'string' ? obj : JSON.stringify(obj)) }
  const u = new URL(req.url, 'http://x')
  try {
    if (u.pathname.startsWith('/rest/v1/')) {
      const ruta = u.pathname.replace('/rest/v1', '') + u.search; log.push({ t: 'rest', metodo: req.method, ruta, rpc: u.pathname.includes('/rpc/') ? u.pathname.split('/rpc/')[1] : null })
      const fallo = u.pathname.includes('/rpc/') ? control.failRpc.get(u.pathname.split('/rpc/')[1]) : null
      if (fallo) return responder(fallo.status, fallo.cuerpo)
      const cab = {}; for (const [k, v] of Object.entries(req.headers)) if (!['host', 'content-length', 'connection'].includes(k)) cab[k] = v
      const r = await fetch(C.rest + ruta, { method: req.method, headers: cab, body: ['GET', 'HEAD'].includes(req.method) ? undefined : cuerpo })
      const texto = await r.text(); const salida = {}; r.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) salida[k] = v })
      res.writeHead(r.status, salida); return res.end(texto)
    }
    if (u.pathname === '/auth/v1/user' && req.method === 'GET') {
      const claims = verificar((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''))
      if (!claims || !claims.sub) return responder(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' })
      return responder(200, { id: claims.sub, aud: 'authenticated', role: 'authenticated', email: `${claims.sub}@ficticio.mx` })
    }
    const mu = u.pathname.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/i)
    if (mu && req.method === 'DELETE') {
      if (rol(req) !== 'service_role') return responder(403, { code: 403, msg: 'not admin' })
      log.push({ t: 'auth.delete', id: mu[1] })
      if (control.failAuth.has(mu[1])) return responder(500, { code: 500, error_code: 'unexpected_failure', msg: 'Database error deleting user' })
      if (sql(`select count(*) from auth.users where id = '${mu[1]}'`) === '0') return responder(404, { code: 404, error_code: 'user_not_found', msg: 'User not found' })
      sql(`delete from auth.users where id = '${mu[1]}'`); return responder(200, {})
    }
    const ms = u.pathname.match(/^\/storage\/v1\/object\/([\w-]+)$/)
    if (ms && req.method === 'DELETE') {
      if (rol(req) !== 'service_role') return responder(403, { message: 'forbidden' })
      const { prefixes } = JSON.parse(cuerpo.toString()); log.push({ t: 'storage.delete', bucket: ms[1], n: prefixes.length, rutas: prefixes })
      if (control.failStorage.has(ms[1])) return responder(500, { statusCode: '500', error: 'Internal', message: 'Storage caído' })
      if (!prefixes.every((p) => /^[\w\-\/.]+$/.test(p))) return responder(400, { message: 'ruta inválida' })
      const borrados = sql(`delete from storage.objects where bucket_id = '${ms[1]}' and name in (${prefixes.map((p) => `'${p}'`).join(',')}) returning name`).split('\n').filter(Boolean)
      return responder(200, borrados.map((name) => ({ name })))
    }
    return responder(404, { message: 'ruta no simulada' })
  } catch (e) { return responder(500, { message: String(e) }) }
})

// ---------- Deno REAL ----------
let denoProc, stderrDeno = ''
async function arrancarDeno() {
  denoProc = spawn(C.deno, ['run', '--no-prompt', `--allow-net=127.0.0.1`, '--allow-env', `--import-map=${C.dir}/import_map.json`, `${REPO}supabase/functions/admin-eliminar-clinica/index.ts`],
    { env: { ...process.env, PORT: String(C.fn), SUPABASE_URL: `http://127.0.0.1:${C.gw}`, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICIO }, stdio: ['ignore', 'ignore', 'pipe'] })
  denoProc.stderr.on('data', (d) => { stderrDeno += d })
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${C.fn}/`, { method: 'OPTIONS' }); if (r.status === 200) return } catch { /* aún no */ } await new Promise((r) => setTimeout(r, 250)) }
  throw new Error('Deno no arrancó:\n' + stderrDeno)
}
async function llamar(token, cuerpo, { crudo } = {}) {
  const cab = { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  const r = await fetch(`http://127.0.0.1:${C.fn}/`, { method: 'POST', headers: cab, body: crudo ?? JSON.stringify(cuerpo) }); const t = await r.text(); let json = null; try { json = JSON.parse(t) } catch { /* texto */ }
  return { status: r.status, json, texto: t }
}

let total = 0, malos = 0; const todasLasRespuestas = []
function ok(titulo, cond, detalle = '') { total++; if (!cond) malos++; console.log(`${cond ? '  ✔' : '  ✘ FALLÓ'} ${titulo}${!cond && detalle ? `\n       → ${detalle}` : ''}`) }
const llamadasRpc = (nombre) => log.filter((l) => l.t === 'rest' && l.rpc === nombre).length
const marca = () => log.length
const desde = (i, tipo) => log.slice(i).filter((l) => l.t === tipo)
const cuerpoElim = (k, extra = {}) => ({ clinicaId: info(k).clinica, accion: 'eliminar', confirmarNombre: sql(`select nombre from clinicas where id = '${info(k).clinica}'`), confirmarDatosClinicos: true, ...extra })

await new Promise((r) => gateway.listen(C.gw, '127.0.0.1', r))
try {
  await arrancarDeno()
  console.log(`\nadmin-eliminar-clinica en DENO REAL (${execSync(`${C.deno} --version`, { encoding: 'utf8' }).split('\n')[0]}) · supabase-js 2.45.0 · PostgREST + PostgreSQL reales · Auth/Storage SIMULADOS\n`)
  const SA = uid('SA', 1), X9 = info('X9'), X1 = info('X1'), X2 = info('X2'), X3 = info('X3'), X4 = info('X4'), X5 = info('X5'), X6 = info('X6'), X7 = info('X7'), X8 = info('X8'), Y = info('Y')
  const tSA = jwtUsuario(SA); const y0 = huella(Y.clinica), x1h0 = huella(X1.clinica)
  const reg = async (...a) => { const r = await llamar(...a); todasLasRespuestas.push(r.texto); return r }

  console.log('1) AUTENTICACIÓN Y AUTORIZACIÓN (JWT real)')
  const a0 = auditoriaTotal(), r0 = marca()
  let r = await reg(null, cuerpoElim('X1')); ok('sin Authorization → 400 «Falta autenticación»', r.status === 400 && r.json.error === 'Falta autenticación', JSON.stringify(r.json))
  r = await reg('basura', cuerpoElim('X1')); ok('token que no es un JWT → «Token inválido»', r.json?.error === 'Token inválido', JSON.stringify(r.json))
  r = await reg(jwtUsuario(SA, ahora() - 60), cuerpoElim('X1')); ok('JWT EXPIRADO del superadmin → «Token inválido»', r.json?.error === 'Token inválido', JSON.stringify(r.json))
  r = await reg(jwtUsuario(SA, ahora() + 3600, 'otra-clave-secreta-cualquiera-1234567890'), cuerpoElim('X1')); ok('JWT firmado con OTRA clave → «Token inválido»', r.json?.error === 'Token inválido', JSON.stringify(r.json))
  r = await reg(ANON, cuerpoElim('X1')); ok('la clave anon como token (sin sub) → «Token inválido»', r.json?.error === 'Token inválido', JSON.stringify(r.json))
  r = await reg(jwtUsuario(crypto.randomUUID()), cuerpoElim('X1')); ok('usuario autenticado SIN perfil en SIRO → rechazado («No se encontró tu perfil»)', r.status === 400 && /No se encontró tu perfil/.test(r.json?.error ?? ''), JSON.stringify(r.json))
  r = await reg(jwtUsuario(X1.owner), cuerpoElim('X1')); ok('el PROPIETARIO de la clínica NO puede eliminarla: «No autorizado»', r.status === 400 && r.json.error === 'No autorizado', JSON.stringify(r.json))
  r = await reg(jwtUsuario(X1.dentista), cuerpoElim('X1')); ok('un dentista → «No autorizado»', r.json?.error === 'No autorizado', JSON.stringify(r.json))
  r = await reg(jwtUsuario(Y.owner), cuerpoElim('X1')); ok('el propietario de OTRA clínica → «No autorizado» (no hay acceso horizontal)', r.json?.error === 'No autorizado', JSON.stringify(r.json))
  r = await reg(jwtUsuario(X1.owner), { clinicaId: X1.clinica, accion: 'previsualizar' }); ok('…ni siquiera la vista previa: «No autorizado»', r.json?.error === 'No autorizado')
  r = await reg(jwtUsuario(X1.owner), { clinicaId: X1.clinica, accion: 'reintentar_limpieza' }); ok('…ni reanudar la limpieza ni consultar lo pendiente', r.json?.error === 'No autorizado' && (await reg(jwtUsuario(X1.owner), { clinicaId: X1.clinica, accion: 'limpieza_pendiente' })).json?.error === 'No autorizado')
  ok('en NINGUNO de esos rechazos se llamó a una función de la base destructiva, de vista previa ni de limpieza', ['fn_eliminar_clinica', 'fn_clinica_resumen_eliminacion', 'fn_limpieza_pendiente_clinica', 'fn_registrar_limpieza_clinica', 'fn_registrar_intento_eliminacion'].every((f) => desde(r0, 'rest').filter((l) => l.rpc === f).length === 0))
  ok('…y no se escribió nada (auditoría y clínica X1 intactas)', auditoriaTotal() === a0 && huella(X1.clinica) === x1h0)
  r = await reg(tSA, { accion: 'eliminar' }); ok('petición sin clinicaId → «Falta clinicaId»', r.json?.error === 'Falta clinicaId')
  r = await reg(tSA, { clinicaId: X1.clinica, accion: 'eliminar' }); ok('eliminar sin confirmarNombre → se exige', /confirmarNombre/.test(r.json?.error ?? ''))
  r = await reg(tSA, { clinicaId: X1.clinica, accion: 'borrar_todo' }); ok('acción desconocida → «Acción no válida»', r.json?.error === 'Acción no válida')
  r = await reg(tSA, null, { crudo: '{no es json' }); ok('cuerpo que no es JSON → error controlado (400), no un fallo del servidor', r.status === 400 && typeof r.json?.error === 'string')

  console.log('\n2) VISTA PREVIA (solo lectura) Y BLOQUEOS')
  const aPrev = auditoriaTotal()
  const prev = async (X) => (await reg(tSA, { clinicaId: X.clinica, accion: 'previsualizar' })).json?.resumen
  const p1 = await prev(X1); ok('X1 (suspendida, datos antiguos, políticas cumplidas): se puede eliminar; avisa de lo contractual', p1?.puede_eliminar === true && p1.advertencias?.[0]?.codigo === 'CONTRACTUAL_NO_EVALUADO', JSON.stringify(p1?.bloqueos))
  const codigos = (p) => (p?.bloqueos ?? []).map((b) => b.codigo).sort().join(',')
  ok('X6 (ACTIVA) → NO_SUSPENDIDA', codigos(await prev(X6)) === 'NO_SUSPENDIDA'); ok('X5 (ARCO sin resolver) → ARCO_PENDIENTE', codigos(await prev(X5)) === 'ARCO_PENDIENTE')
  ok('X7 (datos RECIENTES) → DENTRO_PLAZO_CONSERVACION y DENTRO_PLAZO_FISCAL (cada categoría por separado)', codigos(await prev(X7)) === 'DENTRO_PLAZO_CONSERVACION,DENTRO_PLAZO_FISCAL', codigos(await prev(X7)))
  ok('la vista previa no escribió nada (auditoría y clínica intactas)', auditoriaTotal() === aPrev && huella(X1.clinica) === x1h0)
  const intentos0 = auditoria('intento_eliminar_clinica_rechazado', X6.clinica) + auditoria('intento_eliminar_clinica_rechazado', X5.clinica) + auditoria('intento_eliminar_clinica_rechazado', X7.clinica)
  const m1 = marca()
  for (const X of [X6, X5, X7]) { r = await reg(tSA, cuerpoElim(X.k)); ok(`eliminar ${X.k} con nombre y confirmación correctos → 400 ELIMINACION_BLOQUEADA; la clínica sigue existiendo`, r.status === 400 && r.json.codigo === 'ELIMINACION_BLOQUEADA' && existe(X.clinica), JSON.stringify(r.json)) }
  ok('cada intento rechazado quedó REGISTRADO en la auditoría a nombre del superadmin', auditoria('intento_eliminar_clinica_rechazado', X6.clinica) + auditoria('intento_eliminar_clinica_rechazado', X5.clinica) + auditoria('intento_eliminar_clinica_rechazado', X7.clinica) === intentos0 + 3)
  ok('…y no se tocó Storage ni Auth', desde(m1, 'storage.delete').length === 0 && desde(m1, 'auth.delete').length === 0)
  r = await reg(tSA, cuerpoElim('X1', { confirmarNombre: 'clínica x1 ÉXITO' })); ok('nombre que no coincide (mayúsculas/acentos) → NOMBRE_NO_COINCIDE', r.json?.codigo === 'NOMBRE_NO_COINCIDE' && existe(X1.clinica))
  r = await reg(tSA, cuerpoElim('X1', { confirmarDatosClinicos: false })); ok('sin confirmar la destrucción de datos clínicos → CONFIRMACION_DATOS_CLINICOS', r.json?.codigo === 'CONFIRMACION_DATOS_CLINICOS' && existe(X1.clinica))
  sql(`delete from plataforma_config where clave = 'retencion_expediente_anios'`); r = await reg(tSA, cuerpoElim('X1'))
  ok('política de conservación NO definida → bloquea aunque todo lo demás esté en regla (el bloqueo preventivo se conserva)', r.json?.codigo === 'ELIMINACION_BLOQUEADA' && /política de conservación/.test(r.json.error) && existe(X1.clinica), JSON.stringify(r.json))
  sql(`insert into plataforma_config (clave, valor) values ('retencion_expediente_anios', '5')`)
  ok('un valor inyectado por el cliente (fecha/política en el cuerpo) no cambia nada: sigue bloqueada X7', (await reg(tSA, { ...cuerpoElim('X7'), conservarHasta: '2000-01-01', politica_anios: 1, retencion_expediente_anios: 1 })).json?.codigo === 'ELIMINACION_BLOQUEADA' && existe(X7.clinica))
  r = await reg(tSA, { ...cuerpoElim('X7'), solicitanteId: Y.owner, p_solicitante: Y.owner, solicitante: Y.owner })
  ok('un `solicitanteId` falsificado en el cuerpo se IGNORA: el solicitante sale del token (el rechazo es de CONSERVACIÓN, no «No autorizado», y la auditoría lo atribuye al superadmin)',
    r.json?.codigo === 'ELIMINACION_BLOQUEADA' && sql(`select usuario_id from auditoria where accion = 'intento_eliminar_clinica_rechazado' and entidad_id = '${X7.clinica}' order by creado_en desc limit 1`) === SA, JSON.stringify(r.json))

  console.log('\n3) ELIMINACIÓN COMPLETA (X1) Y AISLAMIENTO')
  const nombreX1 = sql(`select nombre from clinicas where id = '${X1.clinica}'`)
  const authIds1 = sql(`select id from usuarios where clinica_id = '${X1.clinica}'`).split('\n'), rutas1 = sql(`select name from storage.objects where name like '${X1.paciente}/%' or name like '${X1.clinica}/%'`).split('\n')
  const m2 = marca(); r = await reg(tSA, cuerpoElim('X1'))
  ok('200 con estado «eliminada_completa» y base_de_datos «eliminada»', r.status === 200 && r.json.estado === 'eliminada_completa' && r.json.base_de_datos === 'eliminada' && r.json.pendientes.total === 0, JSON.stringify(r.json))
  ok('la clínica y TODO lo que colgaba de ella desapareció (todas las tablas con clinica_id/paciente_id, notas, Storage y cuentas de Auth: cero)', !existe(X1.clinica) && Object.values(JSON.parse(huella(X1.clinica))).every((v) => v === 0))
  ok('las cuentas de Auth de sus usuarios se eliminaron (no quedan huérfanas)', authIds1.every((id) => sql(`select count(*) from auth.users where id = '${id}'`) === '0') && desde(m2, 'auth.delete').length === 2)
  ok('los archivos de Storage (fotos, documentos y logo) se eliminaron, por lotes y solo de ESA clínica', rutas1.length === 4 && rutas1.every((n) => sql(`select count(*) from storage.objects where name = '${n}'`) === '0') && desde(m2, 'storage.delete').flatMap((l) => l.rutas).every((n) => rutas1.includes(n)))
  ok('auditoría: eliminación (con las LISTAS de limpieza), limpieza registrada, a nombre del superadmin', auditoria('eliminar_clinica', X1.clinica) === 1 && auditoria('limpieza_eliminar_clinica', X1.clinica) === 1
     && sql(`select (detalle->'limpieza'->'cuentas_auth')::text from auditoria where accion='eliminar_clinica' and entidad_id='${X1.clinica}'`).includes(authIds1[0]) && sql(`select usuario_id from auditoria where accion='eliminar_clinica' and entidad_id='${X1.clinica}'`) === SA)
  ok('AISLAMIENTO: la clínica espectadora Y quedó EXACTAMENTE igual (datos, archivos y cuentas), y las demás clínicas de prueba siguen', huella(Y.clinica) === y0 && [X2, X3, X4, X5, X6, X7, X8].every((X) => existe(X.clinica)))
  // La clínica ya no existe: el nombre NO se puede consultar en la base; se usa el que se guardó antes de eliminarla.
  const m3 = marca(); r = await reg(tSA, { clinicaId: X1.clinica, accion: 'eliminar', confirmarNombre: nombreX1, confirmarDatosClinicos: true })
  ok('repetir la eliminación (reintento/duplicado) → 400 CLINICA_NO_ENCONTRADA, sin segunda auditoría ni llamadas a Storage/Auth', r.status === 400 && r.json.codigo === 'CLINICA_NO_ENCONTRADA' && auditoria('eliminar_clinica', X1.clinica) === 1 && desde(m3, 'storage.delete').length === 0 && desde(m3, 'auth.delete').length === 0, JSON.stringify(r.json))

  console.log('\n4) FALLO PARCIAL DE STORAGE (X2) Y REANUDACIÓN')
  const docX2 = `${X2.paciente}/d.pdf`; control.failStorage.add('documentos-clinicos'); r = await reg(tSA, cuerpoElim('X2'))
  ok('Storage falla en un bucket → estado «eliminada_con_limpieza_pendiente» (NUNCA «completa»), con el motivo; la base de datos sí quedó eliminada', r.status === 200 && r.json.estado === 'eliminada_con_limpieza_pendiente' && !existe(X2.clinica) && r.json.advertencias.join(' ').includes('Storage caído') && r.json.pendientes.archivos === 1, JSON.stringify(r.json))
  ok('el archivo que falló SIGUE en Storage; los demás se borraron', sql(`select count(*) from storage.objects where name = '${docX2}'`) === '1' && sql(`select count(*) from storage.objects where name like '${X2.paciente}/%' and name <> '${docX2}'`) === '0')
  ok('la auditoría conserva el fallo (qué bucket y por qué) y la lista original', sql(`select detalle->'fallos'->0->>'bucket' from auditoria where accion='limpieza_eliminar_clinica' and entidad_id='${X2.clinica}'`) === 'documentos-clinicos' && auditoria('eliminar_clinica', X2.clinica) === 1)
  r = await reg(tSA, { clinicaId: X2.clinica, accion: 'limpieza_pendiente' }); ok('«limpieza_pendiente» muestra exactamente lo que falta (1 archivo, 0 cuentas)', r.json?.total_pendiente === 1 && r.json.pendiente.archivos['documentos-clinicos'][0] === docX2 && r.json.limpieza_completa === false, JSON.stringify(r.json))
  control.failStorage.clear(); const m4 = marca(); r = await reg(tSA, { clinicaId: X2.clinica, accion: 'reintentar_limpieza' })
  ok('reanudar tras corregir la causa → «eliminada_completa»; solo reintentó lo pendiente (1 llamada a Storage, 0 a Auth) y NO volvió a eliminar la clínica', r.json?.estado === 'eliminada_completa' && desde(m4, 'storage.delete').length === 1 && desde(m4, 'auth.delete').length === 0 && llamadasRpc('fn_eliminar_clinica') === log.filter((l) => l.rpc === 'fn_eliminar_clinica').length && desde(m4, 'rest').filter((l) => l.rpc === 'fn_eliminar_clinica').length === 0, JSON.stringify(r.json))
  ok('reanudar la limpieza solo tocó rutas y cuentas de ESA clínica (X2): todo lo que se pidió borrar le pertenece, y la clínica espectadora Y quedó exactamente igual',
    desde(m4, 'storage.delete').flatMap((l) => l.rutas).every((n) => n.startsWith(`${X2.paciente}/`) || n.startsWith(`${X2.clinica}/`)) && desde(m4, 'auth.delete').every((l) => [X2.owner, X2.dentista].includes(l.id)) && huella(Y.clinica) === y0)
  const m5 = marca(); r = await reg(tSA, { clinicaId: X2.clinica, accion: 'reintentar_limpieza' }); ok('reanudar OTRA vez es idempotente: completa, sin trabajo pendiente ni llamadas a Storage/Auth', r.json?.estado === 'eliminada_completa' && desde(m5, 'storage.delete').length === 0 && desde(m5, 'auth.delete').length === 0)

  console.log('\n5) FALLO PARCIAL DE AUTH (X3)')
  control.failAuth.add(X3.owner); r = await reg(tSA, cuerpoElim('X3'))
  ok('una cuenta de Auth no se puede borrar → «eliminada_con_limpieza_pendiente»; la otra cuenta sí se eliminó', r.json?.estado === 'eliminada_con_limpieza_pendiente' && r.json.pendientes.cuentas === 1 && sql(`select count(*) from auth.users where id = '${X3.owner}'`) === '1' && sql(`select count(*) from auth.users where id = '${X3.dentista}'`) === '0', JSON.stringify(r.json))
  control.failAuth.clear(); r = await reg(tSA, { clinicaId: X3.clinica, accion: 'reintentar_limpieza' }); ok('reanudar → completa; la cuenta ya no existe', r.json?.estado === 'eliminada_completa' && sql(`select count(*) from auth.users where id = '${X3.owner}'`) === '0')

  console.log('\n6) CONCURRENCIA (X4: tres eliminaciones simultáneas)')
  const m6 = marca(); const rs = await Promise.all([reg(tSA, cuerpoElim('X4')), reg(tSA, cuerpoElim('X4')), reg(tSA, cuerpoElim('X4'))])
  const exitos = rs.filter((x) => x.status === 200), fallidos = rs.filter((x) => x.status !== 200)
  ok('exactamente UNA tiene éxito; las otras reciben un error controlado (CLINICA_NO_ENCONTRADA)', exitos.length === 1 && fallidos.length === 2 && fallidos.every((x) => x.json?.codigo === 'CLINICA_NO_ENCONTRADA'), JSON.stringify(rs.map((x) => x.json?.codigo ?? x.json?.estado)))
  ok('una sola auditoría de eliminación; Storage y Auth se limpiaron UNA vez (2 cuentas, archivos solo una vez); nada duplicado ni huérfano', auditoria('eliminar_clinica', X4.clinica) === 1 && desde(m6, 'auth.delete').length === 2 && desde(m6, 'storage.delete').flatMap((l) => l.rutas).length === 4 && Object.values(JSON.parse(huella(X4.clinica))).every((v) => v === 0))
  const r7 = await Promise.all([reg(tSA, { clinicaId: X2.clinica, accion: 'reintentar_limpieza' }), reg(tSA, { clinicaId: X2.clinica, accion: 'reintentar_limpieza' })])
  ok('reanudaciones SIMULTÁNEAS: ambas terminan bien y el resultado es coherente', r7.every((x) => x.json?.estado === 'eliminada_completa'))

  console.log('\n7) OTROS CASOS')
  r = await reg(tSA, { clinicaId: X5.clinica, accion: 'reintentar_limpieza' }); ok('reanudar la limpieza de una clínica que NO se eliminó → 400 «No hay una eliminación registrada» (no toca nada ajeno)', r.status === 400 && /no hay nada que reanudar/.test(r.json?.error ?? '') && existe(X5.clinica))
  const m8 = marca(); r = await reg(tSA, cuerpoElim('X8', { confirmarDatosClinicos: false })); ok('clínica SIN datos clínicos ni pagos (X8): se elimina sin política ni confirmación de datos, y limpia su logo y cuentas', r.json?.estado === 'eliminada_completa' && !existe(X8.clinica) && desde(m8, 'auth.delete').length === 2, JSON.stringify(r.json))
  ok('al final: Y y las clínicas bloqueadas (X5, X6, X7) siguen EXACTAMENTE como estaban', huella(Y.clinica) === y0 && [X5, X6, X7, Y].every((X) => existe(X.clinica)))
  console.log('\n8) ENTRADAS MALFORMADAS (superadmin): se rechazan con un mensaje fijo, sin llegar a la base y sin filtrar detalles internos')
  const h9 = huella(X9.clinica), m9 = marca(), nombre9 = sql(`select nombre from clinicas where id = '${X9.clinica}'`)
  const limpio = (x) => x.status === 400 && typeof x.json?.error === 'string' && !/uuid|invalid input|syntax|postgres|pgrst|violates|column|relation|function|\bat\s+\S+:\d+/i.test(x.json.error)
  for (const [etiqueta, cuerpo] of [['clinicaId que no es un UUID', { clinicaId: 'no-es-un-uuid', accion: 'previsualizar' }], ['clinicaId numérico', { clinicaId: 123, accion: 'eliminar', confirmarNombre: nombre9 }], ['clinicaId objeto', { clinicaId: { a: 1 }, accion: 'previsualizar' }],
    ['clinicaId arreglo', { clinicaId: [X9.clinica], accion: 'eliminar', confirmarNombre: nombre9 }], ["clinicaId con inyección SQL", { clinicaId: `${X9.clinica}'; drop table clinicas;--`, accion: 'eliminar', confirmarNombre: nombre9 }],
    ['accion que no es texto', { clinicaId: X9.clinica, accion: ['eliminar'] }], ['accion desconocida', { clinicaId: X9.clinica, accion: 'DROP' }],
    ['confirmarNombre que no es texto', { clinicaId: X9.clinica, accion: 'eliminar', confirmarNombre: { a: 1 }, confirmarDatosClinicos: true }], ['confirmarNombre de 200 000 caracteres', { clinicaId: X9.clinica, accion: 'eliminar', confirmarNombre: 'x'.repeat(200000), confirmarDatosClinicos: true }],
    ['confirmarDatosClinicos como TEXTO «false» (verdadero en JS)', { clinicaId: X9.clinica, accion: 'eliminar', confirmarNombre: nombre9, confirmarDatosClinicos: 'false' }]]) {
    r = await reg(tSA, cuerpo); ok(`${etiqueta} → 400 con mensaje limpio`, limpio(r), JSON.stringify(r.json)?.slice(0, 160)) }
  for (const crudo of ['null', '[]', '5', '"texto"']) { r = await reg(tSA, null, { crudo }); ok(`cuerpo JSON ${crudo} → 400 controlado`, limpio(r), JSON.stringify(r.json)?.slice(0, 160)) }
  ok('NINGUNA entrada malformada llegó a una función destructiva ni de limpieza, y la clínica X9 sigue intacta', desde(m9, 'rest').filter((l) => ['fn_eliminar_clinica', 'fn_limpieza_pendiente_clinica', 'fn_registrar_limpieza_clinica'].includes(l.rpc)).length === 0 && existe(X9.clinica) && huella(X9.clinica) === h9 && desde(m9, 'storage.delete').length === 0 && desde(m9, 'auth.delete').length === 0)
  console.log('\n9) ERRORES INESPERADOS DE LA BASE: se registran en el servidor y al cliente solo llega un mensaje genérico con un código técnico')
  const SECRETO = 'secreto_interno_fkey'; const interno = (cod, status) => ({ status, cuerpo: { code: cod, message: `insert or update on table "tabla_privada" violates foreign key constraint "${SECRETO}"`, details: 'Key (id)=(7) is not present', hint: null } })
  const stderr0 = stderrDeno.length
  control.failRpc.set('fn_clinica_resumen_eliminacion', interno('23503', 409)); r = await reg(tSA, { clinicaId: X9.clinica, accion: 'previsualizar' })
  ok('un fallo inesperado al previsualizar → 500 con mensaje GENÉRICO y código DB_23503; no se filtra el texto interno', r.status === 500 && r.json.codigo === 'DB_23503' && /No se pudo completar/.test(r.json.error) && !r.texto.includes(SECRETO) && !/tabla_privada|Key \(id\)/.test(r.texto), r.texto.slice(0, 200))
  control.failRpc.clear(); control.failRpc.set('fn_eliminar_clinica', interno('23503', 409)); r = await reg(tSA, cuerpoElim('X9'))
  ok('un fallo inesperado al ELIMINAR (sin hint de negocio) → 500 genérico con código; la clínica X9 sigue intacta y no se tocó Storage ni Auth', r.status === 500 && r.json.codigo === 'DB_23503' && !r.texto.includes(SECRETO) && existe(X9.clinica) && huella(X9.clinica) === h9, r.texto.slice(0, 200))
  control.failRpc.clear(); control.failRpc.set('fn_eliminar_clinica', { status: 400, cuerpo: { code: 'P0001', message: 'Dentro del plazo de conservación', details: null, hint: 'ELIMINACION_BLOQUEADA' } }); r = await reg(tSA, cuerpoElim('X9'))
  ok('un rechazo de NEGOCIO (con hint) sigue mostrando su mensaje y su código (no se vuelve genérico)', r.status === 400 && r.json.codigo === 'ELIMINACION_BLOQUEADA' && r.json.error === 'Dentro del plazo de conservación', r.texto.slice(0, 200))
  control.failRpc.clear()
  const nuevoStderr = stderrDeno.slice(stderr0)
  ok('los fallos inesperados SÍ quedaron registrados en el servidor (stderr), sin tokens ni claves', /error inesperado/.test(nuevoStderr) && /fallo inesperado de la base/.test(nuevoStderr) && ![SERVICIO, ANON, tSA].some((s) => nuevoStderr.includes(s)))
  const stderrEsperado = nuevoStderr
  const secretos = [SERVICIO, ANON, tSA]
  ok('ninguna respuesta de la función expone tokens, la clave de servicio ni trazas de error', todasLasRespuestas.every((t) => !secretos.some((s) => t.includes(s)) && !/\bat\s+\S+\.(ts|js):\d+/.test(t) && !/stack|Deno\./i.test(t)))
  ok('fuera de los fallos inyectados a propósito, la función no escribió nada más en su salida de error (stderr de Deno)', stderrDeno.replace(stderrEsperado, '').trim() === '', stderrDeno.replace(stderrEsperado, '').slice(0, 300))
} catch (e) { malos++; console.error('✘ ERROR DE EJECUCIÓN:', e.stack ?? e) }
finally { denoProc?.kill(); gateway.close() }
console.log(`\n${malos ? '✘' : '✔'} ${total - malos}/${total} comprobaciones correctas`); process.exit(malos ? 1 : 0)
