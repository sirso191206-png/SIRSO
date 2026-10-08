// Acceso directo por URL según el rol. Esta matriz ES la documentación de "quién entra a qué".
// Recordatorio: es protección de interfaz; la base de datos (RLS) es la que protege los datos.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'

vi.mock('../../../lib/supabase', () => ({
  supabase: { rpc: vi.fn(), auth: { onAuthStateChange: vi.fn(), getSession: vi.fn() }, channel: vi.fn(() => ({ on: () => ({ subscribe: () => ({}) }) })), removeChannel: vi.fn(), from: vi.fn(() => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }), eq: () => Promise.resolve({ data: [], error: null }) }) })) }
}))
vi.mock('zustand', async (importarOriginal) => {
  const real = await importarOriginal()
  return {
    ...real,
    create: (inicial) => {
      const api = real.createStore(inicial)
      api.getServerState = api.getState
      const hook = (selector, igualdad) => real.useStore(api, selector, igualdad)
      Object.assign(hook, api)
      return hook
    }
  }
})

import { ACCESO_RUTAS, puedeEntrarARuta, reglaDeRuta, rolesDeRuta, rutaInicioPorRol } from '../../../lib/accesoPorRol.js'
import { useAuthStore } from '../../../store/useAuthStore.js'
import { usePlanStore } from '../../../store/usePlanStore.js'
import { ProtectedRoute } from '../../layout/ProtectedRoute.jsx'

const ROLES = ['owner', 'dentista', 'asistente', 'recepcion']
const quien = (rol, extra = {}) => ({ id: 'u1', clinica_id: 'c1', rol, nombre: 'Persona', ...extra })

// [ruta, roles con acceso]
const MATRIZ = [
  ['/', ['owner', 'dentista', 'asistente']],
  ['/agenda', ROLES],
  ['/pacientes', ROLES],
  ['/pacientes/abc-123', ROLES],
  ['/consulta/xyz', ['owner', 'dentista', 'asistente']],
  ['/catalogo', ['owner', 'dentista']],
  ['/corte-de-caja', ['owner', 'recepcion']],
  ['/reportes', ['owner']],
  ['/auditoria', ['owner']],
  ['/usuarios', ['owner']],
  ['/sucursales', ['owner']],
  ['/configuracion', ['owner']],
  ['/configuracion/seguridad', ROLES],
  ['/ayuda', ROLES],
  ['/administracion/arco', ['owner']],
  ['/administracion/incidentes', ['owner']],
  ['/administracion', []],
  ['/administracion/9f2c-uuid-de-clinica', []],
  ['/superadmin/planes', []],
  ['/admin/legal', []]
]

describe('matriz de acceso por rol (clínica)', () => {
  for (const [ruta, permitidos] of MATRIZ) {
    for (const rol of ROLES) {
      it(`${rol} ${permitidos.includes(rol) ? 'ENTRA a' : 'NO entra a'} ${ruta}`, () => {
        expect(puedeEntrarARuta(ruta, quien(rol))).toBe(permitidos.includes(rol))
      })
    }
  }
})

describe('superadmin y casos límite', () => {
  it('el superadmin entra a TODAS las pantallas, incluidas las de plataforma', () => {
    for (const [ruta] of MATRIZ) expect(puedeEntrarARuta(ruta, quien('owner', { es_super_admin: true }))).toBe(true)
  })
  it('un OWNER normal no entra a las pantallas de plataforma aunque conozca la dirección', () => {
    for (const r of ['/administracion', '/administracion/abc', '/superadmin/planes', '/admin/legal']) expect(puedeEntrarARuta(r, quien('owner'))).toBe(false)
  })
  it('la regla más específica gana: /configuracion/seguridad es de todos aunque /configuracion sea del owner', () => {
    expect(reglaDeRuta('/configuracion/seguridad').patron).toBe('/configuracion/seguridad')
    expect(puedeEntrarARuta('/configuracion/seguridad', quien('recepcion'))).toBe(true)
    expect(puedeEntrarARuta('/configuracion', quien('recepcion'))).toBe(false)
  })
  it('"/" es exacta: no abre las demás rutas, y un prefijo parecido no se cuela (/pacientesX, /agendar)', () => {
    expect(reglaDeRuta('/pacientesX')).toBeNull()
    expect(reglaDeRuta('/agendar')).toBeNull()
    expect(puedeEntrarARuta('/usuarios', quien('dentista'))).toBe(false)
  })
  it('ignora barra final, parámetros de búsqueda y hash (no sirven para saltarse la regla)', () => {
    expect(puedeEntrarARuta('/usuarios/', quien('dentista'))).toBe(false)
    expect(puedeEntrarARuta('/usuarios?x=1', quien('dentista'))).toBe(false)
    expect(puedeEntrarARuta('/usuarios#a', quien('dentista'))).toBe(false)
    expect(puedeEntrarARuta('/reportes///', quien('recepcion'))).toBe(false)
  })
  it('"//" y "///" son la raíz "/": la regla de Mi día se aplica (recepción no entra) y no se cuelan por no tener regla', () => {
    for (const r of ['//', '///', '/?a=1', '/#x']) expect(puedeEntrarARuta(r, quien('recepcion'))).toBe(false)
    expect(puedeEntrarARuta('//', quien('dentista'))).toBe(true)
  })
  it('sin perfil cargado todavía no se bloquea (no se puede decidir; la base protege los datos)', () => {
    expect(puedeEntrarARuta('/usuarios', null)).toBe(true)
    expect(puedeEntrarARuta('/usuarios', undefined)).toBe(true)
  })
  it('un rol inventado no entra a nada que tenga regla', () => {
    expect(puedeEntrarARuta('/pacientes', quien('hacker'))).toBe(false)
    expect(puedeEntrarARuta('/usuarios', quien(undefined))).toBe(false)
  })
  it('rolesDeRuta alimenta el menú: sin roles de plataforma, y rutas sin regla = todos', () => {
    expect(rolesDeRuta('/reportes')).toEqual(['owner'])
    expect(rolesDeRuta('/administracion')).toEqual([])
    expect(rolesDeRuta('/ruta-que-no-existe')).toEqual(ROLES)
  })
  it('recepción aterriza en Agenda; los demás en Mi día', () => {
    expect(rutaInicioPorRol('recepcion')).toBe('/agenda')
    expect(rutaInicioPorRol('owner')).toBe('/')
  })
  it('no hay dos reglas con el mismo patrón (la tabla es inequívoca)', () => {
    const patrones = ACCESO_RUTAS.map((r) => r.patron)
    expect(new Set(patrones).size).toBe(patrones.length)
  })
})

