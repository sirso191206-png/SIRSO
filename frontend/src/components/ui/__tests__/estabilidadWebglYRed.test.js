// Estabilidad: red (errores, reintentos, tiempos de espera) y ciclo de vida de WebGL/three.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createElement as h } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { readFileSync } from 'node:fs'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera } from 'three'

import { esErrorDeRed, esErrorDeServidor, mensajeErrorDeCarga } from '../../../lib/errorDeRed.js'
import { conReintentos } from '../../../lib/reintento.js'
import { crearFetchConTimeout, TIEMPO_MAX_MS, TIEMPO_MAX_SUBIDA_MS } from '../../../lib/fetchConTimeout.js'
import { controlarDestruccion } from '../../odontograma/rendererControlado.js'
import { proyectarPunto } from '../../odontograma/proyeccionEtiquetas.js'
import { clonarEscenaGLB, liberarClonEscena } from '../../odontograma/clonEscenaGLB.js'
import { registrarLimpiezaModelo, reiniciarModelo3D } from '../../odontograma/modelo3D.js'
import { ErrorVista3D } from '../../odontograma/ErrorVista3D.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('clasificación de errores de red', () => {
  it('fallos de red y tiempo agotado cuentan como red; un rechazo del servidor no', () => {
    for (const e of [new TypeError('Failed to fetch'), Object.assign(new Error('x'), { name: 'TimeoutError' }), Object.assign(new Error('x'), { name: 'AbortError' }), Object.assign(new Error('x'), { name: 'AuthRetryableFetchError' }), new Error('Load failed'), new Error('Tiempo de espera agotado (30 s)'), new Error('request timed out')]) expect(esErrorDeRed(e), String(e)).toBe(true)
    for (const e of [null, undefined, { message: 'permission denied', code: '42501' }, new Error('JWT expired')]) expect(esErrorDeRed(e), String(e)).toBe(false)
  })
  it('5xx del servidor sí; 4xx no', () => {
    for (const e of [{ status: 503 }, { statusCode: 502 }, { code: '500' }, { message: 'Service Unavailable' }, { message: 'Bad Gateway' }, { message: 'upstream connect error' }]) expect(esErrorDeServidor(e), JSON.stringify(e)).toBe(true)
    for (const e of [null, { status: 404 }, { status: 401 }, { code: '23503' }, { code: 'PGRST116' }, { message: 'duplicate key' }]) expect(esErrorDeServidor(e), JSON.stringify(e)).toBe(false)
  })
  it('el mensaje para la persona nunca es el texto técnico', () => {
    expect(mensajeErrorDeCarga(new TypeError('Failed to fetch'), 'el odontograma')).toMatch(/no hay conexión/)
    expect(mensajeErrorDeCarga({ status: 503, message: 'Service Unavailable' }, 'el odontograma')).toMatch(/servidor no está disponible/)
    expect(mensajeErrorDeCarga({ code: '42501', message: 'permission denied for table x' }, 'el odontograma')).toBe('No se pudo cargar el odontograma.')
    for (const e of [new TypeError('Failed to fetch'), { status: 503, message: 'Service Unavailable' }, { message: 'permission denied for table x' }]) expect(mensajeErrorDeCarga(e)).not.toMatch(/TypeError|Failed to fetch|Service Unavailable|permission denied|table x/)
  })
})

