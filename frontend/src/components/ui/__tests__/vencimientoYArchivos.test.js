// Migración 082 en el frontend: validación de archivos, avisos de vencimiento, almacenamiento en el panel.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'

const m = vi.hoisted(() => ({ upload: vi.fn(), insert: vi.fn() }))
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(), auth: { onAuthStateChange: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn(),
    storage: { from: vi.fn(() => ({ upload: m.upload, getPublicUrl: () => ({ data: { publicUrl: 'https://x/logo' } }) })) },
    from: vi.fn(() => ({ insert: m.insert, update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) }) }) }))
  }
}))
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

import { LIMITES_ARCHIVOS, validarArchivo, mensajeErrorArchivo } from '../../../lib/limitesArchivos.js'
import { avisoSuscripcion, mensajeExceso } from '../../../lib/planes.js'
import { BarraUso } from '../../planes/BarraUso.jsx'
import { AvisoSuscripcion } from '../../planes/AvisoSuscripcion.jsx'
import { PlanActualClinica } from '../../planes/PlanActualClinica.jsx'
import { subirFotografia } from '../../../services/fotografias.js'
import { subirDocumento } from '../../../services/documentosClinicos.js'
import { subirLogoClinica } from '../../../services/clinicas.js'
import { useAuthStore } from '../../../store/useAuthStore.js'
import { usePlanStore } from '../../../store/usePlanStore.js'

const MB = 1024 * 1024
const archivo = (nombre, tipo, bytes) => ({ name: nombre, type: tipo, size: bytes })