function conSesion(rol, extra = {}) {
  useAuthStore.setState({
    session: { user: { id: 'u1' } }, cargando: false, modoOffline: false, desbloqueoOffline: false, clinicaEstado: 'activa',
    perfil: quien(rol, extra), clinicaNombre: 'Clínica X', sesionActualId: null
  })
  usePlanStore.getState().limpiar()
}
const entrar = (ruta) => renderToStaticMarkup(h(StaticRouter, { location: ruta }, h(ProtectedRoute, null, h('p', null, 'CONTENIDO DE LA PANTALLA'))))

describe('ProtectedRoute real: qué ve la persona al escribir la dirección', () => {
  beforeEach(() => useAuthStore.setState({ session: null, perfil: null }))

  it('un DENTISTA escribe /usuarios → ve "No tienes acceso" y NO el contenido', () => {
    conSesion('dentista')
    const html = entrar('/usuarios')
    expect(html).toContain('No tienes acceso a esta sección')
    expect(html).not.toContain('CONTENIDO DE LA PANTALLA')
  })
  it('una RECEPCIONISTA escribe /reportes, /catalogo, /configuracion o /consulta/x → bloqueada; /agenda y /corte-de-caja → entra', () => {
    conSesion('recepcion')
    for (const r of ['/reportes', '/catalogo', '/configuracion', '/consulta/x', '/usuarios']) expect(entrar(r)).toContain('No tienes acceso')
    for (const r of ['/agenda', '/corte-de-caja', '/pacientes', '/configuracion/seguridad']) expect(entrar(r)).toContain('CONTENIDO DE LA PANTALLA')
  })
  it('un ASISTENTE no entra a caja, reportes, usuarios ni configuración', () => {
    conSesion('asistente')
    for (const r of ['/corte-de-caja', '/reportes', '/usuarios', '/configuracion', '/sucursales']) expect(entrar(r)).toContain('No tienes acceso')
    expect(entrar('/')).toContain('CONTENIDO DE LA PANTALLA')
  })
  it('un OWNER no entra a las pantallas de plataforma; el superadmin sí', () => {
    conSesion('owner')
    for (const r of ['/administracion', '/superadmin/planes', '/admin/legal', '/administracion/abc']) expect(entrar(r)).toContain('No tienes acceso')
    expect(entrar('/usuarios')).toContain('CONTENIDO DE LA PANTALLA')
    conSesion('owner', { es_super_admin: true })
    for (const r of ['/administracion', '/superadmin/planes', '/admin/legal']) expect(entrar(r)).toContain('CONTENIDO DE LA PANTALLA')
  })
  it('el aviso ofrece volver al inicio de SU rol (recepción → Agenda)', () => {
    conSesion('recepcion')
    expect(entrar('/reportes')).toContain('href="/agenda"')
    conSesion('dentista')
    expect(entrar('/usuarios')).toContain('href="/"')
  })
  it('el menú lateral y el acceso por URL no se contradicen: cada enlace visible es una ruta a la que el rol sí entra', () => {
    for (const rol of ROLES) {
      conSesion(rol)
      const html = entrar('/agenda')
      const enlaces = [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]).filter((hrf) => hrf !== '/configuracion/seguridad')
      for (const href of enlaces) expect(puedeEntrarARuta(href, quien(rol)), `${rol} ve un enlace a ${href} pero no puede entrar`).toBe(true)
    }
  })
  it('sin sesión no se muestra nada (redirige a login)', () => {
    useAuthStore.setState({ session: null, cargando: false, perfil: null, desbloqueoOffline: false })
    expect(entrar('/usuarios')).not.toContain('CONTENIDO DE LA PANTALLA')
  })
})
