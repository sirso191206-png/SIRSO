// Fase 2: errores de datos (406 en citas, notas idempotentes y verificadas) — clasificación, servicios, caché, pantalla y cola offline.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { IDBFactory } from 'fake-indexeddb'
import { crearQueryMock, ok } from './offline/helpers/supabaseMock.js'

const m = vi.hoisted(() => ({ from: vi.fn(), getSession: vi.fn(), registro: [], responder: null, cons: null }))
vi.mock('../../../lib/supabase', () => ({ supabase: { from: (...a) => m.from(...a), auth: { getSession: (...a) => m.getSession(...a), onAuthStateChange: vi.fn() }, rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() } }))
vi.mock('../../../hooks/useConsultaForm', () => ({ useConsultaForm: () => m.cons }))
vi.mock('../../../hooks/useDisponibilidad', () => ({ useDisponibilidad: () => () => true }))
vi.mock('../../../store/useAuthStore', () => { const estado = { perfil: { id: 'u1', rol: 'dentista' } }; const f = (sel) => sel(estado); f.subscribe = () => () => {}; f.getState = () => estado; f.setState = () => {}; return { useAuthStore: f } })

import { clasificarErrorDeDatos, ErrorDeDatos, esCeroFilas, esErrorDeDatosDefinitivo, CODIGOS_DATOS } from '../../../lib/erroresDatos.js'
import { obtenerCitaPorId, actualizarCita } from '../../../services/citas.js'
import { crearNotaClinica } from '../../../services/expedientes.js'
import { conCacheDeLectura } from '../../../lib/cacheLectura.js'
import { ConsultaUnificada } from '../../../pages/ConsultaUnificada.jsx'

const CERO = { code: 'PGRST116', details: 'The result contains 0 rows', message: 'Cannot coerce the result to a single JSON object' }
const MUCHAS = { code: 'PGRST116', details: 'The result contains 2 rows', message: 'Cannot coerce the result to a single JSON object' }
const respuesta = (error, data = null) => ({ data, error })

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  m.registro.length = 0; m.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'x' } } })
  m.from.mockReset().mockImplementation((t) => crearQueryMock(t, (tabla, ops) => m.responder(tabla, ops), m.registro))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
const metodos = (i = 0) => m.registro[i].operaciones.map(([n]) => n)

