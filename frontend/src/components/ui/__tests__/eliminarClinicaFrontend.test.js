// Eliminar una clínica: reglas de confirmación, interfaz, flujo del modal y coherencia de la Edge Function con la migración 086.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TestRenderer, { act } from 'react-test-renderer'
import { readFileSync } from 'node:fs'

const m = vi.hoisted(() => ({ previsualizar: vi.fn(), eliminar: vi.fn(), toastExito: vi.fn(), toastError: vi.fn(), invocar: vi.fn() }))
vi.mock('../../../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), auth: { onAuthStateChange: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn() }, invocarFuncionAutenticada: (...a) => m.invocar(...a) }))
vi.mock('../../../services/admin', async (importar) => ({ ...(await importar()), previsualizarEliminacionClinica: (...a) => m.previsualizar(...a), eliminarClinica: (...a) => m.eliminar(...a) }))
vi.mock('../../../store/useToastStore', () => ({ toastExito: (...a) => m.toastExito(...a), toastError: (...a) => m.toastError(...a) }))
vi.mock('../../ui/Modal', () => ({ Modal: ({ abierto, children }) => (abierto ? h('div', { 'data-modal': '' }, children) : null) }))

import { puedeConfirmarEliminacion, conteosNoVacios, ETIQUETAS_CONTEO, fechaDDMMAAAA, resumenConservacion } from '../../../lib/eliminarClinica.js'
import { ContenidoEliminarClinica, ModalEliminarClinica } from '../../administracion/ModalEliminarClinica.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const resumen = (extra = {}) => ({ existe: true, nombre: 'Clínica A', estado: 'suspendida', puede_eliminar: true, bloqueos: [],
  conteos: { usuarios: 3, pacientes: 2, citas: 0, notas_clinicas: 5 }, se_conserva: { auditoria: 12, solicitudes_arco: 1, incidentes_seguridad: 0 }, ...extra })
const leer = (ruta) => readFileSync(new URL(`../../../../../${ruta}`, import.meta.url), 'utf8')

describe('puedeConfirmarEliminacion: el botón solo se ofrece si el servidor lo va a aceptar', () => {
  const base = { resumen: resumen(), confirmarNombre: 'Clínica A', confirmarDatos: true }
  it('con todo en regla sí', () => expect(puedeConfirmarEliminacion(base)).toBe(true))
  it('el nombre debe ser exacto (mayúsculas y acentos incluidos); se toleran espacios en los extremos', () => {
    for (const n of ['', 'clínica a', 'Clinica A', 'Clínica', 'Clínica A!']) expect(puedeConfirmarEliminacion({ ...base, confirmarNombre: n }), n).toBe(false)
    expect(puedeConfirmarEliminacion({ ...base, confirmarNombre: '  Clínica A  ' })).toBe(true)
  })
  it('con pacientes exige la confirmación de datos clínicos; sin pacientes no hace falta', () => {
    expect(puedeConfirmarEliminacion({ ...base, confirmarDatos: false })).toBe(false)
    expect(puedeConfirmarEliminacion({ ...base, confirmarDatos: 'true' })).toBe(false)
    expect(puedeConfirmarEliminacion({ resumen: resumen({ conteos: { pacientes: 0 } }), confirmarNombre: 'Clínica A', confirmarDatos: false })).toBe(true)
  })
  it('si hay bloqueos (p. ej. clínica activa) NUNCA, aunque todo lo demás esté bien', () => {
    expect(puedeConfirmarEliminacion({ ...base, resumen: resumen({ puede_eliminar: false, bloqueos: [{ codigo: 'NO_SUSPENDIDA', mensaje: 'x' }] }) })).toBe(false)
  })
  it('sin resumen, o de una clínica que no existe: no', () => {
    expect(puedeConfirmarEliminacion({ ...base, resumen: null })).toBe(false); expect(puedeConfirmarEliminacion({ ...base, resumen: { existe: false } })).toBe(false)
  })
  it('conteosNoVacios solo lista lo que tiene algo', () => {
    expect(conteosNoVacios({ usuarios: 3, pacientes: 0, citas: '2' }, ETIQUETAS_CONTEO).map((x) => [x.clave, x.cantidad])).toEqual([['usuarios', 3], ['citas', 2]])
  })
})