describe('validarArchivo: antes de subir', () => {
  it('acepta lo permitido en cada bucket', () => {
    expect(validarArchivo('fotos-clinicas', archivo('a.jpg', 'image/jpeg', 2 * MB)).ok).toBe(true)
    expect(validarArchivo('documentos-clinicos', archivo('a.pdf', 'application/pdf', 15 * MB)).ok).toBe(true)
    expect(validarArchivo('logos-clinicas', archivo('l.png', 'image/png', 1 * MB)).ok).toBe(true)
  })
  it('el tope es inclusivo: justo en el máximo pasa; un byte más no', () => {
    expect(validarArchivo('fotos-clinicas', archivo('a.jpg', 'image/jpeg', 10 * MB)).ok).toBe(true)
    const r = validarArchivo('fotos-clinicas', archivo('a.jpg', 'image/jpeg', 10 * MB + 1))
    expect(r.ok).toBe(false)
    expect(r.mensaje).toMatch(/máximo para una fotografía es 10 MB/)
    expect(validarArchivo('logos-clinicas', archivo('l.png', 'image/png', 2 * MB + 1)).ok).toBe(false)
    expect(validarArchivo('documentos-clinicos', archivo('d.pdf', 'application/pdf', 20 * MB + 1)).ok).toBe(false)
  })
  it('rechaza tipos no permitidos con el mensaje de qué sí usar (PDF en fotos, SVG/HTML/EXE en cualquiera)', () => {
    expect(validarArchivo('fotos-clinicas', archivo('d.pdf', 'application/pdf', 1000)).mensaje).toMatch(/JPG, PNG, WebP o HEIC/)
    for (const [n, t] of [['x.svg', 'image/svg+xml'], ['x.html', 'text/html'], ['x.exe', 'application/x-msdownload'], ['x.js', 'text/javascript']]) {
      for (const bucket of Object.keys(LIMITES_ARCHIVOS)) expect(validarArchivo(bucket, archivo(n, t, 1000)).ok, `${n} en ${bucket}`).toBe(false)
    }
    expect(validarArchivo('logos-clinicas', archivo('l.heic', 'image/heic', 1000)).ok).toBe(false) // el logo no admite HEIC
  })
  it('un HEIC del iPhone sin tipo declarado se reconoce por la extensión; un archivo sin tipo ni extensión conocida, no', () => {
    expect(validarArchivo('fotos-clinicas', archivo('IMG_0001.HEIC', '', 3 * MB)).ok).toBe(true)
    expect(validarArchivo('fotos-clinicas', archivo('raro', '', 3 * MB)).ok).toBe(false)
    expect(validarArchivo('fotos-clinicas', archivo('truco.exe', '', 3 * MB)).ok).toBe(false)
  })
  it('archivo vacío, ausente o bucket desconocido', () => {
    expect(validarArchivo('fotos-clinicas', archivo('a.jpg', 'image/jpeg', 0)).mensaje).toMatch(/vacío/)
    expect(validarArchivo('fotos-clinicas', null).ok).toBe(false)
    expect(validarArchivo('otro', archivo('a.bin', 'x/y', 1)).ok).toBe(true)
  })
  it('LOS TOPES COINCIDEN CON LOS DE LA MIGRACIÓN 082 (tamaño y tipos de cada bucket)', () => {
    const sql = readFileSync(new URL('../../../../../supabase/migrations/082_sirso_vencimiento_almacenamiento_catalogo.sql', import.meta.url), 'utf8')
    for (const [bucket, regla] of Object.entries(LIMITES_ARCHIVOS)) {
      const bloque = new RegExp(`update storage\\.buckets set file_size_limit = (\\d+),\\s*allowed_mime_types = array\\[([^\\]]+)\\] where id = '${bucket}'`).exec(sql)
      expect(bloque, `no se encontró el bucket ${bucket} en la migración`).not.toBeNull()
      expect(Number(bloque[1])).toBe(regla.maxBytes)
      const tiposSql = bloque[2].split(',').map((t) => t.trim().replace(/'/g, '')).sort()
      expect(tiposSql).toEqual([...regla.tipos].sort())
    }
  })
})

describe('mensajeErrorArchivo: nunca el texto técnico de Storage', () => {
  it('tamaño, tipo, política, red y desconocido', () => {
    expect(mensajeErrorArchivo({ message: 'The object exceeded the maximum allowed size', statusCode: '413' }, 'fotos-clinicas')).toMatch(/demasiado grande \(máximo 10 MB\)/)
    expect(mensajeErrorArchivo({ message: 'mime type application/x-sh is not supported' }, 'documentos-clinicos')).toMatch(/tipo de archivo no está permitido. Usa PDF/)
    expect(mensajeErrorArchivo({ message: 'new row violates row-level security policy', statusCode: '403' }, 'fotos-clinicas')).toMatch(/límite de almacenamiento/)
    expect(mensajeErrorArchivo({ message: 'TypeError: Failed to fetch' }, 'fotos-clinicas')).toMatch(/No hay conexión/)
    expect(mensajeErrorArchivo({ message: 'algo extraño de postgres' }, 'fotos-clinicas')).toBe('No se pudo subir el archivo. Intenta de nuevo.')
    expect(mensajeErrorArchivo(null, 'fotos-clinicas')).toBe('No se pudo subir el archivo. Intenta de nuevo.')
  })
  it('no filtra nombres de tablas, políticas ni SQL', () => {
    const msg = mensajeErrorArchivo({ message: 'new row violates row-level security policy for table "objects"' }, 'fotos-clinicas')
    expect(msg).not.toMatch(/objects|policy|row-level|violates/i)
  })
})

describe('los tres servicios de subida validan ANTES de tocar Storage y traducen sus errores', () => {
  beforeEach(() => { m.upload.mockReset(); m.insert.mockReset() })
  const servicios = [
    ['fotografías', (a) => subirFotografia({ pacienteId: 'p1', archivo: a, etiqueta: 'x', usuarioId: 'u' }), 'fotos-clinicas'],
    ['documentos', (a) => subirDocumento({ pacienteId: 'p1', archivo: a, tipo: 'estudio', nombre: 'n', usuarioId: 'u' }), 'documentos-clinicos'],
    ['logo', (a) => subirLogoClinica('c1', a), 'logos-clinicas']
  ]
  for (const [nombre, subir, bucket] of servicios) {
    it(`${nombre}: un archivo de tipo o tamaño inválido NO llega a Storage`, async () => {
      await expect(subir(archivo('virus.exe', 'application/x-msdownload', 1000))).rejects.toThrow(/no está permitido/)
      await expect(subir(archivo('enorme.jpg', 'image/jpeg', 50 * MB))).rejects.toThrow(/pesa/)
      expect(m.upload).not.toHaveBeenCalled()
    })
    it(`${nombre}: un error de Storage se traduce a un mensaje claro`, async () => {
      m.upload.mockResolvedValue({ error: { message: 'new row violates row-level security policy', statusCode: '403' } })
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const valido = bucket === 'documentos-clinicos' ? archivo('a.pdf', 'application/pdf', 1000) : archivo('a.jpg', 'image/jpeg', 1000)
      await expect(subir(valido)).rejects.toThrow(/límite de almacenamiento/)
      expect(m.upload).toHaveBeenCalledTimes(1)
    })
  }
})

describe('avisoSuscripcion: el vencimiento informa, no bloquea', () => {
  const s = (extra) => ({ sin_suscripcion: false, estado: 'activa', estado_efectivo: 'activa', dias_gracia: 7, fecha_fin: null, dias_para_vencer: null, ...extra })
  it('sin nada que avisar: sin suscripción, heredada, activa lejos del vencimiento, suspendida', () => {
    expect(avisoSuscripcion(null)).toBeNull()
    expect(avisoSuscripcion({ sin_suscripcion: true })).toBeNull()
    expect(avisoSuscripcion(s({ fecha_fin: '2027-01-01', dias_para_vencer: 90 }))).toBeNull()
    expect(avisoSuscripcion(s({ estado_efectivo: 'suspendida', estado: 'suspendida', fecha_fin: '2020-01-01' }))).toBeNull() // la suspensión ya tiene su pantalla
  })
  it('por vencer (≤ 7 días): aviso informativo con "hoy", "mañana" o "en N días"', () => {
    expect(avisoSuscripcion(s({ fecha_fin: '2026-10-10', dias_para_vencer: 0 }))).toMatchObject({ nivel: 'info' })
    expect(avisoSuscripcion(s({ fecha_fin: '2026-10-10', dias_para_vencer: 0 })).mensaje).toMatch(/vence hoy/)
    expect(avisoSuscripcion(s({ fecha_fin: '2026-10-11', dias_para_vencer: 1 })).mensaje).toMatch(/vence mañana/)
    expect(avisoSuscripcion(s({ fecha_fin: '2026-10-16', dias_para_vencer: 6 })).mensaje).toMatch(/vence en 6 días/)
    expect(avisoSuscripcion(s({ fecha_fin: '2026-10-17', dias_para_vencer: 8 }))).toBeNull()
  })
  it('en gracia: alerta con la fecha de vencimiento y hasta cuándo puede renovar; dice que no se borra nada', () => {
    const a = avisoSuscripcion(s({ estado_efectivo: 'gracia', fecha_fin: '2026-10-10', dias_para_vencer: -3, dias_gracia: 7 }))
    expect(a.nivel).toBe('alerta')
    expect(a.mensaje).toMatch(/venció el 10 de octubre de 2026/)
    expect(a.mensaje).toMatch(/hasta el 17 de octubre de 2026/)
    expect(a.mensaje).toMatch(/No se borra ninguna información/)
  })
  it('vencida: crítico, conserva la información y manda a contactar', () => {
    const a = avisoSuscripcion(s({ estado_efectivo: 'vencida', fecha_fin: '2026-09-01', dias_para_vencer: -40 }))
    expect(a.nivel).toBe('critico')
    expect(a.mensaje).toMatch(/vencida desde el 1 de septiembre de 2026/)
    expect(a.mensaje).toMatch(/información se conserva/)
  })
  it('la gracia cruza fin de mes y de año sin errores de fecha', () => {
    expect(avisoSuscripcion(s({ estado_efectivo: 'gracia', fecha_fin: '2026-12-28', dias_gracia: 7 })).mensaje).toMatch(/hasta el 4 de enero de 2027/)
    expect(avisoSuscripcion(s({ estado_efectivo: 'gracia', fecha_fin: '2028-02-26', dias_gracia: 7 })).mensaje).toMatch(/hasta el 4 de marzo de 2028/) // bisiesto
  })
  it('almacenamiento en los excesos', () => {
    expect(mensajeExceso({ tipo: 'almacenamiento_mb', usado: 6, limite: 5 })).toMatch(/6 MB de almacenamiento y el plan permite 5/)
    expect(mensajeExceso({ tipo: 'almacenamiento_mb', usado: 6, limite: 5 })).toMatch(/subir nuevos archivos/)
  })
})

describe('BarraUso con unidad', () => {
  const html = (p) => renderToStaticMarkup(h(BarraUso, p))
  it('almacenamiento: "6 MB / 5 MB", al 100 % y en rojo', () => {
    const r = html({ etiqueta: 'Almacenamiento', usado: 6, limite: 5, unidad: 'MB' })
    expect(r).toContain('6 MB / 5 MB')
    expect(r).toContain('aria-valuenow="100"')
    expect(r).toContain('bg-red-500')
  })
  it('ilimitado: "6 MB / Ilimitado" y sin barra', () => {
    const r = html({ etiqueta: 'Almacenamiento', usado: 6, limite: null, unidad: 'MB' })
    expect(r).toContain('6 MB / Ilimitado')
    expect(r).not.toContain('Ilimitado MB') // la unidad no se pega a "Ilimitado"
    expect(r).not.toContain('progressbar')
  })
  it('sin unidad la salida de siempre no cambia ("423 / 2,000")', () => {
    expect(html({ etiqueta: 'Pacientes', usado: 423, limite: 2000 })).toContain('423 / 2,000')
  })
})

const f = (codigo, habilitada = true) => ({ codigo, nombre: `Func ${codigo}`, categoria: 'x', habilitada })
function conPlan(rol, extra = {}, perfilExtra = {}) {
  useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol, ...perfilExtra } })
  usePlanStore.setState({
    suscripcion: { sin_suscripcion: false, plan: { nombre: 'Plan P' }, estado: 'activa', estado_efectivo: 'gracia', fecha_fin: '2026-10-10', dias_para_vencer: -3, dias_gracia: 7,
      limites: { pacientes: 500, usuarios: 3, sucursales: 1, sesiones: 1, almacenamiento_mb: 5 }, uso: { pacientes: 1, usuarios: 1, sucursales: 0, almacenamiento_mb: 6 },
      excesos: [{ tipo: 'almacenamiento_mb', usado: 6, limite: 5 }], funcionalidades: [f('agenda')], ...extra },
    claveSuscripcion: 'u1:c1', cargada: true
  })
}
const render = (el) => renderToStaticMarkup(h(StaticRouter, { location: '/' }, el))