describe('clasificarErrorDeDatos (la respuesta "0 filas" no dice POR QUÉ: se clasifica con lo que sí se sabe)', () => {
  it('0 filas CON sesión → NO_DISPONIBLE, y el texto admite que no puede distinguir inexistente de sin acceso', () => {
    const e = clasificarErrorDeDatos(CERO, { haySesion: true, entidad: 'la cita' })
    expect(e.codigo).toBe('NO_DISPONIBLE'); expect(e.message).toMatch(/no existe o tu usuario no tiene acceso/); expect(e.message).toMatch(/no puede distinguir/); expect(e.original).toBe(CERO)
  })
  it('0 filas SIN sesión → SESION_INVALIDA (un anónimo no ve nada: el problema es la sesión, no la cita)', () => {
    expect(clasificarErrorDeDatos(CERO, { haySesion: false }).codigo).toBe('SESION_INVALIDA')
  })
  it('actualizar con 0 filas → mensaje de actualización (no existe o no puede modificarla)', () => {
    expect(clasificarErrorDeDatos(CERO, { haySesion: true, entidad: 'la cita', accion: 'actualizar' }).message).toMatch(/no se pudo actualizar la cita/i)
  })
  it('token vencido o malformado (401 / PGRST301) → SESION_INVALIDA, tenga o no sesión el cliente', () => {
    expect(clasificarErrorDeDatos({ code: 'PGRST301', message: 'JWT expired' }, { haySesion: true }).codigo).toBe('SESION_INVALIDA')
    expect(clasificarErrorDeDatos({ status: 401, message: 'x' }, { haySesion: true }).codigo).toBe('SESION_INVALIDA')
  })
  it('fallo de conectividad → SIN_CONEXION; 5xx → SERVIDOR_NO_DISPONIBLE', () => {
    expect(clasificarErrorDeDatos({ message: 'TypeError: Failed to fetch', code: '' }).codigo).toBe('SIN_CONEXION')
    expect(clasificarErrorDeDatos(Object.assign(new Error('timeout'), { name: 'TimeoutError' })).codigo).toBe('SIN_CONEXION')
    expect(clasificarErrorDeDatos({ message: 'Service Unavailable', status: 503 }).codigo).toBe('SERVIDOR_NO_DISPONIBLE')
  })
  it('42501 / 403 → SIN_PERMISO, conservando `.code` para quien ya lo leía', () => {
    const e = clasificarErrorDeDatos({ code: '42501', message: 'permission denied for table notas_clinicas' })
    expect(e.codigo).toBe('SIN_PERMISO'); expect(e.code).toBe('42501'); expect(e.message).not.toMatch(/notas_clinicas|permission denied/)
  })
  it('PGRST116 con VARIAS filas NO es "0 filas": no se disfraza de "no disponible"', () => {
    expect(esCeroFilas(MUCHAS)).toBe(false); expect(clasificarErrorDeDatos(MUCHAS).codigo).toBe('DESCONOCIDO')
  })
  it('un error desconocido nunca expone el texto técnico, y un ErrorDeDatos ya clasificado no se reclasifica', () => {
    const e = clasificarErrorDeDatos({ code: 'XX000', message: 'relation "x" does not exist' }); expect(e.codigo).toBe('DESCONOCIDO'); expect(e.message).not.toMatch(/relation/)
    const ya = new ErrorDeDatos('NOTA_CONFLICTO', 'x'); expect(clasificarErrorDeDatos(ya)).toBe(ya)
  })
  it('definitivos para la cola offline: permiso y conflictos de nota SÍ; sesión, red y servidor NO (se reintentan)', () => {
    for (const c of ['SIN_PERMISO', 'NOTA_CONFLICTO', 'NOTA_NO_VERIFICABLE']) expect(esErrorDeDatosDefinitivo({ codigo: c }), c).toBe(true)
    for (const c of ['SESION_INVALIDA', 'SIN_CONEXION', 'SERVIDOR_NO_DISPONIBLE', 'NO_DISPONIBLE', 'DESCONOCIDO']) expect(esErrorDeDatosDefinitivo({ codigo: c }), c).toBe(false)
    expect(CODIGOS_DATOS).toContain('NOTA_NO_CONFIRMADA')
  })
})