describe('política de conservación en la interfaz', () => {
  it('fechaDDMMAAAA usa UTC (igual que el servidor) y rechaza fechas inválidas', () => {
    expect(fechaDDMMAAAA('2031-03-01T00:30:00+00:00')).toBe('01/03/2031'); expect(fechaDDMMAAAA('2031-12-31T23:59:59Z')).toBe('31/12/2031')
    expect(fechaDDMMAAAA(null)).toBeNull(); expect(fechaDDMMAAAA('no es fecha')).toBeNull()
  })
  it('resumenConservacion: null sin política o sin registros; con ambos, indica si el plazo ya se cumplió', () => {
    expect(resumenConservacion({ politica_anios: null, ultimo_registro_clinico: '2020-01-01T00:00:00Z' })).toBeNull()
    expect(resumenConservacion({ politica_anios: 5, ultimo_registro_clinico: null })).toBeNull()
    const futuro = resumenConservacion({ politica_anios: 5, ultimo_registro_clinico: '2090-01-01T00:00:00Z', conservar_hasta: '2095-01-01T00:00:00Z' })
    expect(futuro).toMatchObject({ categoria: 'clinico', anios: 5, ultimo: '01/01/2090', hasta: '01/01/2095', cumplido: false })
    expect(resumenConservacion({ politica_anios: 5, ultimo_registro_clinico: '2010-01-01T00:00:00Z', conservar_hasta: '2015-01-01T00:00:00Z' }).cumplido).toBe(true)
  })
  const pag = (extra) => renderToStaticMarkup(h(ContenidoEliminarClinica, { resumen: resumen(extra), cargando: false, error: null, confirmarNombre: '', onNombre: () => {}, confirmarDatos: false, onDatos: () => {}, eliminando: false, onEliminar: () => {}, onCancelar: () => {} }))
  it('dentro de plazo: muestra la política, el último registro y la fecha hasta la que no se puede eliminar, junto al bloqueo', () => {
    const r = pag({ puede_eliminar: false, politica_anios: 5, ultimo_registro_clinico: '2090-01-01T00:00:00Z', conservar_hasta: '2095-01-01T00:00:00Z',
      bloqueos: [{ codigo: 'DENTRO_PLAZO_CONSERVACION', mensaje: 'La información clínica debe conservarse 5 año(s).' }] })
    expect(r).toContain('data-conservacion'); expect(r).toContain('5 año(s)'); expect(r).toContain('01/01/2090'); expect(r).toContain('No se puede eliminar hasta el 01/01/2095'); expect(r).toContain('No se puede eliminar todavía')
  })
  it('sin política definida: se muestra el bloqueo (con su explicación) y NO inventa una política', () => {
    const r = pag({ puede_eliminar: false, politica_anios: null, ultimo_registro_clinico: '2090-01-01T00:00:00Z', conservar_hasta: null,
      bloqueos: [{ codigo: 'POLITICA_CONSERVACION_NO_DEFINIDA', mensaje: 'No está definida una política de conservación. Puedes suspender la clínica.' }] })
    expect(r).not.toContain('data-conservacion'); expect(r).toContain('No está definida una política de conservación'); expect(r).toContain('Puedes suspender la clínica')
  })
  it('compatibilidad: con una vista previa SIN el bloque `conservacion` (versión anterior) la categoría clínica sigue mostrándose', () => {
    expect(resumenConservacion({ politica_anios: 5, ultimo_registro_clinico: '2090-01-01T00:00:00Z', conservar_hasta: '2095-01-01T00:00:00Z' })).toMatchObject({ categoria: 'clinico', anios: 5 })
  })
  it('plazo cumplido: lo dice y permite continuar con las confirmaciones de siempre', () => {
    const r = pag({ politica_anios: 5, ultimo_registro_clinico: '2010-01-01T00:00:00Z', conservar_hasta: '2015-01-01T00:00:00Z' })
    expect(r).toContain('El plazo se cumplió el 01/01/2015'); expect(r).not.toContain('No se puede eliminar todavía')
  })
})