describe('aviso de suscripción en pantalla (solo el propietario y la plataforma)', () => {
  beforeEach(() => { useAuthStore.setState({ perfil: null }); usePlanStore.getState().limpiar() })
  it('el OWNER ve el aviso de gracia con el botón de contacto', () => {
    conPlan('owner')
    const r = render(h(AvisoSuscripcion))
    expect(r).toContain('venció el 10 de octubre de 2026')
    expect(r).toContain('data-nivel="alerta"')
    expect(r).toContain('Contactar a SIRO')
  })
  it('dentista, recepción y asistente NO ven temas de cobro', () => {
    for (const rol of ['dentista', 'recepcion', 'asistente']) { conPlan(rol); expect(render(h(AvisoSuscripcion)), rol).toBe('') }
  })
  it('el superadmin sí lo ve; y sin suscripción cargada o heredada no aparece nada', () => {
    conPlan('dentista', {}, { es_super_admin: true })
    expect(render(h(AvisoSuscripcion))).toContain('venció')
    conPlan('owner', { sin_suscripcion: true })
    expect(render(h(AvisoSuscripcion))).toBe('')
    useAuthStore.setState({ perfil: { id: 'u1', clinica_id: 'c1', rol: 'owner' } })
    usePlanStore.getState().limpiar()
    expect(render(h(AvisoSuscripcion))).toBe('')
  })
  it('la suscripción de OTRA cuenta no se muestra', () => {
    conPlan('owner')
    usePlanStore.setState({ claveSuscripcion: 'otro:otra' })
    expect(render(h(AvisoSuscripcion))).toBe('')
  })
  it('activa lejos del vencimiento: sin aviso', () => {
    conPlan('owner', { estado_efectivo: 'activa', fecha_fin: '2027-12-01', dias_para_vencer: 400, excesos: [] })
    expect(render(h(AvisoSuscripcion))).toBe('')
  })
})

describe('panel del plan: almacenamiento y vencimiento', () => {
  beforeEach(() => { useAuthStore.setState({ perfil: null }); usePlanStore.getState().limpiar() })
  it('muestra la barra de almacenamiento (6 MB / 5 MB), el exceso y el aviso de gracia', () => {
    conPlan('owner')
    const r = render(h(PlanActualClinica))
    expect(r).toContain('Almacenamiento')
    expect(r).toContain('6 MB / 5 MB')
    expect(r).toContain('6 MB de almacenamiento y el plan permite 5')
    expect(r).toContain('venció el 10 de octubre de 2026')
  })
  it('almacenamiento ilimitado: "Ilimitado" y sin exceso', () => {
    conPlan('owner', { limites: { pacientes: 500, usuarios: 3, sucursales: 1, sesiones: 1, almacenamiento_mb: null }, excesos: [], estado_efectivo: 'activa', dias_para_vencer: 300 })
    const r = render(h(PlanActualClinica))
    expect(r).toContain('6 MB / Ilimitado')
    expect(r).not.toContain('actualmente tiene')
  })
})
