// Comportamiento REAL (código y módulos compartidos reales, clientes de Supabase simulados) de las Edge Functions admin-listar-clinicas, admin-ver-clinica, admin-actualizar-clinica,
// admin-crear-clinica, crear-usuario, cambiar-password y sis-cifrar-archivo. LIMITE: no es el runtime de Deno ni Supabase real (PENDIENTE DE ENTORNO).
import { describe, it, expect } from 'vitest'
import { createDecipheriv } from 'node:crypto'
import { cargarEdge } from './helpers/cargarEdge.js'

const CL = '22222222-2222-4222-8222-222222222222'
const INTERNO = /relation|statement timeout|pg_|clinicas_|violates|constraint|bytes|SIS_CIFRADO|secret|already registered/i
const PWD = /^[A-HJ-NP-Za-km-z2-9]{16}$/
const perfilSuper = (extra = {}) => ({ data: { es_super_admin: true, clinica_id: null, rol: 'owner', ...extra }, error: null })
const esCaller = (f) => f.id === 'caller'

describe.each(['admin-listar-clinicas', 'admin-ver-clinica', 'admin-actualizar-clinica', 'admin-crear-clinica'])('%s — autorización (solo superadministrador)', (fn) => {
  it('sin Authorization, con token inválido o sin perfil se rechaza sin tocar nada', async () => {
    let e = cargarEdge(fn); expect((await e.pedir({}, null)).json.error).toBe('Falta autenticación'); expect(e.escrituras()).toEqual([])
    e = cargarEdge(fn); expect((await e.pedir({}, 'malo')).json.error).toBe('Token inválido')
    e = cargarEdge(fn, { db: () => ({ data: null, error: { message: 'no rows' } }) }); expect((await e.pedir({ clinicaId: CL })).json.error).toBe('No se encontró tu perfil')
  })
  it('un usuario que NO es superadministrador recibe «No autorizado» y no se lee ni se escribe nada más', async () => {
    const e = cargarEdge(fn, { db: ({ tabla, filtro }) => (tabla === 'usuarios' && esCaller(filtro) ? { data: { es_super_admin: false }, error: null } : { data: [], error: null }) })
    const r = await e.pedir({ clinicaId: CL, nombreClinica: 'X', ownerNombre: 'Y', ownerCorreo: 'a@b.mx', estado: 'activa' })
    expect(r.status).toBe(400); expect(r.json.error).toBe('No autorizado'); expect(e.escrituras()).toEqual([]); expect(e.llamadas.filter((l) => l[1] !== 'usuarios')).toEqual([])
  })
})

