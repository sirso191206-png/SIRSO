// Cambio OBLIGATORIO de la contraseña temporal (migración 103) en las Edge Functions: código y módulos compartidos REALES, clientes de Supabase simulados.
// LIMITE: no es el runtime de Deno ni Supabase real (PENDIENTE DE ENTORNO: que `app_metadata` y `getUserById` se comporten así en Supabase Auth real).
import { describe, it, expect } from 'vitest'
import { cargarEdge } from './helpers/cargarEdge.js'

const CL = '22222222-2222-4222-8222-222222222222'
const perfil = (extra) => ({ data: { clinica_id: CL, rol: 'owner', es_super_admin: false, debe_cambiar_password: false, ...extra }, error: null })

describe.each([
  ['admin-listar-clinicas', {}, { es_super_admin: true }], ['admin-ver-clinica', { clinicaId: CL }, { es_super_admin: true }], ['admin-actualizar-clinica', { clinicaId: CL, estado: 'activa' }, { es_super_admin: true }],
  ['admin-crear-clinica', { nombreClinica: 'X', ownerNombre: 'Y', ownerCorreo: 'a@b.mx' }, { es_super_admin: true }], ['crear-usuario', { correo: 'a@b.mx', nombre: 'N', rol: 'dentista' }, { rol: 'owner' }],
  ['eliminar-usuario', { usuarioId: '11111111-1111-4111-8111-111111111111' }, { rol: 'owner' }], ['sis-cifrar-archivo', { contenidoBase64: 'QQ==', nombreBase: 'A' }, { id: 'caller' }]
])('%s con el cambio de contraseña PENDIENTE', (fn, cuerpo, rolPerfil) => {
  const env = { SIS_CIFRADO_LLAVE_B64: Buffer.alloc(24, 7).toString('base64') }
  it('se rechaza con 403 CAMBIO_PASSWORD_PENDIENTE sin ninguna lectura de datos ni escritura', async () => {
    const e = cargarEdge(fn, { env, db: ({ tabla, filtro }) => (tabla === 'usuarios' && filtro.id === 'caller' ? perfil({ ...rolPerfil, debe_cambiar_password: true }) : { data: [], error: null }) })
    const r = await e.pedir(cuerpo); expect(r.status).toBe(403); expect(r.json.codigo).toBe('CAMBIO_PASSWORD_PENDIENTE'); expect(e.escrituras()).toEqual([]); expect(e.llamadas.filter((l) => l[1] !== 'usuarios')).toEqual([])
  })
  it('CONTROL: el mismo usuario SIN el cambio pendiente no queda bloqueado por este control', async () => {
    const e = cargarEdge(fn, { env, db: ({ tabla, filtro }) => (tabla === 'usuarios' && filtro.id === 'caller' ? perfil({ ...rolPerfil }) : { data: [], error: null }) })
    const r = await e.pedir(cuerpo); expect(r.json.codigo).not.toBe('CAMBIO_PASSWORD_PENDIENTE')
  })
})

describe('las cuentas nuevas con contraseña temporal nacen con el cambio pendiente', () => {
  it('crear-usuario inserta el perfil con debe_cambiar_password = true', async () => {
    const e = cargarEdge('crear-usuario', { db: ({ tabla, filtro }) => (tabla === 'usuarios' && filtro.id === 'caller' ? perfil({}) : tabla === 'clinicas' ? { data: { estado: 'activa' }, error: null } : { data: null, error: null }) })
    const r = await e.pedir({ correo: 'n@x.mx', nombre: 'Nueva', rol: 'dentista' }); expect(r.status).toBe(200)
    expect(e.llamadas.find((l) => l[0] === 'insert' && l[1] === 'usuarios')[3]).toMatchObject({ rol: 'dentista', debe_cambiar_password: true })
  })
  it('admin-crear-clinica inserta al DUEÑO con debe_cambiar_password = true', async () => {
    const db = ({ tabla, op, filtro }) => tabla === 'usuarios' && filtro.id === 'caller' ? perfil({ es_super_admin: true }) : tabla === 'planes_catalogo' ? { data: { plan: 'esencial', activo: true }, error: null } : tabla === 'clinicas' && op === 'select' ? { data: { id: CL, nombre: 'QA' }, error: null } : { data: null, error: null }
    const e = cargarEdge('admin-crear-clinica', { db, rpc: () => ({ data: { clinica_id: CL, suscripcion: {} }, error: null }) })
    const r = await e.pedir({ nombreClinica: 'QA', ownerNombre: 'D', ownerCorreo: 'd@x.mx', planCodigo: 'esencial', modalidad: 'mensual', fechaFin: '2099-12-31' }); expect(r.status).toBe(200)
    expect(e.llamadas.find((l) => l[0] === 'insert' && l[1] === 'usuarios')[3]).toMatchObject({ rol: 'owner', debe_cambiar_password: true })
  })
})

