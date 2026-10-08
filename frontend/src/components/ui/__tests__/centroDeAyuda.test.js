// Centro de ayuda: solo lo que SIRO hace hoy, y solo lo que corresponde al rol y al plan.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

vi.mock('../../../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), auth: { onAuthStateChange: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn() } }))
vi.mock('zustand', async (importarOriginal) => {
  const real = await importarOriginal()
  return { ...real, create: (inicial) => { const api = real.createStore(inicial); api.getServerState = api.getState; const hook = (sel, eq) => real.useStore(api, sel, eq); Object.assign(hook, api); return hook } }
})

import { GUIAS_AYUDA, CATEGORIAS_AYUDA, guiasVisibles, buscarGuias } from '../../../lib/ayuda.js'
import { LIMITES_ARCHIVOS } from '../../../lib/limitesArchivos.js'
import { Ayuda } from '../../../pages/Ayuda.jsx'
import { useAuthStore } from '../../../store/useAuthStore.js'
import { usePlanStore } from '../../../store/usePlanStore.js'

// fileURLToPath (no .pathname): en Windows .pathname da "/C:/Users/…", una ruta inválida. Apunta a frontend/src/.
const SRC = fileURLToPath(new URL('../../../', import.meta.url))
const todoElTexto = JSON.stringify(GUIAS_AYUDA)
const ver = (rol, opciones = {}) => guiasVisibles(GUIAS_AYUDA, { rol, ...opciones }).map((g) => g.id)

describe('contenido de las guías', () => {
  it('cada guía tiene identificador único, categoría válida, resumen y al menos 2 pasos', () => {
    const ids = GUIAS_AYUDA.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const g of GUIAS_AYUDA) {
      expect(CATEGORIAS_AYUDA, g.id).toContain(g.categoria)
      expect(g.resumen.length, g.id).toBeGreaterThan(5)
      expect(g.pasos.length, g.id).toBeGreaterThanOrEqual(2)
      expect(new Set(g.pasos).size, `${g.id} repite pasos`).toBe(g.pasos.length)
    }
  })
  it('cubre todos los temas que SIRO necesita explicar', () => {
    const ids = GUIAS_AYUDA.map((g) => g.id)
    for (const tema of ['crear-paciente', 'expediente', 'odontograma', 'periodontograma', 'agenda', 'consulta', 'recetas', 'consentimientos', 'pagos', 'usuarios', 'plan-limites', 'sin-conexion', 'seguridad']) expect(ids).toContain(tema)
    expect(GUIAS_AYUDA.filter((g) => g.categoria === 'Solución de problemas').length).toBeGreaterThanOrEqual(6)
  })
  it('NO anuncia lo que no existe: WhatsApp, inventario, horarios de atención', () => {
    for (const prohibido of ['whatsapp', 'inventario', 'horarios de atención', 'horario de atención']) expect(todoElTexto.toLowerCase()).not.toContain(prohibido)
  })
  it('sin precios ni nombres de planes (eso sale de la base, no se escribe a mano)', () => {
    expect(todoElTexto).not.toMatch(/\$\s?\d/)
    expect(todoElTexto.toLowerCase()).not.toMatch(/esencial|empresarial|plan profesional|plan cl[ií]nica/)
  })
  it('los topes de archivos de la ayuda salen de la MISMA fuente que la validación', () => {
    const t = GUIAS_AYUDA.find((g) => g.id === 'archivos').pasos.join(' ')
    expect(t).toContain(`hasta ${LIMITES_ARCHIVOS['fotos-clinicas'].maxBytes / 1048576} MB`)
    expect(t).toContain(`hasta ${LIMITES_ARCHIVOS['documentos-clinicos'].maxBytes / 1048576} MB`)
    expect(GUIAS_AYUDA.find((g) => g.id === 'p-archivo').pasos.join(' ')).toContain(`Logo: ${LIMITES_ARCHIVOS['logos-clinicas'].formatos}`)
  })
  it('las funcionalidades que mencionan las guías existen en el catálogo de la migración 075', () => {
    const sql = readFileSync(new URL('../../../../../supabase/migrations/075_sirso_planes_suscripciones.sql', import.meta.url), 'utf8')
    const codigos = new Set(GUIAS_AYUDA.flatMap((g) => [g.funcionalidad].flat()).filter(Boolean))
    expect(codigos.size).toBeGreaterThanOrEqual(8)
    for (const c of codigos) expect(sql, `la funcionalidad "${c}" no está en el catálogo`).toContain(`'${c}'`)
  })
})