describe('conReintentos', () => {
  const esperas = []
  const esperar = async (ms) => { esperas.push(ms) }
  beforeEach(() => { esperas.length = 0 })
  it('si funciona a la primera no repite ni espera', async () => {
    const op = vi.fn().mockResolvedValue('ok')
    expect(await conReintentos(op, { esperar })).toBe('ok'); expect(op).toHaveBeenCalledTimes(1); expect(esperas).toEqual([])
  })
  it('un fallo transitorio se reintenta con espera creciente (600 ms, luego 1500 ms) y se recupera', async () => {
    const op = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockRejectedValueOnce({ status: 503 }).mockResolvedValue('ok')
    expect(await conReintentos(op, { esperar })).toBe('ok'); expect(op).toHaveBeenCalledTimes(3); expect(esperas).toEqual([600, 1500])
  })
  it('tras agotar los intentos lanza el ÚLTIMO error (nunca un bucle)', async () => {
    const op = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(conReintentos(op, { esperar, intentos: 3 })).rejects.toThrow('Failed to fetch'); expect(op).toHaveBeenCalledTimes(3)
    const uno = vi.fn().mockRejectedValue(new TypeError('x'))
    await expect(conReintentos(uno, { esperar, intentos: 1 })).rejects.toBeDefined(); expect(uno).toHaveBeenCalledTimes(1)
  })
  it('un error definitivo (permisos, validación, sesión) NO se reintenta', async () => {
    for (const e of [{ code: '42501', message: 'denied' }, { status: 401 }, { code: '23505', message: 'dup' }]) {
      const op = vi.fn().mockRejectedValue(e); await expect(conReintentos(op, { esperar })).rejects.toBe(e); expect(op).toHaveBeenCalledTimes(1)
    }
    expect(esperas).toEqual([])
  })
  it('si la pantalla ya no está vigente, deja de insistir (antes y después de esperar)', async () => {
    const op = vi.fn().mockRejectedValue(new TypeError('x'))
    await expect(conReintentos(op, { esperar, vigente: () => false })).rejects.toBeDefined(); expect(op).toHaveBeenCalledTimes(1)
    let vigente = true; const op2 = vi.fn().mockRejectedValue(new TypeError('x'))
    await expect(conReintentos(op2, { esperar: async () => { vigente = false }, vigente: () => vigente })).rejects.toBeDefined(); expect(op2).toHaveBeenCalledTimes(1)
  })
  it('se puede decidir qué reintentar', async () => {
    const op = vi.fn().mockRejectedValueOnce({ code: 'X' }).mockResolvedValue('ok')
    expect(await conReintentos(op, { esperar, debeReintentar: (e) => e.code === 'X' })).toBe('ok')
  })
})

describe('fetchConTimeout: ninguna petición espera para siempre', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  // Como un fetch real: no responde nunca, y rechaza en cuanto la señal se cancela (también si ya llegó cancelada).
  const colgado = () => vi.fn((_u, init) => new Promise((_ok, ko) => { if (init.signal.aborted) return ko(init.signal.reason); init.signal.addEventListener('abort', () => ko(init.signal.reason)) }))

  it('una petición normal que responde a tiempo pasa sin tocar la respuesta y limpia su temporizador', async () => {
    const base = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const f = crearFetchConTimeout({ fetchBase: base })
    expect(await f('https://x.supabase.co/rest/v1/pacientes')).toEqual({ ok: true, status: 200 })
    expect(vi.getTimerCount()).toBe(0)
  })
  it('a los 30 s sin respuesta se cancela con un TimeoutError que la app trata como error de red', async () => {
    const base = colgado(); const f = crearFetchConTimeout({ fetchBase: base })
    const p = f('https://x.supabase.co/rest/v1/pacientes'); const resultado = p.catch((e) => e)
    await vi.advanceTimersByTimeAsync(TIEMPO_MAX_MS - 1); expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(2)
    const e = await resultado
    expect(e.name).toBe('TimeoutError'); expect(e.message).toMatch(/30 s/); expect(esErrorDeRed(e)).toBe(true)
  })
  it('las SUBIDAS de archivos tienen más margen (120 s); una lectura de Storage no cuenta como subida', async () => {
    const f = crearFetchConTimeout({ fetchBase: colgado() })
    const subida = f('https://x.supabase.co/storage/v1/object/fotos/p1/a.jpg', { method: 'POST' }).catch((e) => e)
    await vi.advanceTimersByTimeAsync(TIEMPO_MAX_MS + 1000); expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(TIEMPO_MAX_SUBIDA_MS); expect((await subida).name).toBe('TimeoutError')
    const lectura = f('https://x.supabase.co/storage/v1/object/fotos/p1/a.jpg', { method: 'GET' }).catch((e) => e)
    await vi.advanceTimersByTimeAsync(TIEMPO_MAX_MS + 1); expect((await lectura).name).toBe('TimeoutError')
  })
  it('respeta una cancelación externa (antes o durante la petición)', async () => {
    const f = crearFetchConTimeout({ fetchBase: colgado() })
    const c = new AbortController(); const p = f('https://x/y', { signal: c.signal }).catch((e) => e)
    c.abort(new Error('cancelada por la pantalla')); expect((await p).message).toBe('cancelada por la pantalla')
    const ya = new AbortController(); ya.abort(new Error('ya cancelada'))
    expect((await f('https://x/y', { signal: ya.signal }).catch((e) => e)).message).toBe('ya cancelada')
  })
  it('conserva método, cabeceras y cuerpo de la petición original', async () => {
    const base = vi.fn().mockResolvedValue({}); const f = crearFetchConTimeout({ fetchBase: base })
    await f('https://x/y', { method: 'POST', headers: { a: '1' }, body: '{"k":1}' })
    expect(base.mock.calls[0][1]).toMatchObject({ method: 'POST', headers: { a: '1' }, body: '{"k":1}' })
    expect(base.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })
})