describe('cambiar-password — el indicador se quita SOLO después de un cambio real', () => {
  const NUEVA = 'otra-clave-segura-9'
  // estado simulado del indicador en la base
  function escenario({ pendiente = true, quitarFalla = false, authFalla = false, rotada = false, igualALaTemporal = false, suspendida = false, sonda = null } = {}) {
    const estado = { flag: pendiente }
    const db = ({ tabla, op, filtro }) => {
      if (tabla === 'usuarios' && op === 'select' && filtro.id === 'caller') return perfil({ debe_cambiar_password: estado.flag })
      if (tabla === 'usuarios' && op === 'update') { if (!quitarFalla) estado.flag = false; return { data: null, error: null } }
      if (tabla === 'clinicas') return { data: { estado: suspendida ? 'suspendida' : 'activa' }, error: null }
      return { data: null, error: null }
    }
    return { estado, e: cargarEdge('cambiar-password', { db, usuarioId: 'caller',
      obtenerAuth: () => ({ data: { user: { id: 'caller', app_metadata: rotada ? { password_rotada_en: '2026-01-01T00:00:00Z' } : {} } }, error: null }),
      actualizarAuth: () => (authFalla ? { error: { message: 'secret internal auth detail' } } : { error: null }),
      iniciarSesion: () => (sonda ?? (igualALaTemporal ? { data: { session: {} }, error: null } : { data: null, error: { message: 'Invalid login credentials', status: 400 } })) }) }
  }
  it('usuario SIN cambio pendiente: cambia la contraseña como siempre, sin sondeo de inicio de sesión ni tocar el indicador', async () => {
    const { e } = escenario({ pendiente: false }); const r = await e.pedir({ password: NUEVA }); expect(r.status).toBe(200)
    expect(e.de('auth.updateUserById')).toEqual([['auth.updateUserById', 'caller', { password: NUEVA }]]); expect(e.de('auth.signInWithPassword')).toHaveLength(0); expect(e.de('update')).toHaveLength(0)
  })
  it('con cambio pendiente, una contraseña IGUAL a la temporal se rechaza y el indicador SIGUE puesto', async () => {
    const { e, estado } = escenario({ igualALaTemporal: true }); const r = await e.pedir({ password: NUEVA }); expect(r.status).toBe(400); expect(r.json.codigo).toBe('PASSWORD_IGUAL_A_LA_TEMPORAL')
    expect(e.de('auth.updateUserById')).toHaveLength(0); expect(estado.flag).toBe(true)
  })
  it('con cambio pendiente y una contraseña distinta: se cambia (con marcador en Auth), se quita el indicador, se audita y se responde ok', async () => {
    const { e, estado } = escenario(); const r = await e.pedir({ password: NUEVA }); expect(r.status).toBe(200)
    const [, id, attrs] = e.de('auth.updateUserById')[0]; expect(id).toBe('caller'); expect(attrs.password).toBe(NUEVA); expect(typeof attrs.app_metadata.password_rotada_en).toBe('string')
    expect(estado.flag).toBe(false); expect(e.llamadas.find((l) => l[0] === 'insert' && l[1] === 'auditoria')[3]).toMatchObject({ accion: 'cambio_password_obligatorio_completado', usuario_id: 'caller' })
  })
  it.each([['límite de peticiones de Auth (429)', { data: null, error: { message: 'Request rate limit reached', status: 429 } }], ['error de Auth (500)', { data: null, error: { message: 'Database error', status: 500 } }], ['fallo de red', { data: null, error: { message: 'fetch failed' } }]])('si la verificación de «distinta de la temporal» NO es concluyente (%s), NO se acepta a ciegas: 503, no se cambia nada y el indicador sigue puesto', async (_n, sonda) => {
    const { e, estado } = escenario({ sonda }); const r = await e.pedir({ password: NUEVA }); expect(r.status).toBe(503); expect(r.json.codigo).toBe('VERIFICACION_NO_DISPONIBLE')
    expect(e.de('auth.updateUserById')).toHaveLength(0); expect(estado.flag).toBe(true); expect(JSON.stringify(r.json)).not.toMatch(/rate limit|Database error|fetch failed/)
  })
  it('si Auth responde «correo no confirmado» (credenciales válidas), es la misma contraseña: se rechaza como igual a la temporal', async () => {
    const { e, estado } = escenario({ sonda: { data: null, error: { message: 'Email not confirmed', status: 400 } } }); const r = await e.pedir({ password: NUEVA }); expect(r.status).toBe(400); expect(r.json.codigo).toBe('PASSWORD_IGUAL_A_LA_TEMPORAL'); expect(estado.flag).toBe(true)
  })
  it('si Auth FALLA al cambiar la contraseña, el indicador NO se quita (sigue restringido) y la respuesta es genérica', async () => {
    const { e, estado } = escenario({ authFalla: true }); const r = await e.pedir({ password: NUEVA }); expect(r.status).toBe(500); expect(JSON.stringify(r.json)).not.toMatch(/secret|internal/)
    expect(estado.flag).toBe(true); expect(e.de('update')).toHaveLength(0)
  })
  it('si la contraseña cambió pero NO se pudo quitar el indicador: error CAMBIO_PARCIAL, sigue restringido, y el REINTENTO termina el proceso (no queda atascado)', async () => {
    const parcial = escenario({ quitarFalla: true }); const r1 = await parcial.e.pedir({ password: NUEVA }); expect(r1.status).toBe(500); expect(r1.json.codigo).toBe('CAMBIO_PARCIAL'); expect(parcial.estado.flag).toBe(true)
    // reintento: Auth ya tiene el marcador y la contraseña nueva SÍ permite iniciar sesión (ya no es la temporal): no se vuelve a rechazar como «igual»
    const retry = escenario({ rotada: true, igualALaTemporal: true }); const r2 = await retry.e.pedir({ password: NUEVA }); expect(r2.status).toBe(200); expect(retry.estado.flag).toBe(false); expect(retry.e.de('auth.signInWithPassword')).toHaveLength(0)
  })
  it.each([[['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']], ['corta'], ['x'.repeat(129)]])('contraseña inválida %j → 400 y el indicador SIGUE puesto', async (password) => {
    const { e, estado } = escenario(); const r = await e.pedir({ password }); expect(r.status).toBe(400); expect(estado.flag).toBe(true); expect(e.de('auth.updateUserById')).toHaveLength(0)
  })
  it('una clínica suspendida no puede cambiar la contraseña (sin cambios) y sigue restringida', async () => {
    const { e, estado } = escenario({ suspendida: true }); const r = await e.pedir({ password: NUEVA }); expect(r.json.error).toMatch(/suspendida/); expect(estado.flag).toBe(true); expect(e.de('auth.updateUserById')).toHaveLength(0)
  })
  it('sin sesión válida no se cambia nada', async () => { const { e } = escenario(); const r = await e.pedir({ password: NUEVA }, 'token-malo'); expect(r.json.error).toBe('Token inválido'); expect(e.de('auth.updateUserById')).toHaveLength(0) })
})