describe('conservación por categorías en la interfaz (fase 3)', () => {
  const pag = (extra) => renderToStaticMarkup(h(ContenidoEliminarClinica, { resumen: resumen(extra), cargando: false, error: null, confirmarNombre: '', onNombre: () => {}, confirmarDatos: false, onDatos: () => {}, eliminando: false, onEliminar: () => {}, onCancelar: () => {} }))
  const conservacion = { clinico: { politica_anios: 5, ultimo_registro: '2090-01-01T00:00:00Z', conservar_hasta: '2095-01-01T00:00:00Z' }, fiscal: { politica_anios: 7, ultimo_registro: '2088-06-01T00:00:00Z', conservar_hasta: '2095-06-01T00:00:00Z' }, contractual: { politica_anios: null, ultimo_registro: '2090-01-01T00:00:00Z', conservar_hasta: null } }
  it('resumenConservacion por categoría: usa SU política y SU fecha (clínica, fiscal, contractual), y es null si esa categoría no tiene política', () => {
    expect(resumenConservacion({ conservacion }, 'fiscal')).toMatchObject({ categoria: 'fiscal', anios: 7, ultimo: '01/06/2088', hasta: '01/06/2095', cumplido: false })
    expect(resumenConservacion({ conservacion }, 'clinico')).toMatchObject({ anios: 5, hasta: '01/01/2095' }); expect(resumenConservacion({ conservacion }, 'contractual')).toBeNull(); expect(resumenConservacion({}, 'fiscal')).toBeNull()
  })
  it('muestra una línea por categoría con política, cada una con su plazo, y los AVISOS (p. ej. contractual no evaluado)', () => {
    const r = pag({ conservacion, advertencias: [{ codigo: 'CONTRACTUAL_NO_EVALUADO', mensaje: 'No hay política de conservación contractual: se eliminarán con la clínica.' }] })
    expect(r).toContain('data-conservacion="clinico"'); expect(r).toContain('data-conservacion="fiscal"'); expect(r).not.toContain('data-conservacion="contractual"')
    expect(r).toContain('Pagos (fiscal)'); expect(r).toContain('7 año(s)'); expect(r).toContain('No se puede eliminar hasta el 01/06/2095'); expect(r).toContain('No hay política de conservación contractual')
  })
  it('bloqueos fiscales y contractuales se muestran con su motivo', () => {
    const r = pag({ puede_eliminar: false, bloqueos: [{ codigo: 'POLITICA_FISCAL_NO_DEFINIDA', mensaje: 'No hay política fiscal definida.' }, { codigo: 'DENTRO_PLAZO_CONTRACTUAL', mensaje: 'Las suscripciones deben conservarse 3 año(s).' }] })
    expect(r).toContain('No hay política fiscal definida.'); expect(r).toContain('Las suscripciones deben conservarse'); expect(r).toContain('No se puede eliminar todavía')
  })
})

