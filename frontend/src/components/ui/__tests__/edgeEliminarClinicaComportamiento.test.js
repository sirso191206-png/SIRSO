// Comportamiento REAL del código de la Edge Function admin-eliminar-clinica, ejecutado en Node con clientes de Supabase simulados.
// Cubre lo que importa tras el commit de PostgreSQL: Auth y Storage NO comparten transacción con la base, así que pueden fallar
// por separado — y la respuesta y el registro deben decir la verdad. LIMITE: no es el runtime de Deno ni Supabase real.
// Contrato vigente (migración 108 + versión de la función validada en v9): solo se borran rutas con el prefijo UUID del paciente o de la
// clínica, cada cuenta se confirma con fn_cuenta_auth_eliminable antes de borrarla, y el avance se registra POR LOTES (no en una sola llamada final).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'

const FUENTE = readFileSync(new URL('../../../../../supabase/functions/admin-eliminar-clinica/index.ts', import.meta.url), 'utf8')
const SA = 'sa-1'
// La función VALIDA el cuerpo antes de tocar la base: el id de la clínica debe ser un UUID (los ids de utilería como 'c-1' ya se rechazan).
const CLINICA = '11111111-1111-4111-8111-111111111111'

function cargar(escenario) {
  const llamadas = []
  const estado = { borrados: 0 }   // lo registrado como limpio en ESTA petición (el registro va por lotes)
  let handler
  const sinImports = FUENTE.replace(/^import .*$/gm, '')
  const { code } = transformSync(sinImports, { loader: 'ts', format: 'esm' })
  const crear = (url, clave) => {
    if (clave === 'anon') return { auth: { getUser: async (t) => (t === 'token-valido' ? { data: { user: { id: SA } }, error: null } : { data: { user: null }, error: { message: 'bad' } }) } }
    return {
      from: (tabla) => { const q = { select: () => q, eq: () => q, single: async () => ({ data: { es_super_admin: escenario.superadmin !== false }, error: null }) }; llamadas.push(['from', tabla]); return q },
      rpc: async (nombre, args) => { llamadas.push(['rpc', nombre, args]); return escenario.rpc(nombre, args, estado) },
      storage: { from: (bucket) => ({ remove: async (rutas) => { llamadas.push(['storage.remove', bucket, rutas]); return escenario.storage ? escenario.storage(bucket, rutas) : { error: null } } }) },
      auth: { admin: { deleteUser: async (id) => { llamadas.push(['auth.deleteUser', id]); return escenario.auth ? escenario.auth(id) : { error: null } } } }
    }
  }
  new Function('serve', 'createClient', 'buildCorsHeaders', 'Deno', code)((h) => { handler = h }, crear, () => ({}), { env: { get: (k) => ({ SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' })[k] } })
  const pedir = async (cuerpo, token = 'token-valido') => {
    const r = await handler(new Request('https://x/', { method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }))
    return { status: r.status, json: await r.json() }
  }
  return { pedir, llamadas }
}
const nombres = (llamadas, tipo) => llamadas.filter((l) => l[0] === tipo)
// Todo lo registrado en la petición, sumando los lotes: mismos campos que la antigua llamada única.
const registrado = (llamadas) => {
  const regs = nombres(llamadas, 'rpc').filter((l) => l[1] === 'fn_registrar_limpieza_clinica').map((l) => l[2])
  const archivos = {}
  for (const r of regs) for (const [b, rutas] of Object.entries(r.p_archivos_borrados)) archivos[b] = [...(archivos[b] ?? []), ...rutas]
  return { p_clinica: regs[0]?.p_clinica, p_solicitante: regs[0]?.p_solicitante, p_archivos_borrados: archivos,
    p_cuentas_borradas: regs.flatMap((r) => r.p_cuentas_borradas), p_fallos: regs.flatMap((r) => r.p_fallos), llamadas: regs.length }
}
// Rutas con el prefijo UUID del paciente (fotos y documentos) o de la clínica (logo), como las que devuelve fn_eliminar_clinica.
const PACIENTE = '22222222-2222-4222-8222-222222222222'
const RESULTADO = { ok: true, nombre: 'C', conteos: { pacientes: 2 }, rutas_storage: { 'fotos-clinicas': [`${PACIENTE}/a.jpg`, `${PACIENTE}/b.jpg`], 'documentos-clinicos': [`${PACIENTE}/d.pdf`], 'logos-clinicas': [`${CLINICA}/logo.png`] }, cuentas_auth: ['u1', 'u2'] }
const eliminarOk = (nombre, args, estado = { borrados: 0 }) => {
  if (nombre === 'fn_eliminar_clinica') return { data: RESULTADO, error: null }
  if (nombre === 'fn_cuenta_auth_eliminable') return { data: 'OK', error: null }   // la base confirma que la cuenta es de la clínica eliminada
  if (nombre === 'fn_registrar_limpieza_clinica') {
    estado.borrados += Object.values(args.p_archivos_borrados).flat().length + args.p_cuentas_borradas.length
    const total = 4 + 2 - estado.borrados // 4 archivos (2 fotos, 1 documento, 1 logo) + 2 cuentas
    return { data: { existe: true, total_pendiente: total, limpieza_completa: total === 0, pendiente: { archivos: {}, cuentas_auth: [] } }, error: null }
  }
  return { data: null, error: null }
}
const CUERPO = { clinicaId: CLINICA, accion: 'eliminar', confirmarNombre: 'C', confirmarDatosClinicos: true }

describe('autorización y entrada', () => {
  it('sin token o con un token inválido: 400 y NINGUNA llamada a la base', async () => {
    const a = cargar({ rpc: eliminarOk }); expect((await a.pedir(CUERPO, null)).status).toBe(400); expect(nombres(a.llamadas, 'rpc')).toHaveLength(0)
    const b = cargar({ rpc: eliminarOk }); expect((await b.pedir(CUERPO, 'malo')).json.error).toMatch(/Token inválido/); expect(nombres(b.llamadas, 'rpc')).toHaveLength(0)
  })
  it('un usuario que NO es superadmin recibe «No autorizado» y no se ejecuta ninguna función ni limpieza', async () => {
    const e = cargar({ rpc: eliminarOk, superadmin: false }); const r = await e.pedir(CUERPO)
    expect(r.status).toBe(400); expect(r.json.error).toBe('No autorizado'); expect(nombres(e.llamadas, 'rpc')).toHaveLength(0); expect(nombres(e.llamadas, 'storage.remove')).toHaveLength(0); expect(nombres(e.llamadas, 'auth.deleteUser')).toHaveLength(0)
  })
  it('el solicitante sale del TOKEN, nunca del cuerpo; y el cliente no puede inyectar fechas, plazos ni políticas: la RPC recibe exactamente 4 parámetros', async () => {
    const e = cargar({ rpc: eliminarOk })
    await e.pedir({ ...CUERPO, solicitanteId: 'atacante', p_solicitante: 'atacante', conservarHasta: '2000-01-01', politica_anios: 0, retencion_expediente_anios: 0, fecha: '2000-01-01', forzar: true })
    const [, , args] = nombres(e.llamadas, 'rpc').find((l) => l[1] === 'fn_eliminar_clinica')
    expect(Object.keys(args).sort()).toEqual(['p_clinica', 'p_confirmar_datos_clinicos', 'p_confirmar_nombre', 'p_solicitante']); expect(args.p_solicitante).toBe(SA)
  })
  it('la confirmación de datos clínicos viaja SOLO si es exactamente true; ausente o false → false; cualquier valor que no sea booleano se RECHAZA sin llegar a la base', async () => {
    const enviado = async (v, conClave = true) => { const e = cargar({ rpc: eliminarOk }); const r = await e.pedir(conClave ? { ...CUERPO, confirmarDatosClinicos: v } : (({ confirmarDatosClinicos: _omitido, ...sin }) => sin)(CUERPO)); return { r, rpc: nombres(e.llamadas, 'rpc').find((l) => l[1] === 'fn_eliminar_clinica') } }
    expect((await enviado(true)).rpc[2].p_confirmar_datos_clinicos).toBe(true)
    expect((await enviado(false)).rpc[2].p_confirmar_datos_clinicos).toBe(false); expect((await enviado(undefined, false)).rpc[2].p_confirmar_datos_clinicos).toBe(false)
    for (const v of ['true', 'false', 1, 0, null, {}, []]) { const { r, rpc } = await enviado(v); expect(r.status, String(JSON.stringify(v))).toBe(400); expect(r.json.error).toMatch(/verdadero o falso/); expect(rpc, 'no debe llegar a la base').toBeUndefined() }
  })
  it('acción desconocida o sin confirmarNombre: error sin tocar nada', async () => {
    const a = cargar({ rpc: eliminarOk }); expect((await a.pedir({ ...CUERPO, accion: 'borrar_todo' })).json.error).toBe('Acción no válida'); expect(nombres(a.llamadas, 'rpc')).toHaveLength(0)
    const b = cargar({ rpc: eliminarOk }); expect((await b.pedir({ clinicaId: CLINICA, accion: 'eliminar' })).json.error).toMatch(/confirmarNombre/); expect(nombres(b.llamadas, 'rpc')).toHaveLength(0)
  })
})

describe('rechazo de la base de datos (nada se borró)', () => {
  const rechazo = (nombre) => (nombre === 'fn_eliminar_clinica' ? { data: null, error: { message: 'Dentro del plazo de conservación', hint: 'ELIMINACION_BLOQUEADA' } } : { data: null, error: null })
  it('devuelve 400 con el motivo y el código, REGISTRA el intento rechazado, y NO toca Storage ni Auth', async () => {
    const e = cargar({ rpc: rechazo }); const r = await e.pedir(CUERPO)
    expect(r.status).toBe(400); expect(r.json).toMatchObject({ error: 'Dentro del plazo de conservación', codigo: 'ELIMINACION_BLOQUEADA' })
    const intento = nombres(e.llamadas, 'rpc').find((l) => l[1] === 'fn_registrar_intento_eliminacion')
    expect(intento[2]).toEqual({ p_clinica: CLINICA, p_solicitante: SA, p_codigo: 'ELIMINACION_BLOQUEADA', p_mensaje: 'Dentro del plazo de conservación' })
    expect(nombres(e.llamadas, 'storage.remove')).toHaveLength(0); expect(nombres(e.llamadas, 'auth.deleteUser')).toHaveLength(0); expect(nombres(e.llamadas, 'rpc').some((l) => l[1] === 'fn_registrar_limpieza_clinica')).toBe(false)
  })
  it('si registrar el intento falla, el rechazo se devuelve igual (mejor esfuerzo)', async () => {
    const e = cargar({ rpc: (n) => (n === 'fn_registrar_intento_eliminacion' ? Promise.reject(new Error('caído')) : rechazo(n)) }); const r = await e.pedir(CUERPO)
    expect(r.status).toBe(400); expect(r.json.codigo).toBe('ELIMINACION_BLOQUEADA')
  })
})

describe('tras el commit: Auth y Storage pueden fallar por separado', () => {
  it('todo sale bien → eliminada_completa, y se registra TODO lo limpiado', async () => {
    const e = cargar({ rpc: eliminarOk }); const r = await e.pedir(CUERPO)
    expect(r.status).toBe(200); expect(r.json).toMatchObject({ ok: true, base_de_datos: 'eliminada', estado: 'eliminada_completa', advertencias: [], pendientes: { total: 0 } })
    const reg = registrado(e.llamadas)
    expect(reg).toMatchObject({ p_clinica: CLINICA, p_solicitante: SA, p_cuentas_borradas: ['u1', 'u2'], p_fallos: [] }); expect(reg.p_archivos_borrados['fotos-clinicas']).toEqual([`${PACIENTE}/a.jpg`, `${PACIENTE}/b.jpg`])
    expect(reg.p_archivos_borrados['documentos-clinicos']).toEqual([`${PACIENTE}/d.pdf`]); expect(reg.p_archivos_borrados['logos-clinicas']).toEqual([`${CLINICA}/logo.png`])
  })
  it('orden: la base de datos primero; Storage y Auth después de su commit; nada se registra antes del commit y el ÚLTIMO registro va al final', async () => {
    const e = cargar({ rpc: eliminarOk }); await e.pedir(CUERPO)
    const idx = (f) => e.llamadas.findIndex(f), ultimo = (f) => e.llamadas.map((l, i) => (f(l) ? i : -1)).reduce((a, b) => Math.max(a, b), -1)
    const iBase = idx((l) => l[1] === 'fn_eliminar_clinica'), iSto = idx((l) => l[0] === 'storage.remove'), iAuth = idx((l) => l[0] === 'auth.deleteUser')
    const iReg = idx((l) => l[1] === 'fn_registrar_limpieza_clinica'), uReg = ultimo((l) => l[1] === 'fn_registrar_limpieza_clinica')
    const uSto = ultimo((l) => l[0] === 'storage.remove'), uAuth = ultimo((l) => l[0] === 'auth.deleteUser')
    expect(iBase).toBeGreaterThan(-1); expect(iSto).toBeGreaterThan(iBase); expect(iAuth).toBeGreaterThan(iBase); expect(iReg).toBeGreaterThan(iSto)
    expect(uReg).toBeGreaterThan(Math.max(uSto, uAuth))
  })
  it('FALLA Storage en un bucket: eliminada_con_limpieza_pendiente (NUNCA «completa»), el fallo se informa y se registra, y solo se anota como limpio lo que sí se borró', async () => {
    const e = cargar({ rpc: eliminarOk, storage: (b) => (b === 'documentos-clinicos' ? { error: { message: 'Storage caído' } } : { error: null }) }); const r = await e.pedir(CUERPO)
    expect(r.json.estado).toBe('eliminada_con_limpieza_pendiente'); expect(r.json.advertencias.join(' ')).toMatch(/Storage caído/); expect(r.json.pendientes.total).toBe(1)
    const reg = registrado(e.llamadas)
    expect(reg.p_archivos_borrados['documentos-clinicos']).toBeUndefined(); expect(reg.p_archivos_borrados['fotos-clinicas']).toHaveLength(2); expect(reg.p_fallos[0]).toMatchObject({ tipo: 'archivos', bucket: 'documentos-clinicos', motivo: 'Storage caído' })
  })
  it('FALLA el borrado de UNA cuenta de Auth: se informa con su id y motivo, y la otra cuenta sí se limpia', async () => {
    const e = cargar({ rpc: eliminarOk, auth: (id) => (id === 'u2' ? { error: { message: 'Database error deleting user' } } : { error: null }) }); const r = await e.pedir(CUERPO)
    expect(r.json.estado).toBe('eliminada_con_limpieza_pendiente'); expect(nombres(e.llamadas, 'auth.deleteUser')).toHaveLength(2)
    const reg = registrado(e.llamadas)
    expect(reg.p_cuentas_borradas).toEqual(['u1']); expect(reg.p_fallos).toContainEqual({ tipo: 'cuenta', id: 'u2', motivo: 'Database error deleting user' })
  })
  it('«User not found» NO es un fallo: la cuenta ya no existía, que es lo buscado', async () => {
    const e = cargar({ rpc: eliminarOk, auth: () => ({ error: { message: 'User not found' } }) }); const r = await e.pedir(CUERPO)
    expect(r.json.estado).toBe('eliminada_completa'); expect(registrado(e.llamadas).p_cuentas_borradas).toEqual(['u1', 'u2'])
  })
  it('si NI SIQUIERA se puede registrar el avance, NO se afirma que está completa: pendientes desconocidos y el motivo en las advertencias', async () => {
    const e = cargar({ rpc: (n, a, s) => (n === 'fn_registrar_limpieza_clinica' ? { data: null, error: { message: 'auditoría no disponible' } } : eliminarOk(n, a, s)) }); const r = await e.pedir(CUERPO)
    expect(r.status).toBe(200); expect(r.json.estado).toBe('eliminada_con_limpieza_pendiente'); expect(r.json.pendientes).toEqual({ desconocido: true }); expect(r.json.advertencias.join(' ')).toMatch(/auditoría no disponible/)
  })
  it('Storage se llama por LOTES de 100 (250 archivos → 3 llamadas)', async () => {
    const rutas = Array.from({ length: 250 }, (_, i) => `${PACIENTE}/${i}.jpg`)
    const e = cargar({ rpc: (n, a, s) => (n === 'fn_eliminar_clinica' ? { data: { ...RESULTADO, rutas_storage: { 'fotos-clinicas': rutas }, cuentas_auth: [] }, error: null } : eliminarOk(n, a, s)) }); await e.pedir(CUERPO)
    expect(nombres(e.llamadas, 'storage.remove').map((l) => l[2].length)).toEqual([100, 100, 50])
  })
})

// Defensas del contrato vigente (nuevas respecto a la versión anterior del test).
describe('solo se borra lo que la base aprueba', () => {
  it('una ruta sin el prefijo UUID, con «..» o un logo de OTRA clínica NO se envía a Storage: se descarta, se informa y la limpieza queda pendiente', async () => {
    const rutas = { 'fotos-clinicas': [`${PACIENTE}/ok.jpg`, 'sin-uuid/x.jpg', `${PACIENTE}/../otra/x.jpg`], 'logos-clinicas': ['33333333-3333-4333-8333-333333333333/logo.png'] }
    const e = cargar({ rpc: (n, a, s) => (n === 'fn_eliminar_clinica' ? { data: { ...RESULTADO, rutas_storage: rutas, cuentas_auth: [] }, error: null } : eliminarOk(n, a, s)) }); const r = await e.pedir(CUERPO)
    const enviadas = nombres(e.llamadas, 'storage.remove').flatMap((l) => l[2])
    expect(enviadas).toEqual([`${PACIENTE}/ok.jpg`]); expect(r.json.estado).toBe('eliminada_con_limpieza_pendiente'); expect(r.json.advertencias.join(' ')).toMatch(/ruta descartada por validación/)
  })
  it('una cuenta que la base NO aprueba (p. ej. CUENTA_AJENA) NO se borra; la aprobada sí; el motivo queda registrado', async () => {
    const e = cargar({ rpc: (n, a, s) => (n === 'fn_cuenta_auth_eliminable' ? { data: a.p_cuenta === 'u2' ? 'CUENTA_AJENA' : 'OK', error: null } : eliminarOk(n, a, s)) }); const r = await e.pedir(CUERPO)
    expect(nombres(e.llamadas, 'auth.deleteUser')).toEqual([['auth.deleteUser', 'u1']]); expect(r.json.estado).toBe('eliminada_con_limpieza_pendiente')
    expect(registrado(e.llamadas).p_fallos).toContainEqual({ tipo: 'cuenta', id: 'u2', motivo: 'no eliminable: CUENTA_AJENA' })
  })
  it('aunque la base informe «limpieza completa», si en ESTA petición hubo un fallo NO se declara completa', async () => {
    const e = cargar({ rpc: (n, a, s) => (n === 'fn_registrar_limpieza_clinica' ? { data: { existe: true, total_pendiente: 0, limpieza_completa: true, pendiente: {} }, error: null } : eliminarOk(n, a, s)),
      storage: (b) => (b === 'documentos-clinicos' ? { error: { message: 'Storage caído' } } : { error: null }) }); const r = await e.pedir(CUERPO)
    expect(r.json.estado).toBe('eliminada_con_limpieza_pendiente'); expect(r.json.advertencias.join(' ')).toMatch(/Storage caído/)
  })
  it('reanudar la limpieza de una clínica que AÚN existe: error y sin tocar Storage ni Auth', async () => {
    const e = cargar({ rpc: (n) => (n === 'fn_limpieza_pendiente_clinica' ? { data: { existe: true, error: 'CLINICA_AUN_EXISTE' }, error: null } : { data: null, error: null }) })
    const r = await e.pedir({ clinicaId: CLINICA, accion: 'reintentar_limpieza' })
    expect(r.status).toBe(400); expect(r.json.error).toMatch(/sigue existiendo/); expect(nombres(e.llamadas, 'storage.remove')).toHaveLength(0); expect(nombres(e.llamadas, 'auth.deleteUser')).toHaveLength(0)
  })
})

describe('reanudar la limpieza de una clínica ya eliminada', () => {
  const PEND = { existe: true, pendiente: { archivos: { 'fotos-clinicas': [`${PACIENTE}/b.jpg`] }, cuentas_auth: ['u2'] }, total_pendiente: 2, limpieza_completa: false }
  it('solo procesa lo que sigue pendiente, NO vuelve a eliminar la clínica, y registra el resultado', async () => {
    const e = cargar({ rpc: (n) => (n === 'fn_limpieza_pendiente_clinica' ? { data: PEND, error: null } : n === 'fn_cuenta_auth_eliminable' ? { data: 'OK', error: null } : n === 'fn_registrar_limpieza_clinica' ? { data: { existe: true, total_pendiente: 0, limpieza_completa: true, pendiente: {} }, error: null } : { data: null, error: null }) })
    const r = await e.pedir({ clinicaId: CLINICA, accion: 'reintentar_limpieza' })
    expect(r.json.estado).toBe('eliminada_completa'); expect(nombres(e.llamadas, 'rpc').some((l) => l[1] === 'fn_eliminar_clinica')).toBe(false)
    expect(nombres(e.llamadas, 'storage.remove')).toEqual([['storage.remove', 'fotos-clinicas', [`${PACIENTE}/b.jpg`]]]); expect(nombres(e.llamadas, 'auth.deleteUser')).toEqual([['auth.deleteUser', 'u2']])
  })
  it('si no hay una eliminación registrada de esa clínica: error, sin tocar Storage ni Auth', async () => {
    const e = cargar({ rpc: (n) => (n === 'fn_limpieza_pendiente_clinica' ? { data: { existe: false }, error: null } : { data: null, error: null }) }); const r = await e.pedir({ clinicaId: CLINICA, accion: 'reintentar_limpieza' })
    expect(r.status).toBe(400); expect(r.json.error).toMatch(/no hay nada que reanudar/); expect(nombres(e.llamadas, 'storage.remove')).toHaveLength(0); expect(nombres(e.llamadas, 'auth.deleteUser')).toHaveLength(0)
  })
  it('la consulta de lo pendiente (limpieza_pendiente) es de solo lectura', async () => {
    const e = cargar({ rpc: (n) => ({ data: n === 'fn_limpieza_pendiente_clinica' ? PEND : null, error: null }) }); const r = await e.pedir({ clinicaId: CLINICA, accion: 'limpieza_pendiente' })
    expect(r.json).toMatchObject({ ok: true, total_pendiente: 2 }); expect(nombres(e.llamadas, 'storage.remove')).toHaveLength(0); expect(nombres(e.llamadas, 'auth.deleteUser')).toHaveLength(0)
  })
})