describe('obtenerCitaPorId: el 406 se explica, `.single()` se conserva, y la caché no tapa una respuesta definitiva', () => {
  const CITA = { id: 'c1', paciente: { nombre_completo: 'Ana' } }
  it('usa `.single()` (no `.maybeSingle()`): una cita por id debe ser exactamente una', async () => {
    m.responder = () => ok(CITA); await obtenerCitaPorId('c1')
    expect(metodos()).toContain('single'); expect(metodos()).not.toContain('maybeSingle')
  })
  it('0 filas con sesión → error NO_DISPONIBLE explicado (no un genérico ni el texto de PostgREST)', async () => {
    m.responder = () => respuesta(CERO)
    const e = await obtenerCitaPorId('c1').catch((x) => x)
    expect(e).toBeInstanceOf(ErrorDeDatos); expect(e.codigo).toBe('NO_DISPONIBLE'); expect(e.message).not.toMatch(/coerce|JSON object|PGRST/)
  })
  it('0 filas SIN sesión (el cliente cayó a la clave anon) → SESION_INVALIDA, no "la cita no existe"', async () => {
    m.getSession.mockResolvedValue({ data: { session: null } }); m.responder = () => respuesta(CERO)
    expect((await obtenerCitaPorId('c1').catch((x) => x)).codigo).toBe('SESION_INVALIDA')
  })
  it('token vencido (401 PGRST301) → SESION_INVALIDA; fallo de red → SIN_CONEXION', async () => {
    m.responder = () => respuesta({ code: 'PGRST301', status: 401, message: 'JWT expired' }); expect((await obtenerCitaPorId('c1').catch((x) => x)).codigo).toBe('SESION_INVALIDA')
    m.responder = () => respuesta({ message: 'TypeError: Failed to fetch', code: '' }); expect((await obtenerCitaPorId('c2').catch((x) => x)).codigo).toBe('SIN_CONEXION')
  })
  it('SIN CONEXIÓN y con copia en caché → sirve la copia (es para lo que existe la caché)', async () => {
    m.responder = () => ok(CITA); await obtenerCitaPorId('c1'); await new Promise((r) => setTimeout(r, 20))
    m.responder = () => respuesta({ message: 'TypeError: Failed to fetch', code: '' })
    expect(await obtenerCitaPorId('c1')).toMatchObject({ id: 'c1' })
  })
  it('respuesta DEFINITIVA (0 filas / sesión) con copia en caché → NO se abre la copia vieja: se explica el error', async () => {
    m.responder = () => ok(CITA); await obtenerCitaPorId('c1'); await new Promise((r) => setTimeout(r, 20))
    m.responder = () => respuesta(CERO); expect((await obtenerCitaPorId('c1').catch((x) => x)).codigo).toBe('NO_DISPONIBLE')
    m.responder = () => respuesta({ code: 'PGRST301', status: 401, message: 'JWT expired' }); expect((await obtenerCitaPorId('c1').catch((x) => x)).codigo).toBe('SESION_INVALIDA')
  })
  it('conCacheDeLectura sin `usarCacheSi` conserva su comportamiento de siempre (cae a la caché ante cualquier error)', async () => {
    await conCacheDeLectura('k', async () => 'dato'); await new Promise((r) => setTimeout(r, 20))
    expect((await conCacheDeLectura('k', async () => { throw new Error('x') })).datos).toBe('dato')
    await expect(conCacheDeLectura('k', async () => { throw new Error('x') }, { usarCacheSi: () => false })).rejects.toThrow('x')
  })
})

describe('actualizarCita: 0 filas no se confunde con conflicto cuando la causa es la sesión', () => {
  it('con candado de concurrencia y sesión vigente → CONFLICTO_CONCURRENCIA (como siempre)', async () => {
    m.responder = () => respuesta(CERO); await expect(actualizarCita('c1', { estado: 'x' }, 'T0')).rejects.toThrow('CONFLICTO_CONCURRENCIA')
  })
  it('con candado pero SIN sesión → SESION_INVALIDA: la cola offline REINTENTA en vez de descartar la operación como "conflicto"', async () => {
    m.getSession.mockResolvedValue({ data: { session: null } }); m.responder = () => respuesta(CERO)
    expect((await actualizarCita('c1', { estado: 'x' }, 'T0').catch((x) => x)).codigo).toBe('SESION_INVALIDA')
  })
  it('sin candado, 0 filas → explicado (no existe o no puede modificarla), y sigue usando `.single()`', async () => {
    m.responder = () => respuesta(CERO)
    const e = await actualizarCita('c1', { estado: 'x' }).catch((x) => x)
    expect(e.codigo).toBe('NO_DISPONIBLE'); expect(e.message).toMatch(/no se pudo actualizar la cita/i); expect(metodos()).toContain('single')
  })
  it('el guardián de la base (migración 090): marcar "completada" directamente → error tipado COMPLETAR_SOLO_VIA_CONSULTA, definitivo para la cola offline', async () => {
    m.responder = () => respuesta({ code: 'P0001', hint: 'COMPLETAR_SOLO_VIA_CONSULTA', message: 'Una cita solo se completa finalizando la consulta clínica' })
    const e = await actualizarCita('c1', { estado: 'completada' }).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorDeDatos); expect(e.codigo).toBe('COMPLETAR_SOLO_VIA_CONSULTA'); expect(e.message).toMatch(/Ábrela y finalízala desde la consulta/)
    expect(esErrorDeDatosDefinitivo(e)).toBe(true)
  })
  it('las incoherencias que rechaza la base (autor, cita de otro paciente, odontólogo o sillón de otra clínica) son errores tipados INTEGRIDAD_DATOS, DEFINITIVOS y con el mensaje del servidor', async () => {
    for (const hint of ['NOTA_AUTOR_INCOHERENTE', 'NOTA_CITA_INCOHERENTE', 'CITA_DENTISTA_INCOHERENTE', 'CITA_SILLON_INCOHERENTE', 'NOTA_FECHA_FUERA_DE_LIMITE']) {
      m.responder = () => respuesta({ code: 'P0001', hint, message: `mensaje del servidor para ${hint}` })
      const e = await actualizarCita('c1', { dentista_id: 'x' }).catch((x) => x)
      expect(e, hint).toBeInstanceOf(ErrorDeDatos); expect(e.codigo).toBe('INTEGRIDAD_DATOS'); expect(e.message).toBe(`mensaje del servidor para ${hint}`); expect(esErrorDeDatosDefinitivo(e)).toBe(true)
    }
  })
  it('un choque de horario real conserva su mensaje (no lo confunde con permisos ni cero filas)', async () => {
    m.responder = () => respuesta({ code: '23P01', message: 'conflicting key value violates exclusion constraint' })
    await expect(actualizarCita('c1', {})).rejects.toThrow('Ese horario ya está ocupado para este dentista.')
  })
})