describe('ContenidoEliminarClinica (interfaz)', () => {
  const pagina = (p) => renderToStaticMarkup(h(ContenidoEliminarClinica, { resumen: resumen(), cargando: false, error: null, confirmarNombre: '', onNombre: () => {}, confirmarDatos: false, onDatos: () => {}, eliminando: false, onEliminar: () => {}, onCancelar: () => {}, ...p }))
  it('muestra lo que se destruye (con cantidades) y lo que se CONSERVA, sin listar lo que está en cero', () => {
    const r = pagina()
    expect(r).toContain('Clínica A'); expect(r).toMatch(/Pacientes: <strong>2<\/strong>/); expect(r).toMatch(/Notas clínicas: <strong>5<\/strong>/)
    expect(r).not.toContain('Citas:'); expect(r).toContain('Registros de auditoría'); expect(r).toContain('Solicitudes ARCO'); expect(r).not.toContain('Incidentes de seguridad')
  })
  it('con pacientes pide la confirmación explícita de destrucción de datos clínicos', () => {
    expect(pagina()).toMatch(/Entiendo que se destruirá de forma <strong>permanente<\/strong> la información clínica de 2 paciente/)
    expect(pagina({ resumen: resumen({ conteos: { pacientes: 0, usuarios: 1 } }) })).not.toContain('Entiendo que se destruirá')
  })
  it('un bloqueo se explica con su motivo y deshabilita el nombre y la casilla', () => {
    const r = pagina({ resumen: resumen({ puede_eliminar: false, bloqueos: [{ codigo: 'NO_SUSPENDIDA', mensaje: 'La clínica está activa. Suspéndela primero (es reversible).' }] }) })
    expect(r).toContain('No se puede eliminar todavía'); expect(r).toContain('Suspéndela primero'); expect(r).toContain('role="alert"'); expect((r.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })
  it('estados: cargando, error de la revisión, clínica inexistente', () => {
    expect(pagina({ cargando: true })).toContain('Revisando qué se eliminaría')
    expect(pagina({ error: 'No se pudo revisar la clínica: x' })).toContain('No se pudo revisar')
    expect(pagina({ resumen: { existe: false } })).toContain('ya no existe')
  })
  it('el botón de eliminar está deshabilitado hasta que se cumple todo', () => {
    expect(pagina()).toMatch(/Eliminar definitivamente/); expect(pagina({ confirmarNombre: 'Clínica A', confirmarDatos: true })).not.toMatch(/disabled="">Eliminar definitivamente/)
    expect(pagina({ confirmarNombre: 'Clínica A', confirmarDatos: false })).toMatch(/disabled=""[^>]*>Eliminar definitivamente|Eliminar definitivamente<\/button>/)
  })
})

describe('ModalEliminarClinica (flujo)', () => {
  beforeEach(() => { Object.values(m).forEach((f) => f.mockReset()); vi.spyOn(console, 'warn').mockImplementation(() => {}) })
  const asincrono = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  async function abrir(props = {}) {
    const onEliminada = vi.fn(); const onCerrar = vi.fn(); let r
    act(() => { r = TestRenderer.create(h(ModalEliminarClinica, { abierto: true, clinicaId: 'c-A', onCerrar, onEliminada, ...props })) }); await asincrono()
    const texto = () => JSON.stringify(r.toJSON())
    const boton = (t) => r.root.findAll((n) => n.type === 'button').find((b) => JSON.stringify(b.props.children).includes(t))
    const escribir = (v) => act(() => { r.root.findAll((n) => n.type === 'input' && n.props.type === 'text')[0].props.onChange({ target: { value: v } }) })
    const marcar = () => act(() => { r.root.findAll((n) => n.type === 'input' && n.props.type === 'checkbox')[0].props.onChange({ target: { checked: true } }) })
    return { r, onEliminada, onCerrar, texto, boton, escribir, marcar }
  }

  it('al abrir pide una vista previa FRESCA de ESA clínica (no una foto vieja)', async () => {
    m.previsualizar.mockResolvedValue({ resumen: resumen() })
    const v = await abrir()
    expect(m.previsualizar).toHaveBeenCalledTimes(1); expect(m.previsualizar).toHaveBeenCalledWith('c-A'); expect(v.texto()).toContain('Pacientes')
  })
  it('si la vista previa falla, lo dice y NO ofrece eliminar a ciegas', async () => {
    m.previsualizar.mockRejectedValue(new Error('sin red'))
    const v = await abrir()
    expect(v.texto()).toContain('No se pudo revisar la clínica: sin red'); expect(v.boton('Eliminar definitivamente')).toBeUndefined()
  })
  it('eliminar con todo confirmado: llama con el nombre y la confirmación de datos clínicos, avisa y cierra el flujo', async () => {
    m.previsualizar.mockResolvedValue({ resumen: resumen() }); m.eliminar.mockResolvedValue({ ok: true, estado: 'eliminada_completa', advertencias: [], pendientes: { total: 0 } })
    const v = await abrir(); v.escribir('Clínica A'); v.marcar()
    await act(async () => { await v.boton('Eliminar definitivamente').props.onClick() })
    expect(m.eliminar).toHaveBeenCalledWith('c-A', 'Clínica A', true); expect(m.toastExito).toHaveBeenCalledWith('Clínica eliminada por completo (base de datos, archivos y cuentas de acceso).'); expect(v.onEliminada).toHaveBeenCalledTimes(1)
  })
  it('si quedó limpieza pendiente (archivos o cuentas) NO se anuncia "por completo": se informa con cantidades y que está en la auditoría', async () => {
    m.previsualizar.mockResolvedValue({ resumen: resumen() }); m.eliminar.mockResolvedValue({ ok: true, estado: 'eliminada_con_limpieza_pendiente', advertencias: ['x'], pendientes: { archivos: 3, cuentas: 1 } })
    const v = await abrir(); v.escribir('Clínica A'); v.marcar()
    await act(async () => { await v.boton('Eliminar definitivamente').props.onClick() })
    expect(m.toastExito).not.toHaveBeenCalled(); expect(m.toastError.mock.calls[0][0]).toMatch(/NO está completa.*3 archivo\(s\) y 1 cuenta\(s\).*auditoría/); expect(v.onEliminada).toHaveBeenCalledTimes(1)
  })
  it('una respuesta SIN el estado `eliminada_completa` (p. ej. de una versión anterior) NUNCA se anuncia como completa', async () => {
    m.previsualizar.mockResolvedValue({ resumen: resumen() }); m.eliminar.mockResolvedValue({ ok: true, advertencias: [] })
    const v = await abrir(); v.escribir('Clínica A'); v.marcar()
    await act(async () => { await v.boton('Eliminar definitivamente').props.onClick() })
    expect(m.toastExito).not.toHaveBeenCalled(); expect(m.toastError).toHaveBeenCalledWith(expect.stringMatching(/NO está completa/))
  })
  it('si no se pudo ni confirmar qué quedó pendiente, lo dice así (no inventa una cifra)', async () => {
    m.previsualizar.mockResolvedValue({ resumen: resumen() }); m.eliminar.mockResolvedValue({ ok: true, estado: 'eliminada_con_limpieza_pendiente', advertencias: ['x'], pendientes: { desconocido: true } })
    const v = await abrir(); v.escribir('Clínica A'); v.marcar()
    await act(async () => { await v.boton('Eliminar definitivamente').props.onClick() })
    expect(m.toastError.mock.calls[0][0]).toMatch(/no se pudo confirmar qué quedó pendiente/)
  })
  it('si el servidor rechaza (nada se borró), muestra el motivo, NO navega y se puede reintentar', async () => {
    m.previsualizar.mockResolvedValue({ resumen: resumen() }); m.eliminar.mockRejectedValueOnce(new Error('La clínica está activa.')).mockResolvedValueOnce({ ok: true, estado: 'eliminada_completa', advertencias: [] })
    const v = await abrir(); v.escribir('Clínica A'); v.marcar()
    await act(async () => { await v.boton('Eliminar definitivamente').props.onClick() })
    expect(m.toastError).toHaveBeenCalledWith('No se pudo eliminar la clínica: La clínica está activa.'); expect(v.onEliminada).not.toHaveBeenCalled()
    await act(async () => { await v.boton('Eliminar definitivamente').props.onClick() })
    expect(m.eliminar).toHaveBeenCalledTimes(2); expect(v.onEliminada).toHaveBeenCalledTimes(1)
  })
  it('sin el nombre exacto y la confirmación el botón está deshabilitado; un clic doble no envía dos veces', async () => {
    let liberar; m.previsualizar.mockResolvedValue({ resumen: resumen() }); m.eliminar.mockReturnValue(new Promise((r) => { liberar = r }))
    const v = await abrir()
    expect(v.boton('Eliminar definitivamente').props.disabled).toBe(true)
    v.escribir('Clínica A'); v.marcar(); expect(v.boton('Eliminar definitivamente').props.disabled).toBe(false)
    let p1, p2; await act(async () => { p1 = v.boton('Eliminar definitivamente').props.onClick(); p2 = v.boton('Eliminar definitivamente').props.onClick() })
    await act(async () => { liberar({ ok: true, estado: 'eliminada_completa', advertencias: [] }); await Promise.all([p1, p2]) })
    expect(m.eliminar).toHaveBeenCalledTimes(1)
  })
  it('cerrado no consulta nada', async () => {
    const v = await abrir({ abierto: false }); expect(m.previsualizar).not.toHaveBeenCalled(); expect(v.texto()).toBe('null')
  })
})

describe('servicio admin: eliminar y previsualizar', () => {
  it('llaman a la Edge Function con la acción correcta; la confirmación de datos solo viaja si es EXACTAMENTE true', async () => {
    vi.resetModules(); vi.doUnmock('../../../services/admin')
    const real = await vi.importActual('../../../services/admin.js')
    m.invocar.mockResolvedValue({ ok: true })
    await real.previsualizarEliminacionClinica('c1'); expect(m.invocar).toHaveBeenLastCalledWith('admin-eliminar-clinica', { body: { clinicaId: 'c1', accion: 'previsualizar' } })
    await real.eliminarClinica('c1', 'Nombre', true); expect(m.invocar).toHaveBeenLastCalledWith('admin-eliminar-clinica', { body: { clinicaId: 'c1', accion: 'eliminar', confirmarNombre: 'Nombre', confirmarDatosClinicos: true } })
    for (const v of [undefined, false, 'true', 1, null]) { await real.eliminarClinica('c1', 'N', v); expect(m.invocar.mock.lastCall[1].body.confirmarDatosClinicos, String(v)).toBe(false) }
  })
})

describe('Edge Function admin-eliminar-clinica: coherente con la migración 086 y sin los defectos de antes', () => {
  const edge = leer('supabase/functions/admin-eliminar-clinica/index.ts'); const sql = leer('supabase/migrations/086_sirso_eliminar_clinica_controlada.sql')
  it('toda la parte de base de datos es UNA llamada a fn_eliminar_clinica; la función NO borra tablas por su cuenta', () => {
    expect(edge).toContain("rpc('fn_eliminar_clinica'"); expect(edge).toContain("rpc('fn_clinica_resumen_eliminacion'")
    expect(edge).not.toMatch(/\.from\(['"]\w+['"]\)\s*\.delete\(/); expect(edge).not.toMatch(/\.delete\(\)/)
  })
  it('las funciones y los parámetros que llama existen en la migración con esos nombres, y solo para service_role', () => {
    expect(sql).toMatch(/create or replace function fn_eliminar_clinica\(p_clinica uuid, p_solicitante uuid, p_confirmar_nombre text, p_confirmar_datos_clinicos boolean/)
    expect(sql).toMatch(/create or replace function fn_clinica_resumen_eliminacion\(p_clinica uuid, p_solicitante uuid/)
    for (const p of ['p_clinica', 'p_solicitante', 'p_confirmar_nombre', 'p_confirmar_datos_clinicos']) expect(edge).toContain(p)
    expect(sql).toMatch(/grant execute on function fn_eliminar_clinica\(uuid, uuid, text, boolean\) to service_role/)
  })
  it('las cuentas de Auth y los archivos se limpian DESPUÉS de la transacción (el defecto original era borrarlas antes)', () => {
    const iRpc = edge.indexOf("rpc('fn_eliminar_clinica'"); expect(iRpc).toBeGreaterThan(0)
    expect(edge.indexOf('auth.admin.deleteUser')).toBeGreaterThan(iRpc); expect(edge.indexOf('.storage.from')).toBeGreaterThan(iRpc)
  })
  it('un fallo de la base se devuelve (con su código) y NO continúa con la limpieza', () => {
    const bloque = edge.slice(edge.indexOf('if (errorEliminar)'), edge.indexOf('// ---------- 2.')); expect(bloque).toContain('responder({ error: errorEliminar.message'); expect(bloque).toContain('400'); expect(bloque).toMatch(/return responder/)
  })
  it('los fallos de limpieza no se esconden: se registran en la base (auditoría) vía fn_registrar_limpieza_clinica y el estado nunca es «completa» si queda algo', () => {
    expect(edge).toContain("rpc('fn_registrar_limpieza_clinica'"); expect(edge).toContain('eliminada_con_limpieza_pendiente'); expect(edge).toContain("estado: completa ? 'eliminada_completa'")
    expect(edge).toContain('fallos.push')
  })
  it('exige superadmin ANTES de cualquier acción, y distingue previsualizar de eliminar', () => {
    expect(edge.indexOf('es_super_admin')).toBeLessThan(edge.indexOf("accion === 'previsualizar'")); expect(edge).toContain("throw new ErrorDeSolicitud('No autorizado')"); expect(edge).toContain("'Acción no válida'")
  })
})
