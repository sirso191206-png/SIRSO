// Pantalla de auditoría de la clínica, sus etiquetas, el servicio y el CSV seguro.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { crearQueryMock, ok, fallo, llamada } from './offline/helpers/supabaseMock.js'

const m = vi.hoisted(() => ({ from: vi.fn(), registro: [], respuesta: null }))
vi.mock('../../../lib/supabase', () => ({ supabase: { from: m.from, rpc: vi.fn(), auth: { onAuthStateChange: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn() } }))
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

import { aCsv, celdaCsv } from '../../../lib/csv.js'
import { etiquetaAccion, etiquetaModulo, formatearFechaHora, registroCorto, rangoDeFechas, MODULOS_AUDITABLES, TIPOS_ACCION } from '../../../lib/auditoria.js'
import { listarAuditoria, listarUsuariosParaFiltro, registrarExportacion, TAMANO_PAGINA } from '../../../services/auditoria.js'
import { Auditoria } from '../../../pages/Auditoria.jsx'
import { useAuthStore } from '../../../store/useAuthStore.js'
import { usePlanStore } from '../../../store/usePlanStore.js'

beforeEach(() => {
  m.registro.length = 0
  m.respuesta = () => ok([], { count: 0 })
  m.from.mockReset().mockImplementation((tabla) => crearQueryMock(tabla, (t, ops) => m.respuesta(t, ops), m.registro))
})

describe('CSV seguro para Excel', () => {
  it('escapa comillas, comas y saltos de línea', () => {
    expect(celdaCsv('Pérez, Juan')).toBe('"Pérez, Juan"')
    expect(celdaCsv('dijo "hola"')).toBe('"dijo ""hola"""')
    expect(celdaCsv('a\nb')).toBe('"a\nb"')
    expect(celdaCsv('simple')).toBe('simple')
  })
  it('NEUTRALIZA fórmulas: lo que empiece con = + - @ se vuelve texto (inyección de fórmulas)', () => {
    for (const peligroso of ['=HYPERLINK("http://x","clic")', '+cmd|calc', '-2+3', '@SUM(A1)', '\t=1+1']) {
      expect(celdaCsv(peligroso).replace(/^"/, '')).toMatch(/^'/)
    }
    expect(celdaCsv('=1+1')).toBe("'=1+1")
  })
  it('un texto normal con guion o signo en medio NO se altera', () => {
    expect(celdaCsv('Ana-María')).toBe('Ana-María')
    expect(celdaCsv('1+1')).toBe('1+1')
    expect(celdaCsv(-5)).toBe("'-5") // un número negativo escrito como texto también se protege: es el costo de la regla
  })
  it('nulos y objetos', () => {
    expect(celdaCsv(null)).toBe('')
    expect(celdaCsv(undefined)).toBe('')
    expect(celdaCsv({ a: 1 })).toBe('"{""a"":1}"')
  })
  it('aCsv: BOM para que Excel lea los acentos, encabezado y filas con CRLF', () => {
    const csv = aCsv([{ titulo: 'Nombre', valor: (f) => f.n }, { titulo: 'Nota', valor: (f) => f.t }], [{ n: 'José', t: '=2+2' }, { n: 'Ana', t: 'ok' }])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv.split('\r\n')).toEqual(['\uFEFFNombre,Nota', "José,'=2+2", 'Ana,ok'])
  })
})

describe('etiquetas legibles de la auditoría', () => {
  it('traduce crear/editar/eliminar + módulo', () => {
    expect(etiquetaAccion('crear_pacientes')).toBe('Crear paciente')
    expect(etiquetaAccion('editar_citas')).toBe('Editar cita')
    expect(etiquetaAccion('eliminar_pagos')).toBe('Eliminar pago')
    expect(etiquetaAccion('crear_expedientes')).toBe('Crear expediente')
    expect(etiquetaAccion('editar_notas_clinicas')).toBe('Editar nota clínica')
  })
  it('acciones propias: exportar, cerrar sesión remota y las de plan', () => {
    expect(etiquetaAccion('exportar')).toBe('Exportar información')
    expect(etiquetaAccion('DATA_EXPORTED')).toBe('Exportar los datos de un paciente') // evento que registra la exportación de un expediente
    expect(etiquetaAccion('cerrar_sesion_remota')).toBe('Cerrar sesión de otro dispositivo')
    expect(etiquetaAccion('ajustar_condiciones_clinica')).not.toMatch(/_/)
  })
  it('una acción desconocida se muestra legible, no con guiones bajos', () => {
    expect(etiquetaAccion('cosa_rara_nueva')).toBe('Cosa rara nueva')
    expect(etiquetaAccion('crear_tabla_nueva')).toBe('Crear tabla nueva')
    expect(etiquetaAccion(undefined)).toBe('')
  })
  it('módulos', () => {
    expect(etiquetaModulo('pacientes')).toBe('Pacientes')
    expect(etiquetaModulo('consentimientos_informados')).toBe('Consentimientos')
    expect(etiquetaModulo('algo_nuevo')).toBe('Algo nuevo')
  })
  it('el filtro de módulos no ofrece los internos de plataforma', () => {
    const valores = MODULOS_AUDITABLES.map((x) => x.valor)
    expect(valores).toContain('pacientes')
    for (const interno of ['planes_catalogo', 'suscripciones', 'sesiones']) expect(valores).not.toContain(interno)
    expect(TIPOS_ACCION.map((t) => t.valor)).toEqual(['crear', 'editar', 'eliminar', 'otros'])
  })
  it('registro corto, fecha y rango de fechas (el día "hasta" se incluye completo)', () => {
    expect(registroCorto('abcdef12-3456-7890-abcd-ef1234567890')).toBe('abcdef12')
    expect(registroCorto(null)).toBe('—')
    expect(formatearFechaHora(null)).toBe('')
    const { desde, hasta } = rangoDeFechas('2026-10-01', '2026-10-31')
    expect(new Date(desde).getDate()).toBe(1)
    expect(new Date(hasta).getDate()).toBe(31)
    expect(new Date(hasta).getHours()).toBe(23)
    expect(rangoDeFechas('', '')).toEqual({ desde: null, hasta: null })
  })
})

describe('servicio de auditoría: qué le pide a la base', () => {
  it('sin filtros: ordena por fecha descendente, pagina de 50 y pide solo lo necesario', async () => {
    await listarAuditoria()
    const ops = m.registro[0].operaciones
    expect(m.registro[0].tabla).toBe('auditoria')
    expect(llamada(ops, 'order')[1]).toEqual(['creado_en', { ascending: false }])
    expect(llamada(ops, 'range')[1]).toEqual([0, TAMANO_PAGINA - 1])
    expect(llamada(ops, 'select')[1][0]).not.toMatch(/detalle|\*/) // sin la fila completa del cambio
  })
  it('paginación', async () => {
    await listarAuditoria({ pagina: 2 })
    expect(llamada(m.registro[0].operaciones, 'range')[1]).toEqual([100, 149])
  })
  it('cada filtro llega a la consulta', async () => {
    await listarAuditoria({ desde: '2026-10-01T00:00:00Z', hasta: '2026-10-31T23:59:59Z', usuarioId: 'u1', entidad: 'pagos', tipo: 'crear' })
    const ops = m.registro[0].operaciones
    expect(llamada(ops, 'gte')[1]).toEqual(['creado_en', '2026-10-01T00:00:00Z'])
    expect(llamada(ops, 'lte')[1]).toEqual(['creado_en', '2026-10-31T23:59:59Z'])
    const eqs = ops.filter(([n]) => n === 'eq').map(([, a]) => a)
    expect(eqs).toEqual([['usuario_id', 'u1'], ['entidad', 'pagos']])
    expect(llamada(ops, 'like')[1]).toEqual(['accion', 'crear\\_%'])
  })
  it('"otras" excluye crear, editar y eliminar', async () => {
    await listarAuditoria({ tipo: 'otros' })
    const nots = m.registro[0].operaciones.filter(([n]) => n === 'not').map(([, a]) => a)
    expect(nots).toEqual([['accion', 'like', 'crear\\_%'], ['accion', 'like', 'editar\\_%'], ['accion', 'like', 'eliminar\\_%']])
  })
  it('devuelve filas y total; un error de la base se propaga', async () => {
    m.respuesta = () => ok([{ id: 1 }, { id: 2 }], { count: 37 })
    expect(await listarAuditoria()).toEqual({ filas: [{ id: 1 }, { id: 2 }], total: 37 })
    m.respuesta = () => fallo('boom')
    await expect(listarAuditoria()).rejects.toMatchObject({ message: 'boom' })
  })
  it('registrarExportacion deja constancia con quién, qué y cuántas filas (la clínica la pone el servidor)', async () => {
    await registrarExportacion({ usuarioId: 'u1', entidad: 'auditoria', filas: 12, filtros: { tipo: 'crear' } })
    const op = llamada(m.registro[0].operaciones, 'insert')
    expect(op[1][0]).toEqual({ usuario_id: 'u1', accion: 'exportar', entidad: 'auditoria', detalle: { filas: 12, filtros: { tipo: 'crear' } } })
    expect(op[1][0]).not.toHaveProperty('clinica_id')
  })
  it('si no se puede registrar la exportación, el error se propaga (no se exporta en silencio)', async () => {
    m.respuesta = () => fallo('RLS')
    await expect(registrarExportacion({ usuarioId: 'u', entidad: 'x', filas: 1 })).rejects.toMatchObject({ message: 'RLS' })
  })
  it('listarUsuariosParaFiltro ordena por nombre', async () => {
    m.respuesta = () => ok([{ id: 'a', nombre: 'Ana' }])
    expect(await listarUsuariosParaFiltro()).toEqual([{ id: 'a', nombre: 'Ana' }])
    expect(llamada(m.registro[0].operaciones, 'order')[1]).toEqual(['nombre'])
  })
})

describe('pantalla de auditoría', () => {
  const f = (codigo, habilitada) => ({ codigo, nombre: `Func ${codigo}`, categoria: 'x', habilitada })
  const conRol = (rol, funcs = [], extra = {}) => {
    useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol, ...extra } })
    usePlanStore.setState({ suscripcion: { sin_suscripcion: false, plan: { nombre: 'P' }, funcionalidades: funcs }, claveSuscripcion: 'u1:c1', cargada: true })
  }
  const pagina = () => renderToStaticMarkup(h(StaticRouter, { location: '/auditoria' }, h(Auditoria)))

  it('el owner ve los filtros (fechas, usuario, módulo, tipo) y los botones', () => {
    conRol('owner', [f('reportes', true)])
    const html = pagina()
    for (const t of ['Auditoría', 'Desde', 'Hasta', 'Usuario', 'Módulo', 'Tipo de acción', 'Buscar', 'Limpiar filtros']) expect(html).toContain(t)
  })
  it('"Exportar CSV" solo aparece si el plan incluye reportes', () => {
    conRol('owner', [f('reportes', true)])
    expect(pagina()).toContain('Exportar CSV')
    conRol('owner', [f('reportes', false)])
    expect(pagina()).not.toContain('Exportar CSV')
  })
  it('dentista, recepción y asistente ven el aviso y NINGÚN control', () => {
    for (const rol of ['dentista', 'recepcion', 'asistente']) {
      conRol(rol, [f('reportes', true)])
      const html = pagina()
      expect(html).toContain('solo está disponible para el propietario')
      expect(html).not.toContain('Buscar')
    }
  })
  it('el superadmin también puede entrar', () => {
    conRol('dentista', [], { es_super_admin: true })
    expect(pagina()).toContain('Limpiar filtros')
  })
})
