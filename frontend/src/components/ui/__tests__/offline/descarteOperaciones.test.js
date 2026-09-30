import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { crearQueryMock, ok, fallo, sinRed } from './helpers/supabaseMock.js'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: supabaseMock }))

import { encolarOperacion, listarOperacionesPendientes, marcarIntentoFallido } from '../../../../lib/colaOffline.js'
import {
  UMBRAL_INTENTOS_PARA_DESCARTAR,
  operacionEsDescartable,
  resumenOperacion,
  descartarOperacionPermanente,
  exportarOperacionComoArchivo
} from '../../../../lib/descarteOperaciones.js'

const ponerConexion = (enLinea) => Object.defineProperty(globalThis.navigator, 'onLine', { value: enLinea, configurable: true })

let registrosAuditoria
let respuestaAuditoria
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  ponerConexion(true)
  registrosAuditoria = []
  respuestaAuditoria = () => ok(null)
  supabaseMock.from.mockReset()
  supabaseMock.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, (t, operaciones) => {
      if (t === 'auditoria') {
        const ins = operaciones.find(([m]) => m === 'insert')
        if (ins) registrosAuditoria.push(ins[1][0])
        return respuestaAuditoria()
      }
      return ok(null)
    }, [])
  )
})

async function operacionAtascada(intentos = UMBRAL_INTENTOS_PARA_DESCARTAR) {
  const base = {
    id: 'op1', tipo: 'crear_receta', entidad: 'recetas', entidadId: 'r1',
    payload: { pacienteId: 'p1', medicamento: 'Amoxicilina' },
    creado_en: 1000, usuarioId: 'u1', clinicaId: 'c1'
  }
  await encolarOperacion(base)
  let actual = (await listarOperacionesPendientes())[0]
  for (let i = 0; i < intentos; i++) {
    await marcarIntentoFallido(actual, 'Error de validación del servidor')
    actual = (await listarOperacionesPendientes())[0]
  }
  return actual
}

describe('operacionEsDescartable', () => {
  it('NO es descartable si nunca se intentó (pendiente)', () => {
    expect(operacionEsDescartable({ estado: 'pendiente', intentos: 0 })).toBe(false)
  })
  it('NO es descartable con pocos intentos — puede ser un bache de red', () => {
    expect(operacionEsDescartable({ estado: 'error', intentos: UMBRAL_INTENTOS_PARA_DESCARTAR - 1 })).toBe(false)
  })
  it('SÍ es descartable al llegar al umbral de intentos fallidos', () => {
    expect(operacionEsDescartable({ estado: 'error', intentos: UMBRAL_INTENTOS_PARA_DESCARTAR })).toBe(true)
    expect(operacionEsDescartable({ estado: 'error', intentos: UMBRAL_INTENTOS_PARA_DESCARTAR + 5 })).toBe(true)
  })
  it('NO es descartable si está "sincronizando" aunque tenga muchos intentos previos', () => {
    expect(operacionEsDescartable({ estado: 'sincronizando', intentos: 99 })).toBe(false)
  })
})

describe('resumenOperacion', () => {
  it('incluye el contenido completo (payload) para que la copia sirva de algo', async () => {
    const op = await operacionAtascada()
    const r = resumenOperacion(op)
    expect(r.payload).toEqual({ pacienteId: 'p1', medicamento: 'Amoxicilina' })
    expect(r.entidad).toBe('recetas')
    expect(r.intentos).toBe(UMBRAL_INTENTOS_PARA_DESCARTAR)
    expect(r.ultimoError).toBe('Error de validación del servidor')
  })
})