describe('los nombres de botones y pestañas que menciona la ayuda EXISTEN en la pantalla', () => {
  function fuentes(dir) {
    return readdirSync(dir).flatMap((n) => {
      const ruta = join(dir, n)
      if (statSync(ruta).isDirectory()) return n === '__tests__' ? [] : fuentes(ruta)
      return /\.(jsx|js)$/.test(n) && !/ayuda\.js$|Ayuda\.jsx$/.test(n) ? [readFileSync(ruta, 'utf8')] : []
    })
  }
  const codigo = fuentes(SRC).join('\n')
  const ETIQUETAS = ['Nuevo paciente', 'Nueva cita', 'Nueva urgencia', 'Lista de espera', 'Iniciar consulta', 'Registrar pago', 'Nuevo consentimiento', 'Nueva receta',
    'Documentos clínicos', 'Datos profesionales', 'Cerrar esta sesión', 'Mejorar plan', 'Corte de caja', 'Contactar a SIRO', 'Datos generales', 'Historial', 'Odontograma', 'Archivos', 'Seguridad', 'Agenda', 'Usuarios', 'Configuración', 'Auditoría', 'Reportes']
  for (const etiqueta of ETIQUETAS) {
    it(`"${etiqueta}" aparece en la aplicación`, () => { expect(codigo).toContain(etiqueta) })
  }
  it('y la ayuda de verdad las menciona (la lista no está vieja)', () => {
    for (const e of ['Nuevo paciente', 'Nueva cita', 'Iniciar consulta', 'Registrar pago', 'Datos profesionales', 'Cerrar esta sesión', 'Mejorar plan']) expect(todoElTexto, e).toContain(e)
  })
  it('TODA frase entre comillas de la ayuda (botón, pestaña o mensaje) existe tal cual en la aplicación', () => {
    const textos = GUIAS_AYUDA.flatMap((g) => [g.titulo, g.resumen, ...g.pasos])
    const citadas = [...new Set(textos.flatMap((t) => [...t.matchAll(/"([^"]{3,80})"/g)].map((m) => m[1])))]
    expect(citadas.length).toBeGreaterThan(15)
    const faltan = citadas.filter((c) => !codigo.toLowerCase().includes(c.toLowerCase().replace(/^¿/, '').replace(/\?$/, '')))
    expect(faltan, `la ayuda cita frases que no existen en la pantalla: ${faltan.join(' | ')}`).toEqual([])
  })
  it('las vistas de agenda que menciona (Día, Semana, Mes) existen', () => {
    const agenda = readFileSync(join(SRC, 'pages/Agenda.jsx'), 'utf8')
    for (const v of ["'Día'", "'Semana'", "'Mes'"]) expect(agenda).toContain(v)
  })
})

describe('qué guías ve cada quien', () => {
  const todo = () => true
  it('el propietario ve la administración; dentista y recepción no', () => {
    for (const g of ['usuarios', 'plan-limites', 'reportes', 'auditoria']) {
      expect(ver('owner', { disponible: todo })).toContain(g)
      for (const rol of ['dentista', 'recepcion', 'asistente']) expect(ver(rol, { disponible: todo }), `${rol} ve ${g}`).not.toContain(g)
    }
  })
  it('recepción no ve guías clínicas (consulta, odontograma, recetas, consentimientos, archivos); sí agenda, pagos y corte de caja', () => {
    const r = ver('recepcion', { disponible: todo })
    for (const g of ['consulta', 'odontograma', 'periodontograma', 'recetas', 'consentimientos', 'archivos']) expect(r, g).not.toContain(g)
    for (const g of ['agenda', 'pagos', 'corte-caja', 'crear-paciente', 'sin-conexion']) expect(r, g).toContain(g)
  })
  it('el dentista ve lo clínico, no el corte de caja', () => {
    const r = ver('dentista', { disponible: todo })
    for (const g of ['odontograma', 'recetas', 'consentimientos', 'consulta', 'archivos']) expect(r).toContain(g)
    expect(r).not.toContain('corte-caja')
  })
  it('lo que el plan NO incluye se oculta: sin recetas, sin consentimientos, sin auditoría, sin 3D…', () => {
    const sin = (...faltan) => (codigo) => ![codigo].flat().every((c) => faltan.includes(c))
    expect(ver('dentista', { disponible: sin('recetas') })).not.toContain('recetas')
    expect(ver('dentista', { disponible: sin('recetas') })).toContain('consentimientos')
    expect(ver('owner', { disponible: sin('auditoria') })).not.toContain('auditoria')
    expect(ver('dentista', { disponible: sin('fotografias', 'documentos') })).not.toContain('archivos')
    expect(ver('dentista', { disponible: sin('fotografias') })).toContain('archivos') // basta una de las dos
    expect(ver('owner', { disponible: sin('agenda') })).not.toContain('agenda')
  })
  it('el personal de plataforma ve todo (aunque su rol no sea el de la guía y el plan no la incluya)', () => {
    expect(ver('recepcion', { esSuperAdmin: true, disponible: () => false }).length).toBe(GUIAS_AYUDA.length)
  })
  it('un rol desconocido solo ve lo general (sin roles definidos)', () => {
    const r = ver('inventado', { disponible: todo })
    expect(r).toContain('crear-paciente')
    for (const g of ['usuarios', 'recetas', 'pagos']) expect(r).not.toContain(g)
  })
  it('todas las guías de solución de problemas son para todos los roles', () => {
    for (const rol of ['owner', 'dentista', 'recepcion', 'asistente']) {
      const v = ver(rol, { disponible: todo })
      for (const g of GUIAS_AYUDA.filter((x) => x.categoria === 'Solución de problemas')) expect(v, `${rol} no ve ${g.id}`).toContain(g.id)
    }
  })
})

describe('buscador', () => {
  it('no distingue acentos ni mayúsculas', () => {
    expect(buscarGuias(GUIAS_AYUDA, 'CONEXION').map((g) => g.id)).toContain('sin-conexion')
    expect(buscarGuias(GUIAS_AYUDA, 'Receta').map((g) => g.id)).toContain('recetas')
    expect(buscarGuias(GUIAS_AYUDA, 'periodontograma').length).toBeGreaterThan(0)
  })
  it('vacío o solo espacios devuelve todo; sin coincidencias, nada', () => {
    expect(buscarGuias(GUIAS_AYUDA, '')).toHaveLength(GUIAS_AYUDA.length)
    expect(buscarGuias(GUIAS_AYUDA, '   ')).toHaveLength(GUIAS_AYUDA.length)
    expect(buscarGuias(GUIAS_AYUDA, 'zzzxqwv')).toEqual([])
  })
  it('busca también dentro de los pasos', () => {
    expect(buscarGuias(GUIAS_AYUDA, 'saldo a favor').map((g) => g.id)).toContain('pagos')
  })
})

describe('pantalla de ayuda', () => {
  const f = (codigo, habilitada) => ({ codigo, nombre: codigo, categoria: 'x', habilitada })
  const conRol = (rol, funcs = []) => {
    useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol } })
    usePlanStore.setState({ suscripcion: { sin_suscripcion: false, plan: { nombre: 'P' }, funcionalidades: funcs }, claveSuscripcion: 'u1:c1', cargada: true })
  }
  const pagina = () => renderToStaticMarkup(h(StaticRouter, { location: '/ayuda' }, h(Ayuda)))
  beforeEach(() => { useAuthStore.setState({ perfil: null }); usePlanStore.getState().limpiar() })

  it('el propietario ve el buscador, las categorías y el contacto', () => {
    conRol('owner')
    const r = pagina()
    for (const t of ['Centro de ayuda', 'Buscar en la ayuda', 'Primeros pasos', 'Atención clínica', 'Administración', 'Solución de problemas', 'Registrar un paciente', 'href="/contacto"']) expect(r).toContain(t)
  })
  it('el dentista no ve la administración ni el corte de caja', () => {
    conRol('dentista')
    const r = pagina()
    expect(r).not.toContain('Usuarios de tu clínica')
    expect(r).not.toContain('Tu plan, límites y vencimiento')
    expect(r).not.toContain('Corte de caja</summary>')
    expect(r).toContain('Atender una consulta')
  })
  it('recepción ve agenda, pagos y corte de caja, pero ninguna guía clínica', () => {
    conRol('recepcion')
    const r = pagina()
    for (const t of ['Agenda y citas', 'Registrar y corregir pagos', 'Corte de caja']) expect(r).toContain(t)
    for (const t of ['Atender una consulta', 'Odontograma</summary>', 'Crear, firmar e imprimir recetas', 'Consentimientos informados']) expect(r).not.toContain(t)
  })
  it('un plan sin recetas no muestra su guía', () => {
    conRol('dentista', [f('recetas', false)])
    expect(pagina()).not.toContain('Crear, firmar e imprimir recetas')
    conRol('dentista', [f('recetas', true)])
    expect(pagina()).toContain('Crear, firmar e imprimir recetas')
  })
})
