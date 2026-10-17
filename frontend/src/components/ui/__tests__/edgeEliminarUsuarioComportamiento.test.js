// Comportamiento REAL del código de la Edge Function eliminar-usuario, ejecutado en Node con clientes de Supabase simulados (una «base» en memoria).
// Cubre lo que importa cuando Auth y la base NO comparten transacción y pueden fallar por separado. LIMITE: no es el runtime de Deno ni Supabase real
// (el efecto real de `ban_duration` en Supabase queda PENDIENTE DE ENTORNO).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'

const FUENTE = readFileSync(new URL('../../../../../supabase/functions/eliminar-usuario/index.ts', import.meta.url), 'utf8')
const AYUDA = transformSync(readFileSync(new URL('../../../../../supabase/functions/_shared/solicitud.ts', import.meta.url), 'utf8').replace(/^export /gm, ''), { loader: 'ts', format: 'esm' }).code   // módulo compartido real
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', CLINICA = 'clinica-A', OBJETIVO = '11111111-1111-4111-8111-111111111111'

function cargar(esc = {}) {
  const llamadas = [], auditoria = []
  const usuarios = { [OWNER]: { clinica_id: CLINICA, rol: esc.rolCaller ?? 'owner', nombre: 'Dueño', correo: 'o@x.mx' }, [OBJETIVO]: { clinica_id: esc.clinicaObjetivo ?? CLINICA, rol: 'dentista', nombre: 'Dr. X', correo: 'x@x.mx' }, ...(esc.usuarios ?? {}) }
  const clinicas = { [CLINICA]: { estado: esc.estadoClinica ?? 'activa' } }
  const crear = (url, clave) => {
    if (clave === 'anon') return { auth: { getUser: async (t) => (t === 'token-valido' ? { data: { user: { id: OWNER } }, error: null } : { data: { user: null }, error: { message: 'bad' } }) } }
    return {
      from: (tabla) => {
        const filtro = {}; let borrar = false
        const q = {
          select: () => q, eq: (c, v) => { filtro[c] = v; return q }, delete: () => { borrar = true; return q },
          single: async () => { const fila = (tabla === 'usuarios' ? usuarios : clinicas)[filtro.id]; return fila ? { data: fila, error: null } : { data: null, error: { message: 'no rows', code: 'PGRST116' } } },
          insert: async (fila) => { llamadas.push(['insert', tabla, fila]); if (tabla === 'auditoria') auditoria.push(fila); return { error: null } },
          then: (resolver) => {
            if (!borrar) return resolver({ error: null })
            llamadas.push(['usuarios.delete', filtro.id])
            const e = esc.errorAlBorrarPerfil?.(filtro.id) ?? null
            if (!e) delete usuarios[filtro.id]
            return resolver({ error: e })
          }
        }
        return q
      },
      auth: { admin: {
        updateUserById: async (id, attrs) => { llamadas.push(['auth.update', id, attrs]); return esc.alActualizarAuth?.(id, attrs) ?? { error: null } },
        deleteUser: async (id) => { llamadas.push(['auth.delete', id]); return esc.alBorrarAuth?.(id) ?? { error: null } }
      } }
    }
  }
  let handler
  const { code } = transformSync(AYUDA + '\n' + FUENTE.replace(/^import .*$/gm, ''), { loader: 'ts', format: 'esm' })
  new Function('serve', 'createClient', 'buildCorsHeaders', 'Deno', code)((h) => { handler = h }, crear, () => ({}), { env: { get: (k) => ({ SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc' })[k] } })
  const pedir = async (cuerpo, token = 'token-valido') => {
    const r = await handler(new Request('https://x/', { method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }))
    return { status: r.status, json: await r.json() }
  }
  return { pedir, llamadas, auditoria, usuarios }
}
const de = (llamadas, tipo) => llamadas.filter((l) => l[0] === tipo)
const orden = (llamadas) => llamadas.filter((l) => ['auth.update', 'usuarios.delete', 'auth.delete'].includes(l[0])).map((l) => (l[0] === 'auth.update' ? (l[2].ban_duration === 'none' ? 'reactivar' : 'desactivar') : l[0] === 'usuarios.delete' ? 'borrar-perfil' : 'borrar-cuenta'))

describe('eliminar-usuario — flujo correcto', () => {
  it('desactiva la cuenta, borra el perfil y borra la cuenta, EN ESE ORDEN; audita y responde ok', async () => {
    const e = cargar(); const r = await e.pedir({ usuarioId: OBJETIVO })
    expect(r.status).toBe(200); expect(r.json.ok).toBe(true); expect(orden(e.llamadas)).toEqual(['desactivar', 'borrar-perfil', 'borrar-cuenta'])
    expect(e.auditoria).toHaveLength(1); expect(e.auditoria[0]).toMatchObject({ usuario_id: OWNER, accion: 'eliminar_usuarios', entidad_id: OBJETIVO })
  })
})

describe('eliminar-usuario — fallos parciales (Auth y la base no comparten transacción)', () => {
  it('si la baja de Auth FALLA después de borrar el perfil: la cuenta queda DESACTIVADA (no viva y huérfana), se audita el pendiente y el mensaje lo explica', async () => {
    const e = cargar({ alBorrarAuth: () => ({ error: { message: 'Database error deleting user' } }) }); const r = await e.pedir({ usuarioId: OBJETIVO })
    expect(r.status).toBe(500); expect(r.json.codigo).toBe('CUENTA_PENDIENTE'); expect(r.json.error).toMatch(/desactivada/i); expect(r.json.error).not.toMatch(/Database error/)
    expect(orden(e.llamadas)).toEqual(['desactivar', 'borrar-perfil', 'borrar-cuenta'])   // y NO se reactiva
    const pendiente = e.auditoria.find((a) => a.accion === 'eliminar_usuario_cuenta_pendiente')
    expect(pendiente).toMatchObject({ usuario_id: OWNER, entidad: 'usuarios', entidad_id: OBJETIVO }); expect(pendiente.detalle).toMatchObject({ clinica_id: CLINICA, correo: 'x@x.mx' })
    expect(e.auditoria.some((a) => a.accion === 'eliminar_usuarios')).toBe(false)
  })
  it('si el perfil NO se puede borrar (tiene citas, tratamientos o pagos): se REACTIVA la cuenta, no se toca Auth y el perfil sigue ahí', async () => {
    const e = cargar({ errorAlBorrarPerfil: () => ({ code: '23503', message: 'violates foreign key' }) }); const r = await e.pedir({ usuarioId: OBJETIVO })
    expect(r.status).toBe(400); expect(r.json.error).toMatch(/Desactívalo en vez de eliminarlo/); expect(r.json.error).not.toMatch(/foreign key/)
    expect(orden(e.llamadas)).toEqual(['desactivar', 'borrar-perfil', 'reactivar']); expect(de(e.llamadas, 'auth.delete')).toHaveLength(0)
    expect(e.usuarios[OBJETIVO]).toBeTruthy(); expect(e.auditoria).toHaveLength(0)
  })
  it('si el borrado del perfil falla por OTRA razón (error inesperado de la base) también se reactiva la cuenta, y la respuesta es genérica (500) sin el texto interno', async () => {
    const e = cargar({ errorAlBorrarPerfil: () => ({ code: '57014', message: 'canceling statement due to statement timeout on relation usuarios' }) }); const r = await e.pedir({ usuarioId: OBJETIVO })
    expect(r.status).toBe(500); expect(JSON.stringify(r.json)).not.toMatch(/timeout|relation|usuarios/); expect(r.json.codigo).toBe('DB_57014')
    expect(orden(e.llamadas)).toEqual(['desactivar', 'borrar-perfil', 'reactivar']); expect(e.usuarios[OBJETIVO]).toBeTruthy()
  })
  it('si NO se puede desactivar la cuenta, se ABORTA antes de borrar nada', async () => {
    const e = cargar({ alActualizarAuth: () => ({ error: { message: 'auth caído' } }) }); const r = await e.pedir({ usuarioId: OBJETIVO })
    expect(r.status).toBeGreaterThanOrEqual(400); expect(orden(e.llamadas)).toEqual(['desactivar']); expect(e.usuarios[OBJETIVO]).toBeTruthy(); expect(e.auditoria).toHaveLength(0)
  })
})

describe('eliminar-usuario — autorización (sin cambios): ninguna acción sobre Auth ni la base cuando se rechaza', () => {
  const sinEfectos = (e) => expect(orden(e.llamadas)).toEqual([])
  it('un usuario que no es propietario no puede', async () => { const e = cargar({ rolCaller: 'dentista' }); const r = await e.pedir({ usuarioId: OBJETIVO }); expect(r.status).toBe(400); expect(r.json.error).toMatch(/Solo el owner/); sinEfectos(e) })
  it('NO se puede eliminar a un usuario de OTRA clínica (sin acceso horizontal)', async () => { const e = cargar({ clinicaObjetivo: 'clinica-B' }); const r = await e.pedir({ usuarioId: OBJETIVO }); expect(r.json.error).toMatch(/no pertenece a tu clínica/); sinEfectos(e); expect(e.usuarios[OBJETIVO]).toBeTruthy() })
  it('no puede eliminarse a sí mismo; un usuario inexistente o un id que no es UUID → «Usuario no encontrado»', async () => {
    let e = cargar(); expect((await e.pedir({ usuarioId: OWNER })).json.error).toMatch(/a ti mismo/); sinEfectos(e)
    for (const id of ['no-existe', 'x\'; drop table usuarios;--']) { e = cargar(); expect((await e.pedir({ usuarioId: id })).json.error, id).toMatch(/Usuario no encontrado/); sinEfectos(e) }
  })
  it('clínica suspendida, token inválido y petición sin token se rechazan', async () => {
    let e = cargar({ estadoClinica: 'suspendida' }); expect((await e.pedir({ usuarioId: OBJETIVO })).json.error).toMatch(/suspendida/); sinEfectos(e)
    e = cargar(); expect((await e.pedir({ usuarioId: OBJETIVO }, 'malo')).json.error).toBe('Token inválido'); sinEfectos(e)
    e = cargar(); expect((await e.pedir({ usuarioId: OBJETIVO }, null)).json.error).toBe('Falta autenticación'); sinEfectos(e)
  })
})
