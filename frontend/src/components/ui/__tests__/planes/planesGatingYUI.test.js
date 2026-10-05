// Gating de interfaz y UI renderizada. RECORDATORIO: nada de esto es seguridad — solo decide
// qué MOSTRAR. Quien realmente bloquea es la base de datos (RLS y triggers).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'

vi.mock('../../../../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), auth: { onAuthStateChange: vi.fn() } } }))

// zustand 4.5 usa el estado INICIAL como "snapshot de servidor" al renderizar con
// react-dom/server; aquí se necesita el estado ACTUAL de cada tienda. Solo en esta prueba.
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

import {
  funcionalidadDisponible, alMenosUnaDisponible, enlacesVisibles, elegirVistaDisponible, nombreDeFuncionalidad
} from '../../../../lib/planes.js'
import { usePlanStore } from '../../../../store/usePlanStore.js'
import { useAuthStore } from '../../../../store/useAuthStore.js'
import { useDisponibilidad } from '../../../../hooks/useFuncionalidad.js'
import { RutaConFuncionalidad } from '../../../planes/RutaConFuncionalidad.jsx'
import { FuncionalidadNoDisponible } from '../../../planes/FuncionalidadNoDisponible.jsx'
import { BarraUso } from '../../../planes/BarraUso.jsx'
import { PlanActualClinica } from '../../../planes/PlanActualClinica.jsx'

const f = (codigo, habilitada, extra = {}) => ({ codigo, nombre: `Nombre de ${codigo}`, categoria: 'clinico', habilitada, ...extra })
const susc = (funcionalidades, extra = {}) => ({
  sin_suscripcion: false, plan: { codigo: 'plan_x', nombre: 'Plan Equis' }, estado: 'activa', modalidad: 'mensual',
  precio_contratado: 100, moneda: 'MXN', limites: { pacientes: 2000, usuarios: 3, sucursales: 1, sesiones: 3 },
  uso: { pacientes: 423, usuarios: 2, sucursales: 1 }, excesos: [], funcionalidades, ...extra
})

// Deja el store como si la clínica de la sesión tuviera esta suscripción cargada.
function conPlan(suscripcion, { rol = 'owner', superAdmin = false, esOffline = false } = {}) {
  useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol, es_super_admin: superAdmin } })
  usePlanStore.setState({ suscripcion, claveSuscripcion: 'u1:c1', cargada: true, cargando: false, esOffline, ultimaActualizacion: 1_700_000_000_000 })
}
const render = (el) => renderToStaticMarkup(h(StaticRouter, { location: '/' }, el))

beforeEach(() => {
  useAuthStore.setState({ perfil: null })
  usePlanStore.getState().limpiar()
})

describe('funcionalidadDisponible — reglas de gating', () => {
  const s = susc([f('pagos', true), f('periodontograma', false)])
  it('habilitada → se muestra', () => expect(funcionalidadDisponible(s, 'pagos')).toBe(true))
  it('deshabilitada → se oculta', () => expect(funcionalidadDisponible(s, 'periodontograma')).toBe(false))
  it('desconocida (no está en el catálogo) → NO se oculta', () => expect(funcionalidadDisponible(s, 'algo_nuevo')).toBe(true))
  it('todavía sin suscripción → NO se oculta nada', () => {
    expect(funcionalidadDisponible(null, 'periodontograma')).toBe(true)
    expect(funcionalidadDisponible(undefined, 'periodontograma')).toBe(true)
  })
  it('clínica heredada (sin_suscripcion) → NO se oculta nada, aunque la lista diga lo contrario', () => {
    expect(funcionalidadDisponible({ sin_suscripcion: true, funcionalidades: [f('pagos', false)] }, 'pagos')).toBe(true)
  })
  it('plan cambiado: la misma funcionalidad pasa de oculta a visible con el snapshot nuevo', () => {
    const antes = susc([f('periodontograma', false)])
    const despues = susc([f('periodontograma', true)])
    expect(funcionalidadDisponible(antes, 'periodontograma')).toBe(false)
    expect(funcionalidadDisponible(despues, 'periodontograma')).toBe(true)
  })
  it('lista de códigos: basta con UNO disponible; lista vacía no oculta', () => {
    expect(alMenosUnaDisponible(s, ['periodontograma', 'pagos'])).toBe(true)
    expect(alMenosUnaDisponible(susc([f('a', false), f('b', false)]), ['a', 'b'])).toBe(false)
    expect(alMenosUnaDisponible(s, [])).toBe(true)
  })
  it('el nombre legible sale de la suscripción (base de datos), no de un texto escrito a mano', () => {
    expect(nombreDeFuncionalidad(s, 'pagos')).toBe('Nombre de pagos')
    expect(nombreDeFuncionalidad(s, 'no_existe')).toBeNull()
  })
})