describe('crearNotaClinica: guardada, ya existente, conflicto, permisos — nunca un éxito falso', () => {
  const NOTA = { id: 'n1', expediente_id: 'e1', cita_id: 'c1', contenido: 'Se atendió', tipo: 'consulta' }
  const dup = { code: '23505', message: 'duplicate key value violates unique constraint "notas_clinicas_pkey"' }
  const porOperacion = (insert, lectura) => { m.responder = (t, ops) => (ops.some(([n]) => n === 'insert') ? insert : lectura) }
  it('PRIMERA inserción: INSERT (no upsert, no update), devuelve la fila creada', async () => {
    m.responder = () => ok({ ...NOTA }); expect(await crearNotaClinica(NOTA)).toMatchObject({ id: 'n1' })
    expect(metodos()).toContain('insert'); expect(metodos()).not.toContain('upsert'); expect(metodos()).not.toContain('update')
  })
  it('una respuesta SIN fila no se declara guardada (NOTA_NO_CONFIRMADA)', async () => {
    m.responder = () => ok(null); expect((await crearNotaClinica(NOTA).catch((x) => x)).codigo).toBe('NOTA_NO_CONFIRMADA')
  })
  it('REINTENTO de algo que sí se guardó (mismo id y mismo contenido) → éxito marcado `yaExistia`, sin escribir otra vez', async () => {
    porOperacion(respuesta(dup), ok({ ...NOTA }))
    expect(await crearNotaClinica(NOTA)).toMatchObject({ id: 'n1', yaExistia: true })
    expect(m.registro).toHaveLength(2); expect(metodos(1)).not.toContain('insert'); expect(metodos(1)).not.toContain('upsert'); expect(metodos(1)).not.toContain('update')
  })
  it('CONFLICTO: el id existe con OTRO contenido → NOTA_CONFLICTO (no se declara guardada ni se sobrescribe)', async () => {
    porOperacion(respuesta(dup), ok({ ...NOTA, contenido: 'otro texto' }))
    const e = await crearNotaClinica(NOTA).catch((x) => x); expect(e.codigo).toBe('NOTA_CONFLICTO'); expect(e.message).toMatch(/no se sobrescribió/i)
  })
  it('CONFLICTO: el id existe en OTRO expediente o cita → NOTA_CONFLICTO', async () => {
    porOperacion(respuesta(dup), ok({ ...NOTA, expediente_id: 'otro' })); expect((await crearNotaClinica(NOTA).catch((x) => x)).codigo).toBe('NOTA_CONFLICTO')
    porOperacion(respuesta(dup), ok({ ...NOTA, cita_id: 'otra' })); expect((await crearNotaClinica(NOTA).catch((x) => x)).codigo).toBe('NOTA_CONFLICTO')
  })
  it('el id existe pero NO es visible (nota ajena) → NOTA_NO_VERIFICABLE: nunca éxito', async () => {
    porOperacion(respuesta(dup), ok(null)); const e = await crearNotaClinica(NOTA).catch((x) => x)
    expect(e.codigo).toBe('NOTA_NO_VERIFICABLE'); expect(e.message).toMatch(/No se guardó nada nuevo/)
  })
  it('si la verificación misma falla (red) se informa ESE error real, no un éxito', async () => {
    porOperacion(respuesta(dup), respuesta({ message: 'TypeError: Failed to fetch', code: '' })); expect((await crearNotaClinica(NOTA).catch((x) => x)).codigo).toBe('SIN_CONEXION')
  })
  it('PERMISOS: 42501 → SIN_PERMISO (con `.code` conservado); sesión vencida → SESION_INVALIDA; red → SIN_CONEXION; ninguno es éxito', async () => {
    m.responder = () => respuesta({ code: '42501', message: 'new row violates row-level security policy for table "notas_clinicas"' })
    const p = await crearNotaClinica(NOTA).catch((x) => x); expect(p.codigo).toBe('SIN_PERMISO'); expect(p.code).toBe('42501'); expect(p.message).not.toMatch(/row-level|notas_clinicas/)
    m.responder = () => respuesta({ code: 'PGRST301', status: 401, message: 'JWT expired' }); expect((await crearNotaClinica(NOTA).catch((x) => x)).codigo).toBe('SESION_INVALIDA')
    m.responder = () => respuesta({ message: 'TypeError: Failed to fetch', code: '' }); expect((await crearNotaClinica(NOTA).catch((x) => x)).codigo).toBe('SIN_CONEXION')
  })
  it('un duplicado SIN id (no hay qué verificar) se propaga como error, no como éxito', async () => {
    m.responder = () => respuesta(dup); const { id, ...sinId } = NOTA; expect(id).toBe('n1')
    expect((await crearNotaClinica(sinId).catch((x) => x)).code).toBe('23505')
  })
})

