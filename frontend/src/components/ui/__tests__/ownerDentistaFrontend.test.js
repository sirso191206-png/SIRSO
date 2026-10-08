// El propietario también puede ejercer como dentista (migración 084): una sola regla en toda la interfaz.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TestRenderer, { act } from 'react-test-renderer'
import { readFileSync } from 'node:fs'
import { crearQueryMock, ok, fallo, llamada } from './offline/helpers/supabaseMock.js'

const m = vi.hoisted(() => ({ from: vi.fn(), registro: [], responder: null }))
vi.mock('../../../lib/supabase', () => ({ supabase: { from: m.from, rpc: vi.fn(), auth: { onAuthStateChange: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn() }, invocarFuncionAutenticada: vi.fn() }))
vi.mock('../../../lib/cacheLectura', () => ({ conCacheDeLectura: async (_clave, fn) => ({ datos: await fn(), deCache: false }) }))
vi.mock('zustand', async (importarOriginal) => {
  const real = await importarOriginal()
  return { ...real, create: (inicial) => { const api = real.createStore(inicial); api.getServerState = api.getState; const hook = (sel, eq) => real.useStore(api, sel, eq); Object.assign(hook, api); return hook } }
})

import { ejerceComoDentista, nombreParaSelector } from '../../../lib/profesionales.js'
import { listarDentistas, actualizarMiPerfilProfesional } from '../../../services/usuarios.js'
import { SelectorDentistaResponsable } from '../../paciente/SelectorDentistaResponsable.jsx'
import { CapaEtiquetas } from '../../odontograma/CapaEtiquetas3D.jsx'
import { useAuthStore } from '../../../store/useAuthStore.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const leer = (ruta) => readFileSync(new URL(`../../../${ruta}`, import.meta.url), 'utf8')

describe('ejerceComoDentista: una sola regla', () => {
  it('un dentista sí; un owner solo si lo indicó; nadie más', () => {
    expect(ejerceComoDentista({ rol: 'dentista' })).toBe(true)
    expect(ejerceComoDentista({ rol: 'owner', ejerce_como_dentista: true })).toBe(true)
    for (const p of [{ rol: 'owner' }, { rol: 'owner', ejerce_como_dentista: false }, { rol: 'owner', ejerce_como_dentista: 'true' }, { rol: 'owner', ejerce_como_dentista: 1 },
      { rol: 'recepcion' }, { rol: 'asistente' }, { rol: 'recepcion', ejerce_como_dentista: true }, { rol: 'asistente', ejerce_como_dentista: true }, {}, null, undefined]) expect(ejerceComoDentista(p), JSON.stringify(p)).toBe(false)
  })
  it('el propietario se distingue en los selectores; los demás no cambian', () => {
    expect(nombreParaSelector({ rol: 'owner', nombre: 'Dra. Ana' })).toBe('Dra. Ana (propietario)')
    expect(nombreParaSelector({ rol: 'dentista', nombre: 'Dr. Luis' })).toBe('Dr. Luis')
    expect(nombreParaSelector(undefined)).toBeUndefined()
  })
})

describe('listarDentistas: dentistas activos + propietarios que ejercen', () => {
  beforeEach(() => { m.registro.length = 0; m.from.mockReset().mockImplementation((t) => crearQueryMock(t, () => m.responder(), m.registro)) })
  it('pide dentistas O propietarios con la marca, solo activos, ordenados — y un propietario SIN la marca no entra', async () => {
    m.responder = () => ok([{ id: '1', nombre: 'Dr. Luis', rol: 'dentista' }, { id: '2', nombre: 'Dra. Ana', rol: 'owner' }])
    const r = await listarDentistas()
    const ops = m.registro[0].operaciones
    expect(m.registro[0].tabla).toBe('usuarios')
    expect(llamada(ops, 'select')[1][0]).toBe('id, nombre, rol')
    expect(llamada(ops, 'or')[1][0]).toBe('rol.eq.dentista,and(rol.eq.owner,ejerce_como_dentista.eq.true)')
    expect(llamada(ops, 'eq')[1]).toEqual(['activo', true]); expect(llamada(ops, 'order')[1][0]).toBe('nombre')
    expect(r).toEqual([{ id: '1', nombre: 'Dr. Luis', rol: 'dentista' }, { id: '2', nombre: 'Dra. Ana (propietario)', rol: 'owner' }])
  })
  it('un error de la base se propaga', async () => { m.responder = () => fallo('boom'); await expect(listarDentistas()).rejects.toMatchObject({ message: 'boom' }) })
})

describe('actualizarMiPerfilProfesional: la marca solo viaja cuando se manda a propósito', () => {
  beforeEach(() => { m.registro.length = 0; m.from.mockReset().mockImplementation((t) => crearQueryMock(t, () => m.responder(), m.registro)); m.responder = () => ok({ id: 'u' }) })
  const cambios = () => llamada(m.registro[0].operaciones, 'update')[1][0]
  const base = { nombre: 'X', rfc: '', cedulaProfesional: '123', escuelaProcedencia: '', firmaPng: null }
  it('true y false se guardan (también APAGAR la marca)', async () => {
    await actualizarMiPerfilProfesional('u', { ...base, ejerceComoDentista: true }); expect(cambios().ejerce_como_dentista).toBe(true)
    m.registro.length = 0; await actualizarMiPerfilProfesional('u', { ...base, ejerceComoDentista: false }); expect(cambios().ejerce_como_dentista).toBe(false)
  })
  it('si no se manda (dentistas, asistentes, recepción) NO se toca la columna', async () => {
    await actualizarMiPerfilProfesional('u', base); expect('ejerce_como_dentista' in cambios()).toBe(false)
    m.registro.length = 0; await actualizarMiPerfilProfesional('u', { ...base, ejerceComoDentista: undefined }); expect('ejerce_como_dentista' in cambios()).toBe(false)
  })
  it('un valor que no es booleano no se manda', async () => {
    for (const v of ['true', 1, null]) { m.registro.length = 0; await actualizarMiPerfilProfesional('u', { ...base, ejerceComoDentista: v }); expect('ejerce_como_dentista' in cambios(), String(v)).toBe(false) }
  })
  it('el resto del perfil sigue guardándose igual', async () => {
    await actualizarMiPerfilProfesional('u', { nombre: 'Ana', rfc: 'ABC', cedulaProfesional: '999', escuelaProcedencia: 'UNAM', firmaPng: 'data:x' })
    expect(cambios()).toMatchObject({ nombre: 'Ana', rfc: 'ABC', cedula_profesional: '999', escuela_procedencia: 'UNAM', firma_png: 'data:x' })
  })
})

describe('la interfaz usa la misma regla', () => {
  it('al agendar una cita y una urgencia, el propietario-dentista parte seleccionado a sí mismo (ya no solo rol === "dentista")', () => {
    for (const ruta of ['components/agenda/ModalNuevaCita.jsx', 'components/ModalNuevaUrgencia.jsx']) {
      const codigo = leer(ruta); expect(codigo, ruta).toMatch(/ejerceComoDentista\(perfil\)/); expect(codigo, ruta).not.toMatch(/perfil\??\.rol === 'dentista'/)
    }
  })
  it('"Datos profesionales" ofrece la opción SOLO al propietario, y a los demás roles ni se les manda', () => {
    const codigo = leer('components/layout/Sidebar.jsx')
    expect(codigo).toContain('Atiendo pacientes como dentista')
    expect(codigo).toMatch(/perfil\?\.rol === 'owner' && \(\s*<label/)
    expect(codigo).toMatch(/if \(perfil\.rol !== 'owner'\) delete datosGuardar\.ejerceComoDentista/)
  })
  it('las pantallas que listan odontólogos usan la lista única (listarDentistas), no una consulta propia por rol', () => {
    for (const ruta of ['pages/Agenda.jsx', 'pages/Usuarios.jsx', 'components/paciente/SelectorDentistaResponsable.jsx', 'pages/Dashboard.jsx']) { expect(leer(ruta), ruta).toMatch(/listarDentistas/); expect(leer(ruta), ruta).not.toMatch(/eq\('rol', 'dentista'\)/) }
  })
})

describe('SelectorDentistaResponsable', () => {
  beforeEach(() => useAuthStore.setState({ perfil: null }))
  const html = (paciente) => renderToStaticMarkup(h(SelectorDentistaResponsable, { paciente }))
  it('solo el owner lo ve', () => {
    for (const rol of ['dentista', 'recepcion', 'asistente']) { useAuthStore.setState({ perfil: { id: 'u', rol } }); expect(html({ id: 'p', dentista_responsable_id: null }), rol).toBe('') }
    useAuthStore.setState({ perfil: { id: 'u', rol: 'owner' } }); expect(html({ id: 'p', dentista_responsable_id: null })).toContain('Odontólogo responsable')
  })
  it('si el responsable actual ya no está en la lista, se muestra como "actual" en vez de aparentar "Sin asignar"', () => {
    useAuthStore.setState({ perfil: { id: 'u', rol: 'owner' } })
    const r = html({ id: 'p', dentista_responsable_id: 'xyz', dentista_responsable: { rol: 'owner', nombre: 'Dra. Ana' } })
    expect(r).toContain('Dra. Ana (propietario) (actual)'); expect(r).toContain('value="xyz"')
    expect(html({ id: 'p', dentista_responsable_id: 'xyz' })).toContain('Responsable actual')
  })
  it('sin responsable no se agrega ninguna opción extra', () => {
    useAuthStore.setState({ perfil: { id: 'u', rol: 'owner' } }); expect(html({ id: 'p', dentista_responsable_id: null })).not.toContain('(actual)')
  })
})

describe('CapaEtiquetas: UN solo árbol de React, y el registro se limpia al desmontar', () => {
  const items = [{ clave: 'numero-11', posicion: [0, 0, 0], distanceFactor: 10, children: h('span', null, '11') }, { clave: 'simbolo-11', posicion: [0, 1, 0], distanceFactor: 10, children: h('span', null, 'X') }]
  it('cada etiqueta es un elemento propio, oculto hasta que el proyector lo coloque, y SIN eventos del navegador', () => {
    const r = renderToStaticMarkup(h(CapaEtiquetas, { items, registroRef: { current: new Map() } }))
    expect(r).toContain('data-etiqueta="numero-11"'); expect(r).toContain('data-etiqueta="simbolo-11"'); expect(r).toContain('display:none'); expect(r).toContain('pointer-events-none'); expect(r).toContain('aria-hidden="true"')
  })
  it('al montar registra cada elemento por su clave y al desmontar los quita (no retiene nodos)', () => {
    const registroRef = { current: new Map() }; let r
    act(() => { r = TestRenderer.create(h(CapaEtiquetas, { items, registroRef }), { createNodeMock: () => ({ style: {} }) }) })
    expect([...registroRef.current.keys()].sort()).toEqual(['numero-11', 'simbolo-11'])
    act(() => { r.update(h(CapaEtiquetas, { items: [items[0]], registroRef })) }); expect([...registroRef.current.keys()]).toEqual(['numero-11'])
    act(() => { r.unmount() }); expect(registroRef.current.size).toBe(0)
  })
})