describe('vistas del odontograma: elegirVistaDisponible', () => {
  it('con 2D y 3D disponibles se respeta la vista guardada', () => expect(elegirVistaDisponible('3d', ['2d', '3d'])).toBe('3d'))
  it('solo 2D: si estaba guardada la 3D cae AUTOMÁTICAMENTE a 2D', () => expect(elegirVistaDisponible('3d', ['2d'])).toBe('2d'))
  it('ninguna vista disponible: null (la pantalla muestra el estado "no incluida", nunca en blanco)', () => expect(elegirVistaDisponible('3d', [])).toBeNull())
})

describe('menús: desaparecen cuando el plan no incluye la funcionalidad y VUELVEN al cambiar de plan', () => {
  const ENLACES = [
    { to: '/agenda', label: 'Agenda', roles: ['owner'], funcionalidad: 'agenda' },
    { to: '/corte-de-caja', label: 'Corte de caja', roles: ['owner'], funcionalidad: 'caja' },
    { to: '/pacientes', label: 'Pacientes', roles: ['owner'] },
    { to: '/solo-dentista', label: 'Solo dentista', roles: ['dentista'], funcionalidad: 'agenda' }
  ]
  const Menu = () => {
    const disponible = useDisponibilidad()
    return h('ul', null, enlacesVisibles(ENLACES, 'owner', disponible).map((e) => h('li', { key: e.to }, e.label)))
  }

  it('función pura: filtra por rol Y por plan; sin funcionalidad siempre se ve', () => {
    const solo = (s) => enlacesVisibles(ENLACES, 'owner', (c) => funcionalidadDisponible(s, c)).map((e) => e.label)
    expect(solo(susc([f('agenda', true), f('caja', false)]))).toEqual(['Agenda', 'Pacientes'])
    expect(solo(null)).toEqual(['Agenda', 'Corte de caja', 'Pacientes'])
  })

  it('renderizado: "Corte de caja" no aparece sin la funcionalidad y reaparece cuando el plan cambia', () => {
    conPlan(susc([f('agenda', true), f('caja', false)]))
    let html = render(h(Menu))
    expect(html).toContain('Agenda')
    expect(html).toContain('Pacientes')
    expect(html).not.toContain('Corte de caja')

    // El superadmin cambia el plan → la suscripción nueva llega al store
    conPlan(susc([f('agenda', true), f('caja', true)]))
    html = render(h(Menu))
    expect(html).toContain('Corte de caja')
  })

  it('sin suscripción cargada (o clínica heredada) no se oculta ningún menú', () => {
    useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol: 'owner' } })
    expect(render(h(Menu))).toContain('Corte de caja')
    conPlan({ sin_suscripcion: true, funcionalidades: [f('caja', false)] })
    expect(render(h(Menu))).toContain('Corte de caja')
  })

  it('el SUPERADMIN conserva acceso de plataforma: ve todo aunque su clínica no lo incluya', () => {
    conPlan(susc([f('agenda', false), f('caja', false)]), { superAdmin: true })
    const html = render(h(Menu))
    expect(html).toContain('Agenda')
    expect(html).toContain('Corte de caja')
  })

  it('AISLAMIENTO: una suscripción cargada para OTRA identidad no se usa (no oculta nada de más ni de menos)', () => {
    conPlan(susc([f('caja', false)]))
    usePlanStore.setState({ claveSuscripcion: 'otro-usuario:otra-clinica' }) // quedó de otra cuenta
    expect(render(h(Menu))).toContain('Corte de caja') // se ignora → no se oculta
  })
})