describe('rendererControlado: destrucción ordenada y de una sola vez', () => {
  const falso = () => { const llamadas = []; return { llamadas, dispose: () => llamadas.push('dispose'), forceContextLoss() { llamadas.push('forceContextLoss') } } }
  it('primero dispose() (quita los listeners de three y libera sus recursos) y DESPUÉS forceContextLoss() (suelta la GPU)', () => {
    const r = controlarDestruccion(falso()); r.forceContextLoss()
    expect(r.llamadas).toEqual(['dispose', 'forceContextLoss'])
  })
  it('es idempotente: una segunda llamada (la tardía de R3F) no repite nada ni provoca "context already lost"', () => {
    const r = controlarDestruccion(falso()); r.forceContextLoss(); r.forceContextLoss(); r.forceContextLoss()
    expect(r.llamadas).toEqual(['dispose', 'forceContextLoss'])
  })
  it('envolver dos veces el mismo renderer no duplica la destrucción', () => {
    const r = controlarDestruccion(controlarDestruccion(falso())); r.forceContextLoss()
    expect(r.llamadas).toEqual(['dispose', 'forceContextLoss'])
  })
  it('no destruye nada hasta que se pide (un renderer en uso conserva su contexto y sus avisos de pérdida real)', () => {
    const r = controlarDestruccion(falso()); expect(r.llamadas).toEqual([])
  })
  it('tolera valores vacíos', () => { expect(controlarDestruccion(null)).toBeNull(); expect(controlarDestruccion(undefined)).toBeUndefined() })
})

describe('proyeccionEtiquetas: misma matemática que <Html distanceFactor> sin un React root por etiqueta', () => {
  const camara = (z = 10) => { const c = new PerspectiveCamera(40, 1.5, 0.1, 1000); c.position.set(0, 0, z); c.updateMatrixWorld(true); return c }
  it('el punto al que mira la cámara cae en el CENTRO de la pantalla', () => {
    const p = proyectarPunto([0, 0, 0], camara(), 800, 600, 10)
    expect(p.visible).toBe(true); expect(p.x).toBeCloseTo(400, 3); expect(p.y).toBeCloseTo(300, 3)
  })
  it('arriba y a la derecha en el mundo = arriba y a la derecha en pantalla (y crece hacia abajo)', () => {
    const p = proyectarPunto([1, 1, 0], camara(), 800, 600, 10)
    expect(p.x).toBeGreaterThan(400); expect(p.y).toBeLessThan(300)
  })
  it('escala = distanceFactor / (2·tan(fov/2)·distancia): al duplicar la distancia, la mitad', () => {
    const cerca = proyectarPunto([0, 0, 0], camara(10), 800, 600, 10).escala
    const lejos = proyectarPunto([0, 0, 0], camara(20), 800, 600, 10).escala
    expect(cerca).toBeCloseTo(10 / (2 * Math.tan((40 * Math.PI) / 360) * 10), 6)
    expect(lejos).toBeCloseTo(cerca / 2, 6)
  })
  it('sin distanceFactor la escala es 1', () => { expect(proyectarPunto([0, 0, 0], camara(), 800, 600, undefined).escala).toBe(1) })
  it('un punto DETRÁS de la cámara no es visible', () => { expect(proyectarPunto([0, 0, 20], camara(10), 800, 600, 10).visible).toBe(false) })
  it('un punto delante de la cámara pero MÁS CERCA que el plano cercano (recortado por three) tampoco es visible', () => { expect(proyectarPunto([0, 0, 9.95], camara(10), 800, 600, 10).visible).toBe(false); expect(proyectarPunto([0, 0, 9.5], camara(10), 800, 600, 10).visible).toBe(true) })
  it('un punto lejos fuera del encuadre no es visible; uno apenas fuera (margen) sí', () => {
    expect(proyectarPunto([100, 0, 0], camara(), 800, 600, 10).visible).toBe(false)
    expect(proyectarPunto([3.9, 0, 0], camara(), 800, 600, 10).visible).toBe(true)
  })
  it('lo más cercano a la cámara queda por encima (mayor profundidad numérica)', () => {
    const cerca = proyectarPunto([0, 0, 5], camara(10), 800, 600, 10).profundidad
    const lejos = proyectarPunto([0, 0, -5], camara(10), 800, 600, 10).profundidad
    expect(cerca).toBeGreaterThan(lejos)
  })
})

