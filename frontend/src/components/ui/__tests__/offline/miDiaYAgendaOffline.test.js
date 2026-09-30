import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { crearQueryMock, ok, sinRed } from './helpers/supabaseMock.js'

const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../../../lib/supabase', () => ({ supabase: supabaseMock }))

import { obtenerCitasRango, obtenerCitasRangoConEstado } from '../../../../services/citas.js'
import { obtenerMiDia } from '../../../../services/miDia.js'
import { sincronizarMiDia, obtenerUltimaSincronizacion } from '../../../../services/sincronizacionDia.js'
import { obtenerHorariosBloqueados } from '../../../../services/horariosBloqueados.js'
import { obtenerListaEspera } from '../../../../services/listaEspera.js'
import { listarDentistas } from '../../../../services/usuarios.js'

const hoy = new Date(); hoy.setHours(10, 0, 0, 0)
const CITAS = [
  { id: 'c1', paciente_id: 'p1', dentista_id: 'D1', estado: 'en_consulta', inicio: hoy.toISOString(), paciente: { nombre_completo: 'Ana' }, dentista: { nombre: 'Dr X' } },
  { id: 'c2', paciente_id: 'p2', dentista_id: 'D1', estado: 'agendada', inicio: hoy.toISOString(), paciente: { nombre_completo: 'Beto' }, dentista: { nombre: 'Dr X' } }
]
const PERFIL = { id: 'D1', rol: 'dentista', nombre: 'Dr X' }
const BLOQUEOS = [{ id: 'b1', inicio: hoy.toISOString(), fin: hoy.toISOString(), motivo: 'Junta' }]
const ESPERA = [{ id: 'e1', paciente: { nombre_completo: 'Carla' } }]
const DENTISTAS = [{ id: 'D1', nombre: 'Dr X' }]
const inicio = new Date(); inicio.setHours(0, 0, 0, 0)
const fin = new Date(inicio); fin.setDate(fin.getDate() + 1)
const RANGO = { desde: inicio.toISOString(), hasta: fin.toISOString() }

let hayRed
let citasEnServidor
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  hayRed = true
  citasEnServidor = CITAS
  supabaseMock.from.mockReset()
  supabaseMock.from.mockImplementation((tabla) =>
    crearQueryMock(tabla, () => {
      if (!hayRed) return sinRed()
      if (tabla === 'citas') return ok(citasEnServidor, { count: 0 })
      if (tabla === 'expedientes') return ok({ alergias: ['penicilina'], enfermedades: [] })
      if (tabla === 'horarios_bloqueados') return ok(BLOQUEOS)
      if (tabla === 'lista_espera') return ok(ESPERA)
      if (tabla === 'usuarios') return ok(DENTISTAS)
      return ok(null, { count: 0 })
    }, [])
  )
})
afterEach(() => vi.useRealTimers())