describe('ruta no incluida en el plan (protección de UX, no un 403)', () => {
  const Pantalla = () => h('p', null, 'CONTENIDO PROTEGIDO')

  it('con la funcionalidad: muestra la pantalla', () => {
    conPlan(susc([f('caja', true)]))
    expect(render(h(RutaConFuncionalidad, { funcionalidad: 'caja' }, h(Pantalla)))).toContain('CONTENIDO PROTEGIDO')
  })

  it('sin la funcionalidad: muestra el aviso con el nombre de la funcionalidad, el plan actual y "Mejorar plan"', () => {
    conPlan(susc([f('caja', false)]))
    const html = render(h(RutaConFuncionalidad, { funcionalidad: 'caja' }, h(Pantalla)))
    expect(html).not.toContain('CONTENIDO PROTEGIDO')
    expect(html).toContain('Esta funcionalidad no está disponible en tu plan.')
    expect(html).toContain('Nombre de caja')
    expect(html).toContain('Plan Equis')
    expect(html).toContain('Mejorar plan')
    expect(html).toContain('href="/contacto"')
    expect(html).not.toContain('403')
  })

  it('sin suscripción cargada NO bloquea (fail-open de UX)', () => {
    useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol: 'owner' } })
    expect(render(h(RutaConFuncionalidad, { funcionalidad: 'caja' }, h(Pantalla)))).toContain('CONTENIDO PROTEGIDO')
  })

  it('con lista: se muestra si basta UNA; se bloquea si ninguna', () => {
    conPlan(susc([f('a', false), f('b', true)]))
    expect(render(h(RutaConFuncionalidad, { funcionalidad: ['a', 'b'] }, h(Pantalla)))).toContain('CONTENIDO PROTEGIDO')
    conPlan(susc([f('a', false), f('b', false)]))
    const html = render(h(RutaConFuncionalidad, { funcionalidad: ['a', 'b'] }, h(Pantalla)))
    expect(html).toContain('Nombre de a, Nombre de b')
  })

  it('superadmin entra siempre', () => {
    conPlan(susc([f('caja', false)]), { superAdmin: true })
    expect(render(h(RutaConFuncionalidad, { funcionalidad: 'caja' }, h(Pantalla)))).toContain('CONTENIDO PROTEGIDO')
  })

  it('al cambiar de plan, la ruta vuelve a estar disponible', () => {
    conPlan(susc([f('caja', false)]))
    expect(render(h(RutaConFuncionalidad, { funcionalidad: 'caja' }, h(Pantalla)))).not.toContain('CONTENIDO PROTEGIDO')
    conPlan(susc([f('caja', true)]))
    expect(render(h(RutaConFuncionalidad, { funcionalidad: 'caja' }, h(Pantalla)))).toContain('CONTENIDO PROTEGIDO')
  })

  it('FuncionalidadNoDisponible sin suscripción igual muestra el aviso y el botón (sin inventar un plan)', () => {
    const html = render(h(FuncionalidadNoDisponible, { funcionalidad: 'caja' }))
    expect(html).toContain('Esta funcionalidad no está disponible en tu plan.')
    expect(html).toContain('Mejorar plan')
    expect(html).not.toContain('Plan actual')
  })
})

describe('límites: lo que ve la persona (la BD es la que bloquea de verdad)', () => {
  it('423 / 2,000 → 21 % y barra normal', () => {
    const html = render(h(BarraUso, { etiqueta: 'Pacientes', usado: 423, limite: 2000 }))
    expect(html).toContain('423 / 2,000')
    expect(html).toContain('aria-valuenow="21"')
    expect(html).toContain('bg-clinico-azul')
  })
  it('2000 / 2000 → 100 % y barra en alerta', () => {
    const html = render(h(BarraUso, { etiqueta: 'Pacientes', usado: 2000, limite: 2000 }))
    expect(html).toContain('2,000 / 2,000')
    expect(html).toContain('aria-valuenow="100"')
    expect(html).toContain('bg-red-500')
  })
  it('2300 / 2000 (bajó de plan) → muestra 2,300 / 2,000, la barra se queda en 100 % y NO se oculta nada', () => {
    const html = render(h(BarraUso, { etiqueta: 'Pacientes', usado: 2300, limite: 2000 }))
    expect(html).toContain('2,300 / 2,000')
    expect(html).toContain('aria-valuenow="100"')
    expect(html).toContain('bg-red-500')
  })
  it('80 % → ámbar; ilimitado → "Ilimitado" y sin barra', () => {
    expect(render(h(BarraUso, { etiqueta: 'Usuarios', usado: 8, limite: 10 }))).toContain('bg-amber-500')
    const ilim = render(h(BarraUso, { etiqueta: 'Pacientes', usado: 99999, limite: null }))
    expect(ilim).toContain('99,999 / Ilimitado')
    expect(ilim).not.toContain('progressbar')
  })
})