describe('admin-listar-clinicas', () => {
  it('devuelve las clínicas con sus conteos; un fallo interno de la base responde 500 GENÉRICO (sin nombres de tablas ni del error)', async () => {
    const db = ({ tabla, filtro }) => tabla === 'usuarios' && esCaller(filtro) ? perfilSuper() : tabla === 'clinicas' ? { data: [{ id: CL, nombre: 'A', creado_en: 'x' }], error: null } : { count: 2, error: null }
    const ok = await cargarEdge('admin-listar-clinicas', { db }).pedir({}); expect(ok.status).toBe(200); expect(ok.json).toEqual([{ id: CL, nombre: 'A', creado_en: 'x', totalPacientes: 2, totalUsuarios: 2 }])
    const mal = await cargarEdge('admin-listar-clinicas', { db: (a) => (a.tabla === 'clinicas' ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout on relation clinicas' } } : db(a)) }).pedir({})
    expect(mal.status).toBe(500); expect(JSON.stringify(mal.json)).not.toMatch(INTERNO); expect(mal.json.codigo).toBe('DB_57014')
  })
})

describe('admin-ver-clinica — acceso a datos personales de pacientes', () => {
  const datos = ({ tabla, filtro }) => tabla === 'usuarios' && esCaller(filtro) ? perfilSuper() : tabla === 'clinicas' ? { data: { id: CL, nombre: 'A' }, error: null }
    : tabla === 'pacientes' ? { data: [{ id: 'p1', nombre_completo: 'Ana Pérez', telefono: '5500', correo: 'a@x.mx', fecha_nacimiento: '2000-01-01' }], error: null } : tabla === 'usuarios' ? { data: [{ id: 'u1', nombre: 'Dr' }], error: null } : { data: null, error: null }
  it.each([[123], [{}], [[CL]], ["x'; drop table clinicas;--"], ['no-es-uuid']])('clinicaId %j → 400 «clinicaId inválido» sin consultar clínicas ni pacientes', async (id) => {
    const e = cargarEdge('admin-ver-clinica', { db: datos }); const r = await e.pedir({ clinicaId: id }); expect(r.status).toBe(400); expect(r.json.error).toBe('clinicaId inválido'); expect(e.llamadas.some((l) => l[1] === 'pacientes' || l[1] === 'clinicas')).toBe(false)
  })
  it('el acceso queda REGISTRADO antes de entregar los datos (con la clínica en el registro, para que su propietario lo vea)', async () => {
    const e = cargarEdge('admin-ver-clinica', { db: datos }); const r = await e.pedir({ clinicaId: CL }); expect(r.status).toBe(200); expect(r.json.pacientes[0].nombre_completo).toBe('Ana Pérez')
    const i = e.llamadas.findIndex((l) => l[0] === 'insert' && l[1] === 'auditoria'), j = e.llamadas.findIndex((l) => l[1] === 'pacientes')
    expect(i).toBeGreaterThan(-1); expect(i).toBeLessThan(j); expect(e.llamadas[i][3]).toMatchObject({ usuario_id: 'caller', accion: 'ver_clinica', entidad: 'clinicas', entidad_id: CL, clinica_id: CL })
  })
  it('si NO se puede registrar el acceso, NO se entregan los datos personales', async () => {
    const e = cargarEdge('admin-ver-clinica', { db: (a) => (a.tabla === 'auditoria' ? { error: { code: '42501', message: 'new row violates row-level security policy for table auditoria' } } : datos(a)) })
    const r = await e.pedir({ clinicaId: CL }); expect(r.status).toBe(500); expect(JSON.stringify(r.json)).not.toMatch(/Ana|5500|a@x\.mx|violates|auditoria/); expect(e.llamadas.some((l) => l[1] === 'pacientes')).toBe(false)
  })
})

describe('admin-actualizar-clinica', () => {
  const db = ({ tabla, filtro }) => tabla === 'usuarios' && esCaller(filtro) ? perfilSuper() : tabla === 'clinicas' ? { data: { id: CL }, error: null } : { data: null, error: null }
  it.each([['mañana'], [123], ['2026-13-45'], ['2026-02-30x'], [{}]])('una fecha inválida (%j) → 400 sin tocar la clínica', async (f) => {
    const e = cargarEdge('admin-actualizar-clinica', { db }); const r = await e.pedir({ clinicaId: CL, fechaVencimiento: f }); expect(r.status).toBe(400); expect(r.json.error).toMatch(/fecha válida/); expect(e.escrituras()).toEqual([])
  })
  it.each([[123], ['no-uuid'], [null], [{ a: 1 }]])('clinicaId %j inválido → 400', async (id) => { const e = cargarEdge('admin-actualizar-clinica', { db }); const r = await e.pedir({ clinicaId: id, estado: 'activa' }); expect(r.status).toBe(400); expect(e.escrituras()).toEqual([]) })
  it('cambios válidos se aplican; el plan y los límites NO se cambian por aquí; sin cambios → 400; un fallo interno → 500 genérico', async () => {
    const e = cargarEdge('admin-actualizar-clinica', { db }); const r = await e.pedir({ clinicaId: CL, estado: 'suspendida', fechaVencimiento: '2027-01-31' }); expect(r.status).toBe(200)
    expect(e.llamadas.find((l) => l[0] === 'update' && l[1] === 'clinicas')[3]).toMatchObject({ estado: 'suspendida', fecha_vencimiento: '2027-01-31' })
    expect((await cargarEdge('admin-actualizar-clinica', { db }).pedir({ clinicaId: CL, plan: 'pro' })).json.error).toMatch(/Cambiar plan/)
    expect((await cargarEdge('admin-actualizar-clinica', { db }).pedir({ clinicaId: CL })).json.error).toBe('No se enviaron cambios')
    const mal = await cargarEdge('admin-actualizar-clinica', { db: (a) => (a.tabla === 'clinicas' && a.op === 'update' ? { data: null, error: { code: '23514', message: 'violates check constraint clinicas_estado_check' } } : db(a)) }).pedir({ clinicaId: CL, estado: 'activa' })
    expect(mal.status).toBe(500); expect(JSON.stringify(mal.json)).not.toMatch(INTERNO)
  })
})

describe('admin-crear-clinica', () => {
  const db = ({ tabla, op, filtro }) => tabla === 'usuarios' && esCaller(filtro) ? perfilSuper() : tabla === 'planes_catalogo' ? { data: { plan: 'esencial', activo: true }, error: null } : tabla === 'clinicas' && op === 'select' ? { data: { id: CL, nombre: 'QA' }, error: null } : { data: null, error: null }
  const rpc = () => ({ data: { clinica_id: CL, suscripcion: { ok: 1 } }, error: null })
  const base = { nombreClinica: 'QA', ownerNombre: 'Dueña', ownerCorreo: ' Dueña@Example.com ', planCodigo: 'esencial', modalidad: 'mensual' }
  it.each([[{ autoRenovacion: 'si' }], [{ fechaFin: 'mañana' }], [{ nombreClinica: 'n'.repeat(151) }], [{ ownerNombre: 'n'.repeat(121) }], [{ ownerCorreo: 'sin-arroba' }], [{ nombreClinica: 123 }]])('entrada inválida %j → 400 y no se crea nada', async (extra) => {
    const e = cargarEdge('admin-crear-clinica', { db, rpc }); const r = await e.pedir({ ...base, ...extra }); expect(r.status).toBe(400); expect(e.escrituras()).toEqual([])
  })
  it.each([['null'], ['[]'], ['5'], ['{no json']])('cuerpo %s → 400 «Solicitud inválida»', async (crudo) => { const r = await cargarEdge('admin-crear-clinica', { db, rpc }).pedir(null, 'token-valido', crudo); expect(r.status).toBe(400); expect(r.json.error).toBe('Solicitud inválida') })
  it('crea la clínica y el dueño; la contraseña temporal es de 16 caracteres sin ambigüedades y distinta cada vez; el correo se normaliza', async () => {
    const e1 = cargarEdge('admin-crear-clinica', { db, rpc }), e2 = cargarEdge('admin-crear-clinica', { db, rpc }); const r1 = await e1.pedir(base), r2 = await e2.pedir(base)
    expect(r1.status).toBe(200); expect(r1.json.passwordTemporal).toMatch(PWD); expect(r2.json.passwordTemporal).not.toBe(r1.json.passwordTemporal); expect(r1.json.correo).toBe('dueña@example.com')
  })
  it('si falla la cuenta de Auth se DESHACE la clínica; un fallo interno del alta responde 500 genérico', async () => {
    const e = cargarEdge('admin-crear-clinica', { db, rpc, crearAuth: () => ({ data: null, error: { message: 'A user with this email address has already been registered' } }) }); const r = await e.pedir(base)
    expect(r.status).toBe(400); expect(e.llamadas.some((l) => l[0] === 'delete' && l[1] === 'clinicas')).toBe(true)
    const mal = await cargarEdge('admin-crear-clinica', { db, rpc: () => ({ data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid: "x"' } }) }).pedir(base); expect(mal.status).toBe(500); expect(JSON.stringify(mal.json)).not.toMatch(/syntax|uuid/)
  })
})

describe('crear-usuario', () => {
  const db = (extra = {}) => ({ tabla, op, filtro }) => tabla === 'usuarios' && esCaller(filtro) ? { data: { clinica_id: CL, rol: extra.rol ?? 'owner' }, error: null } : tabla === 'clinicas' ? { data: { estado: 'activa' }, error: null } : tabla === 'usuarios' && op === 'insert' && extra.errorAlta ? { error: extra.errorAlta } : { data: null, error: null }
  const pide = (cuerpo, esc = {}) => { const e = cargarEdge('crear-usuario', { db: db(esc.perfil), ...esc }); return e.pedir(cuerpo).then((r) => ({ ...r, e })) }
  const alta = { correo: ' Nuevo@Example.com ', nombre: ' Dra. Nueva ', rol: 'dentista' }
  it('solo el propietario puede crear usuarios (403); nunca otro propietario (403); rol y datos inválidos → 400', async () => {
    expect((await pide(alta, { perfil: { rol: 'dentista' } })).status).toBe(403)
    expect((await pide({ ...alta, rol: 'owner' })).status).toBe(403)
    for (const mala of [{ rol: 'superadmin' }, { rol: 5 }, { correo: 'sin-arroba' }, { correo: 5 }, { nombre: 'n'.repeat(121) }, { nombre: '   ' }, { nombre: ['x'] }]) { const r = await pide({ ...alta, ...mala }); expect(r.status, JSON.stringify(mala)).toBe(400); expect(r.e.escrituras()).toEqual([]) }
  })
  it('crea la cuenta en la clínica del PROPIETARIO (nunca la que diga el cuerpo), con correo normalizado y contraseña temporal fuerte; se audita', async () => {
    const { json, status, e } = await pide({ ...alta, clinica_id: '99999999-9999-4999-8999-999999999999', clinicaId: 'otra' })
    expect(status).toBe(200); expect(json.passwordTemporal).toMatch(PWD); expect(json.correo).toBe('nuevo@example.com')
    expect(e.llamadas.find((l) => l[0] === 'insert' && l[1] === 'usuarios')[3]).toMatchObject({ clinica_id: CL, rol: 'dentista', nombre: 'Dra. Nueva', correo: 'nuevo@example.com' })
    expect(e.llamadas.find((l) => l[0] === 'insert' && l[1] === 'auditoria')[3]).toMatchObject({ accion: 'crear_usuarios', usuario_id: 'caller' })
  })
  it('un correo YA registrado en cualquier clínica responde EXACTAMENTE igual que cualquier otro fallo de alta (no revela que la cuenta existe)', async () => {
    const dup = await pide(alta, { crearAuth: () => ({ data: null, error: { message: 'A user with this email address has already been registered' } }) })
    const otro = await pide(alta, { crearAuth: () => ({ data: null, error: { message: 'Database error creating new user' } }) })
    expect(dup.status).toBe(400); expect(dup.json).toEqual(otro.json); expect(dup.json.codigo).toBe('ALTA_NO_DISPONIBLE'); expect(JSON.stringify(dup.json)).not.toMatch(/already|registered|Database/)
  })
  it('si el alta del perfil falla: se DESHACE la cuenta de Auth; el límite del plan conserva su mensaje; un error interno responde genérico', async () => {
    const plan = await pide(alta, { perfil: { errorAlta: { code: 'PT402', message: 'Tu plan permite hasta 3 usuarios activos.' } } }); expect(plan.status).toBe(400); expect(plan.json.error).toBe('Tu plan permite hasta 3 usuarios activos.'); expect(plan.e.de('auth.deleteUser')).toHaveLength(1)
    const interno = await pide(alta, { perfil: { errorAlta: { code: '23505', message: 'duplicate key value violates unique constraint usuarios_correo_key' } } }); expect(interno.status).toBe(500); expect(JSON.stringify(interno.json)).not.toMatch(INTERNO); expect(interno.e.de('auth.deleteUser')).toHaveLength(1)
  })
})

describe('cambiar-password', () => {
  const db = ({ tabla }) => (tabla === 'usuarios' ? { data: { clinica_id: CL, es_super_admin: false }, error: null } : { data: { estado: 'activa' }, error: null })
  it.each([[['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']], [12345678], [{ length: 99 }], ['corta'], ['x'.repeat(129)], [null]])('contraseña inválida %j → 400 sin tocar Auth', async (password) => {
    const e = cargarEdge('cambiar-password', { db }); const r = await e.pedir({ password }); expect(r.status).toBe(400); expect(e.de('auth.updateUserById')).toHaveLength(0)
  })
  it('cambia SOLO la contraseña del propio solicitante; una clínica suspendida no puede; un fallo de Auth responde genérico', async () => {
    const e = cargarEdge('cambiar-password', { db }); const r = await e.pedir({ password: 'una-clave-larga-1', id: 'otro-usuario', usuarioId: 'otro' }); expect(r.status).toBe(200)
    expect(e.de('auth.updateUserById')).toEqual([['auth.updateUserById', 'caller', { password: 'una-clave-larga-1' }]])
    expect((await cargarEdge('cambiar-password', { db: (a) => (a.tabla === 'clinicas' ? { data: { estado: 'suspendida' }, error: null } : db(a)) }).pedir({ password: 'una-clave-larga-1' })).json.error).toMatch(/suspendida/)
    const mal = await cargarEdge('cambiar-password', { db, actualizarAuth: () => ({ error: { message: 'secret internal auth detail', status: 500 } }) }).pedir({ password: 'una-clave-larga-1' }); expect(mal.status).toBe(500); expect(JSON.stringify(mal.json)).not.toMatch(INTERNO)
  })
})

describe('sis-cifrar-archivo', () => {
  const LLAVE = Buffer.alloc(24, 7), env = { SIS_CIFRADO_LLAVE_B64: LLAVE.toString('base64') }
  const db = ({ rol }) => (rol === 'caller' ? { data: { id: 'caller' }, error: null } : { data: null, error: null })
  const B64 = (t) => Buffer.from(t).toString('base64')
  it('sin sesión o sin perfil se rechaza (401/403 lógico, sin cifrar)', async () => {
    expect((await cargarEdge('sis-cifrar-archivo', { db, env }).pedir({ contenidoBase64: B64('x'), nombreBase: 'A' }, null)).json.error).toBe('Falta autenticación')
    const r = await cargarEdge('sis-cifrar-archivo', { db: () => ({ data: null, error: null }), env }).pedir({ contenidoBase64: B64('x'), nombreBase: 'A' }); expect(r.status).toBe(403)
  })
  it.each([[{}], [{ SIS_CIFRADO_LLAVE_B64: 'AAAA' }], [{ SIS_CIFRADO_LLAVE_B64: '%%%no-base64%%%' }]])('la llave mal configurada (%j) responde 500 genérico SIN revelar el nombre del secreto ni su longitud', async (envMalo) => {
    const r = await cargarEdge('sis-cifrar-archivo', { db, env: { SIS_CIFRADO_LLAVE_B64: undefined, ...envMalo } }).pedir({ contenidoBase64: B64('x'), nombreBase: 'A' })
    expect(r.status).toBe(500); expect(r.json.codigo).toBe('CIFRADO_NO_CONFIGURADO'); expect(JSON.stringify(r.json)).not.toMatch(/SIS_CIFRADO|bytes|24|secrets/)
  })
  it.each([[{ contenidoBase64: 5, nombreBase: 'A' }], [{ contenidoBase64: '!!!!', nombreBase: 'A' }], [{ contenidoBase64: 'abc', nombreBase: 'A' }], [{ contenidoBase64: 'A'.repeat(8 * 1024 * 1024 + 4), nombreBase: 'A' }],
     [{ contenidoBase64: B64('x'), nombreBase: '../x' }], [{ contenidoBase64: B64('x'), nombreBase: '' }], [{ contenidoBase64: B64('x'), nombreBase: 'a b' }], [{ contenidoBase64: B64('x'), nombreBase: 'n'.repeat(81) }], [{ contenidoBase64: B64('x') }]])('entrada inválida → 400 sin cifrar', async (cuerpo) => {
    const r = await cargarEdge('sis-cifrar-archivo', { db, env }).pedir(cuerpo); expect(r.status).toBe(400); expect(r.json.archivoBase64).toBeUndefined()
  })
  it('cifra de verdad: OpenSSL descifra el resultado y recupera el original; el nombre lleva la extensión .CIF', async () => {
    const original = 'CSB|MCIMB|2410|contenido de prueba\n'.repeat(40)
    const r = await cargarEdge('sis-cifrar-archivo', { db, env }).pedir({ contenidoBase64: B64(original), nombreBase: 'CSB-MCIMB-2410' })
    expect(r.status).toBe(200); expect(r.json.nombreArchivo).toBe('CSB-MCIMB-2410.CIF')
    const d = createDecipheriv('des-ede3-ecb', LLAVE, null); const claro = Buffer.concat([d.update(Buffer.from(r.json.archivoBase64, 'base64')), d.final()]).toString()
    expect(claro).toBe(original); expect(r.json.archivoBase64).not.toContain(B64(original).slice(0, 20))
  })
})