describe('clonado y liberación de la escena del odontograma', () => {
  const crear = () => { const g = new Group(); const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 'red' })); mesh.name = '11'; g.add(mesh); return { g, mesh } }
  it('cada clon es DUEÑO de su geometría y de su material (distintos del original), con los mismos datos', () => {
    const { g, mesh } = crear(); const clon = clonarEscenaGLB(g); const m2 = clon.children[0]
    expect(m2).not.toBe(mesh); expect(m2.geometry).not.toBe(mesh.geometry); expect(m2.material).not.toBe(mesh.material)
    expect(m2.geometry.attributes.position.count).toBe(mesh.geometry.attributes.position.count)
    expect(m2.material.color.getHexString()).toBe(mesh.material.color.getHexString()); expect(m2.name).toBe('11')
  })
  it('pintar el clon NO altera la escena original (la que cachea useGLTF)', () => {
    const { g, mesh } = crear(); const clon = clonarEscenaGLB(g); clon.children[0].material.color.set('blue')
    expect(mesh.material.color.getHexString()).toBe('ff0000')
  })
  it('liberar el clon dispone SU geometría y SU material, y NO toca los del original', () => {
    const { g, mesh } = crear(); const clon = clonarEscenaGLB(g); const m2 = clon.children[0]
    const espias = [vi.spyOn(m2.geometry, 'dispose'), vi.spyOn(m2.material, 'dispose'), vi.spyOn(mesh.geometry, 'dispose'), vi.spyOn(mesh.material, 'dispose')]
    liberarClonEscena(clon)
    expect(espias.map((e) => e.mock.calls.length)).toEqual([1, 1, 0, 0])
  })
  it('liberar con materiales múltiples (arreglo) y sin nada no truena', () => {
    const { g } = crear(); const m = g.children[0]; const extra = new MeshStandardMaterial(); const s = vi.spyOn(extra, 'dispose'); m.material = [m.material, extra]
    liberarClonEscena(g); expect(s).toHaveBeenCalledTimes(1)
    expect(() => liberarClonEscena(null)).not.toThrow(); expect(() => liberarClonEscena(new Group())).not.toThrow()
  })
  it('liberar y volver a usar el mismo clon es seguro (StrictMode simula un desmontaje antes de reusar)', () => {
    const { g } = crear(); const clon = clonarEscenaGLB(g); liberarClonEscena(clon)
    expect(clon.children[0].geometry.attributes.position.count).toBeGreaterThan(0)
  })
})

describe('modelo3D: reiniciar la caché del modelo antes de "Reintentar"', () => {
  it('llama a todos los limpiadores registrados; uno que falle no impide a los demás', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const a = vi.fn(), c = vi.fn(); const quitarA = registrarLimpiezaModelo(a); const quitarB = registrarLimpiezaModelo(() => { throw new Error('x') }); const quitarC = registrarLimpiezaModelo(c)
    reiniciarModelo3D(); expect(a).toHaveBeenCalledTimes(1); expect(c).toHaveBeenCalledTimes(1)
    quitarA(); quitarB(); quitarC(); reiniciarModelo3D(); expect(a).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
  })
})