describe('Agenda: obtenerCitasRango offline', () => {
  it('con red devuelve un ARREGLO y no marca caché', async () => {
    const r = await obtenerCitasRangoConEstado(RANGO)
    expect(Array.isArray(r.datos)).toBe(true)
    expect(r.deCache).toBe(false)
    expect(await obtenerCitasRango(RANGO)).toEqual(CITAS)
  })

  it('sin red sirve la última lectura y AVISA que viene de caché', async () => {
    await obtenerCitasRango(RANGO)
    hayRed = false
    const r = await obtenerCitasRangoConEstado(RANGO)
    expect(r.datos).toEqual(CITAS)
    expect(r.deCache).toBe(true)
    expect(typeof r.guardadoEn).toBe('number')
    expect(await obtenerCitasRango(RANGO)).toEqual(CITAS) // firma antigua intacta
  })

  it('un día sin citas guardado como [] se sirve como [] (no como error)', async () => {
    citasEnServidor = []
    await obtenerCitasRango(RANGO)
    hayRed = false
    const r = await obtenerCitasRangoConEstado(RANGO)
    expect(r.datos).toEqual([])
    expect(r.deCache).toBe(true)
  })

  it('NO mezcla filtros: otro dentista, estado, sucursal o rango falla en vez de servir datos ajenos', async () => {
    await obtenerCitasRango({ ...RANGO, dentistaId: 'D1', sucursalId: 'S1' })
    hayRed = false
    await expect(obtenerCitasRango({ ...RANGO, dentistaId: 'D2', sucursalId: 'S1' })).rejects.toBeTruthy()
    await expect(obtenerCitasRango({ ...RANGO, dentistaId: 'D1', sucursalId: 'S2' })).rejects.toBeTruthy()
    await expect(obtenerCitasRango({ ...RANGO, dentistaId: 'D1', sucursalId: 'S1', estado: 'agendada' })).rejects.toBeTruthy()
    await expect(obtenerCitasRango({ dentistaId: 'D1', sucursalId: 'S1', desde: 'otro', hasta: RANGO.hasta })).rejects.toBeTruthy()
    // y el que sí coincide, funciona
    await expect(obtenerCitasRango({ ...RANGO, dentistaId: 'D1', sucursalId: 'S1' })).resolves.toEqual(CITAS)
  })

  it('sin red y sin nada guardado falla de verdad (no inventa una agenda)', async () => {
    hayRed = false
    await expect(obtenerCitasRango(RANGO)).rejects.toBeTruthy()
  })
})

describe('Mi día offline', () => {
  it('con red: mismos datos de siempre + deCache=false', async () => {
    const r = await obtenerMiDia(PERFIL)
    expect(r.deCache).toBe(false)
    expect(r.pacienteActual.id).toBe('c1')
    expect(r.siguientes.map((c) => c.id)).toEqual(['c2'])
    expect(r.alertasPacienteActual.alergias).toEqual(['penicilina'])
    expect(r.resumen.total).toBe(2)
  })

  it('sin red sirve el último Mi día de HOY y lo marca como caché', async () => {
    const online = await obtenerMiDia(PERFIL)
    hayRed = false
    const r = await obtenerMiDia(PERFIL)
    expect(r.deCache).toBe(true)
    expect(r.pacienteActual).toEqual(online.pacienteActual)
    expect(r.siguientes).toEqual(online.siguientes)
    expect(r.resumen).toEqual(online.resumen)
    expect(r.alertasPacienteActual).toEqual(online.alertasPacienteActual)
  })

  it('NO sirve el Mi día de OTRO usuario', async () => {
    await obtenerMiDia(PERFIL)
    hayRed = false
    await expect(obtenerMiDia({ ...PERFIL, id: 'D2' })).rejects.toBeTruthy()
  })

  it('NO sirve el Mi día de AYER como si fuera el de hoy', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 0, 10, 12, 0, 0))
    await obtenerMiDia(PERFIL)
    hayRed = false
    vi.setSystemTime(new Date(2026, 0, 11, 8, 0, 0))
    await expect(obtenerMiDia(PERFIL)).rejects.toBeTruthy()
    // el mismo día sí
    vi.setSystemTime(new Date(2026, 0, 10, 20, 0, 0))
    await expect(obtenerMiDia(PERFIL)).resolves.toMatchObject({ deCache: true })
  })

  it('sin red y sin nada guardado falla de verdad', async () => {
    hayRed = false
    await expect(obtenerMiDia(PERFIL)).rejects.toBeTruthy()
  })
})