describe('panel "Plan actual" de la clínica', () => {
  const base = () => susc([f('pagos', true), f('periodontograma', false)])

  it('muestra pacientes 423/2,000, usuarios 2/3, sucursales 1/1, el plan y "Mejorar plan"', () => {
    conPlan(base())
    const html = render(h(PlanActualClinica))
    expect(html).toContain('Plan Equis')
    expect(html).toContain('423 / 2,000')
    expect(html).toContain('2 / 3')
    expect(html).toContain('1 / 1')
    expect(html).toContain('Mejorar plan')
    expect(html).toContain('Tu plan incluye:')
    expect(html).toContain('Nombre de pagos')
    expect(html).toContain('Nombre de periodontograma') // aparece con ✕ (no incluida)
  })

  it('al bajar de plan muestra el aviso EXACTO para pacientes, usuarios y sucursales — sin borrar nada', () => {
    conPlan(susc([f('pagos', true)], {
      uso: { pacientes: 2300, usuarios: 5, sucursales: 3 },
      limites: { pacientes: 2000, usuarios: 3, sucursales: 1, sesiones: 3 },
      excesos: [{ tipo: 'pacientes', usado: 2300, limite: 2000 }, { tipo: 'usuarios', usado: 5, limite: 3 }, { tipo: 'sucursales', usado: 3, limite: 1 }]
    }))
    const html = render(h(PlanActualClinica))
    expect(html).toContain('Tu clínica actualmente tiene 2,300 pacientes y el plan permite 2,000. Puedes seguir consultando tus registros, pero necesitas actualizar tu plan para registrar nuevos pacientes.')
    expect(html).toContain('Tu clínica actualmente tiene 5 usuarios y el plan permite 3.')
    expect(html).toContain('Tu clínica actualmente tiene 3 sucursales activas y el plan permite 1.')
  })

  it('sin conexión: avisa que son datos guardados en el dispositivo, con la fecha', () => {
    conPlan(base(), { esOffline: true })
    const html = render(h(PlanActualClinica))
    expect(html).toContain('Mostrando datos guardados en este dispositivo')
    expect(html).toContain('Se actualizarán al recuperar la conexión')
  })

  it('con datos frescos NO muestra el aviso de datos guardados', () => {
    conPlan(base(), { esOffline: false })
    expect(render(h(PlanActualClinica))).not.toContain('datos guardados')
  })

  it('el precio contratado solo aparece si viene (el dentista no lo recibe)', () => {
    conPlan(susc([f('pagos', true)], { precio_contratado: null }))
    expect(render(h(PlanActualClinica))).not.toContain('MXN /')
  })

  it('suscripción suspendida: lo dice', () => {
    conPlan(susc([f('pagos', true)], { estado: 'suspendida' }))
    expect(render(h(PlanActualClinica))).toContain('suspendida')
  })

  it('clínica sin plan contratado registrado: lo dice y no inventa un plan', () => {
    conPlan({ sin_suscripcion: true, plan: { codigo: 'x', nombre: 'Lo que diga la base' }, estado: 'activa', limites: {}, uso: {}, excesos: [], funcionalidades: [] })
    const html = render(h(PlanActualClinica))
    expect(html).toContain('todavía no tiene un plan contratado registrado')
    expect(html).toContain('Lo que diga la base')
  })

  it('SIN suscripción de ESTA identidad no pinta nada ajeno', () => {
    conPlan(base())
    usePlanStore.setState({ claveSuscripcion: 'otro:otra' })
    const html = render(h(PlanActualClinica))
    expect(html).not.toContain('Plan Equis')
  })
})