describe('ErrorVista3D: una falla del 3D no deja SIRO en blanco', () => {
  const Bomba = ({ falla, mensaje }) => { if (falla.actual) throw new Error(mensaje); return h('p', null, 'VISTA3D') }
  const texto = (r) => JSON.stringify(r.toJSON())
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
  afterEach(() => vi.restoreAllMocks())

  it('sin error muestra la vista normal', () => {
    let r; act(() => { r = TestRenderer.create(h(ErrorVista3D, null, h(Bomba, { falla: { actual: false }, mensaje: '' }))) })
    expect(texto(r)).toContain('VISTA3D')
  })
  it('un fallo del MODELO muestra un aviso con "Reintentar" y "Usar vista 2D", sin el texto técnico', () => {
    let r; act(() => { r = TestRenderer.create(h(ErrorVista3D, { onUsar2D: () => {} }, h(Bomba, { falla: { actual: true }, mensaje: 'Could not load /models/odontograma.glb: 503' }))) })
    const t = texto(r)
    expect(t).toContain('No se pudo abrir la vista 3D'); expect(t).toContain('Reintentar'); expect(t).toContain('Usar vista 2D'); expect(t).not.toContain('odontograma.glb'); expect(t).not.toContain('503')
  })
  it('un archivo de la app que ya no existe (versión nueva) ofrece RECARGAR, no reintentar', () => {
    for (const mensaje of ['Failed to fetch dynamically imported module: /assets/Odontograma3D-abc.js', "Unexpected token '<', \"<!doctype \"... is not valid JSON", 'Importing a module script failed.']) {
      let r; act(() => { r = TestRenderer.create(h(ErrorVista3D, null, h(Bomba, { falla: { actual: true }, mensaje }))) })
      expect(texto(r), mensaje).toContain('Recargar página'); expect(texto(r), mensaje).not.toContain('"Reintentar"')
    }
  })
  it('"Reintentar" limpia el error, avisa a quien lo pidió y vuelve a intentar mostrar la vista', () => {
    const falla = { actual: true }; const alReintentar = vi.fn()
    let r; act(() => { r = TestRenderer.create(h(ErrorVista3D, { onReintentar: alReintentar }, h(Bomba, { falla, mensaje: 'red caída' }))) })
    falla.actual = false
    const boton = r.root.findAll((n) => n.type === 'button').find((b) => /Reintentar/.test(JSON.stringify(b.props.children)))
    act(() => { boton.props.onClick() })
    expect(alReintentar).toHaveBeenCalledTimes(1); expect(texto(r)).toContain('VISTA3D')
  })
  it('"Usar vista 2D" llama a la alternativa', () => {
    const dos = vi.fn(); let r; act(() => { r = TestRenderer.create(h(ErrorVista3D, { onUsar2D: dos }, h(Bomba, { falla: { actual: true }, mensaje: 'x' }))) })
    act(() => { r.root.findAll((n) => n.type === 'button').find((b) => /Usar vista 2D/.test(JSON.stringify(b.props.children))).props.onClick() })
    expect(dos).toHaveBeenCalledTimes(1)
  })
  it('el aviso es un role="alert" (accesible)', () => {
    let r; act(() => { r = TestRenderer.create(h(ErrorVista3D, null, h(Bomba, { falla: { actual: true }, mensaje: 'x' }))) })
    expect(texto(r)).toContain('"role":"alert"')
  })
})

describe('vercel.json: un archivo inexistente NO se contesta con index.html', () => {
  const { rewrites } = JSON.parse(readFileSync(new URL('../../../../vercel.json', import.meta.url), 'utf8'))
  const regla = new RegExp(`^${rewrites[0].source}$`)
  it('las rutas de la app sí se reescriben a index.html', () => {
    for (const ruta of ['/', '/pacientes', '/pacientes/3f2a', '/consulta/abc-123', '/auditoria', '/legal/aviso-privacidad', '/administracion/arco', '/configuracion/seguridad']) expect(regla.test(ruta), ruta).toBe(true)
    expect(rewrites[0].destination).toBe('/index.html')
  })
  it('los archivos (assets, modelo 3D, imágenes, scripts) NO: si faltan, deben dar 404 real', () => {
    for (const ruta of ['/assets/Odontograma3D-abc123.js', '/assets/index-x.css', '/models/odontograma.glb', '/algo-que-no-existe.js', '/logo.png', '/sw.js', '/precache-manifest.json', '/favicon.ico', '/ilustracion-login.svg']) expect(regla.test(ruta), ruta).toBe(false)
  })
})