describe('pantalla de la consulta cuando la cita no carga', () => {
  const pagina = (extra) => { m.cons = { cargandoCita: false, cita: null, errorCita: { codigo: 'NO_DISPONIBLE', mensaje: 'La cita no existe o tu usuario no tiene acceso a ella.' }, reintentarCarga: () => {}, ...extra }; return renderToStaticMarkup(h(ConsultaUnificada)) }
  it('explica la causa y ofrece Reintentar y Volver (no se queda en "Cargando…")', () => {
    const r = pagina(); expect(r).toContain('No se pudo abrir la consulta'); expect(r).toContain('La cita no existe o tu usuario no tiene acceso a ella.'); expect(r).toContain('Reintentar'); expect(r).toContain('Volver'); expect(r).not.toContain('Cargando consulta')
  })
  it('con la sesión inválida NO ofrece reintentar (reintentar no la arregla)', () => {
    const r = pagina({ errorCita: { codigo: 'SESION_INVALIDA', mensaje: 'Tu sesión venció o no es válida. Vuelve a iniciar sesión.' } }); expect(r).toContain('Vuelve a iniciar sesión'); expect(r).not.toContain('Reintentar')
  })
  it('mientras carga sigue mostrando "Cargando consulta…"', () => { expect(pagina({ cargandoCita: true, errorCita: null })).toContain('Cargando consulta') })
})
