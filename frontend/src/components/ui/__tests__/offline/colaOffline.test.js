import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

// Cada prueba arranca con una base de datos vacía (un "navegador
// nuevo"). Las pruebas de persistencia reutilizan la MISMA base pero
// descartan los módulos de memoria, que es lo que realmente pasa al
// cerrar y reabrir el navegador: se pierde la RAM, no IndexedDB.
async function cargarCola() {
  vi.resetModules()
  return import('../../../../lib/colaOffline.js')
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

const opNota = (id, creado_en = 1) => ({
  id, tipo: 'crear_nota_clinica', entidad: 'notas_clinicas', entidadId: id,
  payload: { id, contenido: `nota ${id}` }, creado_en
})

describe('Cola offline — persistencia (secciones 16 y 22 #13, #14)', () => {
  it('lo encolado sobrevive a "cerrar el navegador": otro arranque de la app lo sigue viendo', async () => {
    const primera = await cargarCola()
    await primera.encolarOperacion(opNota('a'))

    // "Cierra el navegador": se pierde toda la memoria de módulos.
    // "Lo vuelve a abrir": módulos nuevos sobre la MISMA base de datos.
    const segunda = await cargarCola()
    const pendientes = await segunda.listarOperacionesPendientes()

    expect(pendientes.map((o) => o.id)).toEqual(['a'])
    expect(pendientes[0].payload.contenido).toBe('nota a')
  })

  it('un navegador distinto (base vacía) no ve nada — no hay estado global escondido', async () => {
    const cola = await cargarCola()
    await cola.encolarOperacion(opNota('a'))

    globalThis.indexedDB = new IDBFactory()
    const otra = await cargarCola()
    expect(await otra.listarOperacionesPendientes()).toEqual([])
  })
})

describe('Cola offline — forma de cada operación (sección 7)', () => {
  it('toda operación nueva nace con estado "pendiente", 0 intentos y sin error', async () => {
    const cola = await cargarCola()
    await cola.encolarOperacion(opNota('a'))
    const [op] = await cola.listarOperacionesPendientes()

    expect(op.estado).toBe('pendiente')
    expect(op.intentos).toBe(0)
    expect(op.ultimoError).toBeNull()
  })

  it('conserva quién, dónde y qué entidad afecta, para auditoría', async () => {
    const cola = await cargarCola()
    await cola.encolarOperacion({
      ...opNota('a'), usuarioId: 'u1', clinicaId: 'c1', sucursalId: 's1', claveIdempotencia: 'a'
    })
    const [op] = await cola.listarOperacionesPendientes()

    expect(op).toMatchObject({
      usuarioId: 'u1', clinicaId: 'c1', sucursalId: 's1',
      entidad: 'notas_clinicas', entidadId: 'a', claveIdempotencia: 'a'
    })
  })

  it('se listan en orden de creación, sin importar el orden en que se guardaron', async () => {
    const cola = await cargarCola()
    await cola.encolarOperacion(opNota('tercera', 30))
    await cola.encolarOperacion(opNota('primera', 10))
    await cola.encolarOperacion(opNota('segunda', 20))

    const ids = (await cola.listarOperacionesPendientes()).map((o) => o.id)
    expect(ids).toEqual(['primera', 'segunda', 'tercera'])
  })
})

describe('Cola offline — sin duplicados (sección 8, prueba #18)', () => {
  it('encolar dos veces la MISMA clave deja una sola operación, con el contenido más reciente', async () => {
    const cola = await cargarCola()
    await cola.encolarOperacion({ ...opNota('pieza-11'), payload: { estado: 'caries' } })
    await cola.encolarOperacion({ ...opNota('pieza-11'), payload: { estado: 'corona' } })

    const pendientes = await cola.listarOperacionesPendientes()
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].payload.estado).toBe('corona')
  })

  it('claves distintas sí son operaciones distintas', async () => {
    const cola = await cargarCola()
    await cola.encolarOperacion(opNota('a'))
    await cola.encolarOperacion(opNota('b'))
    expect(await cola.listarOperacionesPendientes()).toHaveLength(2)
  })
})

describe('Cola offline — ciclo de estados (secciones 7 y 15)', () => {
  it('marcarSincronizando cambia solo el estado, sin tocar el resto', async () => {
    const cola = await cargarCola()
    await cola.encolarOperacion(opNota('a'))
    await cola.marcarSincronizando('a')

    const [op] = await cola.listarOperacionesPendientes()
    expect(op.estado).toBe('sincronizando')
    expect(op.payload.contenido).toBe('nota a')
  })

  it('un fallo suma un intento y guarda el mensaje real — la operación NO se pierde', async () => {
    const cola = await cargarCola()
    await cola.encolarOperacion(opNota('a'))
    const [original] = await cola.listarOperacionesPendientes()

    await cola.marcarIntentoFallido(original, 'timeout de red')
    const [tras1] = await cola.listarOperacionesPendientes()
    expect(tras1).toMatchObject({ estado: 'error', intentos: 1, ultimoError: 'timeout de red' })

    await cola.marcarIntentoFallido(tras1, 'otro fallo')
    const [tras2] = await cola.listarOperacionesPendientes()
    expect(tras2).toMatchObject({ intentos: 2, ultimoError: 'otro fallo' })
  })

  it('quitarOperacion elimina solo esa operación', async () => {
    const cola = await cargarCola()
    await cola.encolarOperacion(opNota('a'))
    await cola.encolarOperacion(opNota('b'))
    await cola.quitarOperacion('a')

    expect((await cola.listarOperacionesPendientes()).map((o) => o.id)).toEqual(['b'])
  })
})
