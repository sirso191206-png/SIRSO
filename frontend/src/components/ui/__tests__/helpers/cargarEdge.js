// Arnés para ejecutar en Node el código REAL de una Edge Function (con los módulos compartidos reales) usando clientes de Supabase simulados.
// LIMITE: no es el runtime de Deno ni Supabase real; no valida tipos (eso lo hace el despliegue). Reutilizado por las pruebas de comportamiento de las funciones.
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'

const RAIZ = new URL('../../../../../../supabase/functions/', import.meta.url)
const leer = (ruta) => readFileSync(new URL(ruta, RAIZ), 'utf8')
const aJs = (ts) => transformSync(ts, { loader: 'ts', format: 'esm' }).code
const sinExport = (t) => t.replace(/^export /gm, '')
const AYUDA = aJs(sinExport(leer('_shared/solicitud.ts')))
const CIFRADO = aJs(sinExport(leer('_shared/sis-cifrado.ts')))

export function cargarEdge(nombre, esc = {}) {
  const llamadas = []
  const db = esc.db ?? (() => ({ data: null, error: null }))
  const crear = (url, clave, opciones) => {
    const encabezado = opciones?.global?.headers?.Authorization?.replace(/^Bearer\s+/i, '')
    const rol = clave === 'anon' ? 'caller' : 'admin'
    const from = (tabla) => {
      const filtro = {}; let op = 'select', datos = null
      const ejecutar = async () => { llamadas.push([op, tabla, { ...filtro }, datos, rol]); return (await db({ tabla, op, filtro, datos, rol })) ?? { data: null, error: null } }
      const q = {
        select: () => q, order: () => q, limit: () => q, neq: (c, v) => { filtro['!' + c] = v; return q }, eq: (c, v) => { filtro[c] = v; return q },
        update: (d) => { op = 'update'; datos = d; return q }, insert: (d) => { op = 'insert'; datos = d; return q }, delete: () => { op = 'delete'; return q },
        single: () => ejecutar(), maybeSingle: () => ejecutar(), then: (res, rej) => ejecutar().then(res, rej)
      }
      return q
    }
    return {
      from,
      rpc: async (n, a) => { llamadas.push(['rpc', n, a, null, rol]); return esc.rpc?.(n, a) ?? { data: null, error: null } },
      auth: {
        getUser: async (t) => { const tok = t ?? encabezado; return tok === 'token-valido' ? { data: { user: { id: esc.usuarioId ?? 'caller' } }, error: null } : { data: { user: null }, error: { message: 'bad', status: 401 } } },
        admin: {
          createUser: async (a) => { llamadas.push(['auth.createUser', a]); return esc.crearAuth?.(a) ?? { data: { user: { id: 'auth-nuevo' } }, error: null } },
          deleteUser: async (id) => { llamadas.push(['auth.deleteUser', id]); return esc.borrarAuth?.(id) ?? { error: null } },
          updateUserById: async (id, a) => { llamadas.push(['auth.updateUserById', id, a]); return esc.actualizarAuth?.(id, a) ?? { error: null } },
          getUserById: async (id) => { llamadas.push(['auth.getUserById', id]); return esc.obtenerAuth?.(id) ?? { data: { user: { id, app_metadata: {} } }, error: null } }
        },
        signInWithPassword: async (cred) => { llamadas.push(['auth.signInWithPassword', cred.email]); return esc.iniciarSesion?.(cred) ?? { data: null, error: { message: 'Invalid login credentials', status: 400 } } }
      }
    }
  }
  let handler
  const codigo = AYUDA + '\n' + (nombre === 'sis-cifrar-archivo' ? CIFRADO + '\n' : '') + aJs(leer(`${nombre}/index.ts`).replace(/^import .*$/gm, ''))
  const env = { SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', ...(esc.env ?? {}) }
  new Function('serve', 'createClient', 'buildCorsHeaders', 'Deno', 'fetch', codigo)((h) => { handler = h }, crear, () => ({}), { env: { get: (k) => env[k] } }, async () => { throw new Error('sin red en las pruebas') })
  const pedir = async (cuerpo, token = 'token-valido', crudo) => {
    const r = await handler(new Request('https://x/', { method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: crudo ?? JSON.stringify(cuerpo) }))
    return { status: r.status, json: await r.json() }
  }
  return { pedir, llamadas, de: (tipo) => llamadas.filter((l) => l[0] === tipo), escrituras: () => llamadas.filter((l) => ['insert', 'update', 'delete'].includes(l[0]) || l[0].startsWith('auth.') || l[0] === 'rpc') }
}