describe('descartarOperacionPermanente', () => {
  it('SIN conexión no descarta nada — ni borra ni intenta auditar', async () => {
    const op = await operacionAtascada()
    ponerConexion(false)
    await expect(descartarOperacionPermanente(op)).rejects.toThrow(/conexión/i)
    expect(registrosAuditoria).toHaveLength(0)
    expect(await listarOperacionesPendientes()).toHaveLength(1)
  })

  it('con conexión: registra en auditoría CON el usuario_id de la fila (nunca lo pone el navegador) y borra de la cola', async () => {
    const op = await operacionAtascada()
    await descartarOperacionPermanente(op)
    expect(await listarOperacionesPendientes()).toHaveLength(0)
    expect(registrosAuditoria).toHaveLength(1)
    expect(registrosAuditoria[0]).not.toHaveProperty('usuario_id')
    expect(registrosAuditoria[0].accion).toBe('cola_offline_descartada')
    expect(registrosAuditoria[0].entidad).toBe('recetas')
    expect(registrosAuditoria[0].entidad_id).toBe('r1')
    expect(registrosAuditoria[0].detalle.ultimoError).toBe('Error de validación del servidor')
  })

  it('si falla el insert de auditoría, NO borra la operación — se prefiere quedar bloqueado a perder el rastro', async () => {
    const op = await operacionAtascada()
    respuestaAuditoria = () => fallo('permiso denegado', '42501')
    await expect(descartarOperacionPermanente(op)).rejects.toThrow()
    expect(await listarOperacionesPendientes()).toHaveLength(1)
  })

  it('un fallo de red al auditar tampoco borra la operación', async () => {
    const op = await operacionAtascada()
    respuestaAuditoria = () => sinRed()
    await expect(descartarOperacionPermanente(op)).rejects.toThrow()
    expect(await listarOperacionesPendientes()).toHaveLength(1)
  })
})

// exportarOperacionComoArchivo es código de navegador (Blob + enlace
// temporal). El entorno de pruebas es 'node', sin DOM real, así que se
// simula lo mínimo que la función usa — igual que serviceWorker.test.js
// simula `caches`/`fetch` sin ser un navegador real.
describe('exportarOperacionComoArchivo', () => {
  function conDomSimulado() {
    const clicks = []
    const elementosCreados = []
    const enlaceFalso = {
      set href(v) { this._href = v },
      get href() { return this._href },
      set download(v) { this._download = v },
      get download() { return this._download },
      click() { clicks.push({ href: this._href, download: this._download }) },
      remove: vi.fn()
    }
    globalThis.document = {
      createElement: vi.fn((tag) => { const e = tag === 'a' ? enlaceFalso : {}; elementosCreados.push(e); return e }),
      body: { appendChild: vi.fn(), removeChild: vi.fn() }
    }
    const blobsCreados = []
    globalThis.Blob = vi.fn(function (partes, opts) { blobsCreados.push({ partes, opts }); this.partes = partes; this.opts = opts })
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake-url')
    globalThis.URL.revokeObjectURL = vi.fn()
    return { clicks, blobsCreados }
  }

  it('descarga un archivo con el contenido completo y libera la URL temporal', async () => {
    const { clicks, blobsCreados } = conDomSimulado()
    const op = await operacionAtascada()

    exportarOperacionComoArchivo(op)

    expect(blobsCreados).toHaveLength(1)
    const contenido = JSON.parse(blobsCreados[0].partes[0])
    expect(contenido.payload).toEqual({ pacienteId: 'p1', medicamento: 'Amoxicilina' })
    expect(contenido.ultimoError).toBe('Error de validación del servidor')

    expect(clicks).toHaveLength(1)
    expect(clicks[0].href).toBe('blob:fake-url')
    expect(clicks[0].download).toContain(op.id)
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
  })

  it('el nombre del archivo no queda vacío ni genérico — identifica la entidad y la operación', async () => {
    const { clicks } = conDomSimulado()
    const op = await operacionAtascada()
    exportarOperacionComoArchivo(op)
    expect(clicks[0].download).toMatch(/recetas/)
    expect(clicks[0].download.endsWith('.json')).toBe(true)
  })
})