describe('sincronizarMiDia y datos guardados', () => {
  it('SIN red NO reporta éxito con datos viejos ni pisa la fecha de última sincronización', async () => {
    await sincronizarMiDia({ dentistaId: 'D1', perfil: PERFIL })
    const antes = await obtenerUltimaSincronizacion()
    expect(antes.citas).toBe(2)

    hayRed = false
    await expect(sincronizarMiDia({ dentistaId: 'D1', perfil: PERFIL })).rejects.toThrow(/Sin conexión/)
    expect(await obtenerUltimaSincronizacion()).toEqual(antes)
  })

  it('aislado: SIN perfil, una lista de citas viene de caché → tampoco es éxito', async () => {
    // Sin `perfil` no hay segundo control; solo el de la lista de citas
    // puede impedir el "sincronizado" falso.
    await sincronizarMiDia({ dentistaId: 'D1' })
    hayRed = false
    await expect(sincronizarMiDia({ dentistaId: 'D1' })).rejects.toThrow(/Sin conexión/)
  })

  it('aislado: la lista de citas es fresca pero Mi día cae a caché (red intermitente) → no es éxito', async () => {
    await obtenerMiDia(PERFIL) // Mi día ya guardado
    const antes = await obtenerUltimaSincronizacion()
    let llamadasCitas = 0
    supabaseMock.from.mockImplementation((tabla) =>
      crearQueryMock(tabla, () => {
        if (tabla === 'citas') {
          llamadasCitas++
          // Solo la primera consulta (la lista del día) llega; después se cae la red.
          return llamadasCitas === 1 ? ok(CITAS, { count: 0 }) : sinRed()
        }
        return sinRed()
      }, [])
    )
    await expect(sincronizarMiDia({ dentistaId: 'D1', perfil: PERFIL })).rejects.toThrow(/Sin conexión/)
    expect(await obtenerUltimaSincronizacion()).toEqual(antes)
  })

  it('con red precarga Mi día completo: luego funciona sin red', async () => {
    const r = await sincronizarMiDia({ dentistaId: 'D1', perfil: PERFIL })
    expect(r.citas).toBe(2)
    hayRed = false
    const mi = await obtenerMiDia(PERFIL)
    expect(mi.deCache).toBe(true)
    expect(mi.pacienteActual.id).toBe('c1')
  })

  it('con red precarga la MISMA vista de Agenda (dentista+sucursal): luego se abre sin red', async () => {
    await sincronizarMiDia({ dentistaId: 'D1', perfil: PERFIL, sucursalId: 'S1' })
    hayRed = false
    const r = await obtenerCitasRangoConEstado({ ...RANGO, dentistaId: 'D1', sucursalId: 'S1' })
    expect(r.deCache).toBe(true)
    expect(r.datos).toEqual(CITAS)
  })
})

describe('Agenda: lo que se muestra junto a las citas', () => {
  it('horarios bloqueados: sin red se sirven los guardados del MISMO rango (si no, parecería libre lo bloqueado)', async () => {
    expect(await obtenerHorariosBloqueados(RANGO)).toEqual(BLOQUEOS)
    hayRed = false
    expect(await obtenerHorariosBloqueados(RANGO)).toEqual(BLOQUEOS)
    await expect(obtenerHorariosBloqueados({ desde: 'otro', hasta: RANGO.hasta })).rejects.toBeTruthy()
    await expect(obtenerHorariosBloqueados({ desde: RANGO.desde, hasta: 'otro' })).rejects.toBeTruthy()
  })

  it('lista de espera y dentistas: sin red se sirven los guardados, como arreglos', async () => {
    await obtenerListaEspera(); await listarDentistas()
    hayRed = false
    expect(await obtenerListaEspera()).toEqual(ESPERA)
    expect(await listarDentistas()).toEqual(DENTISTAS)
  })

  it('"Sincronizar mi día" también los precarga', async () => {
    await sincronizarMiDia({ dentistaId: 'D1', perfil: PERFIL })
    hayRed = false
    expect(await obtenerHorariosBloqueados(RANGO)).toEqual(BLOQUEOS)
    expect(await obtenerListaEspera()).toEqual(ESPERA)
    expect(await listarDentistas()).toEqual(DENTISTAS)
  })

  it('sin red y sin nada guardado fallan de verdad', async () => {
    hayRed = false
    await expect(obtenerHorariosBloqueados(RANGO)).rejects.toBeTruthy()
    await expect(obtenerListaEspera()).rejects.toBeTruthy()
    await expect(listarDentistas()).rejects.toBeTruthy()
  })
})
