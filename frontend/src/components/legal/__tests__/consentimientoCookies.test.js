// Las preferencias de cookies tienen EFECTO REAL: sin permiso no se guarda nada de la categoría «Preferencias», y al
// rechazarlas se borra lo ya guardado. Además, ninguna pantalla escribe en localStorage por su cuenta.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { INVENTARIO_COOKIES } from '../../../lib/inventarioCookies'

function almacenamiento(inicial = {}) {
  const m = new Map(Object.entries(inicial))
  return {
    get length() { return m.size },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _mapa: m
  }
}

async function cargarStore(inicial) {
  globalThis.localStorage = almacenamiento(inicial)
  vi.resetModules()
  return import('../../../store/useCookiesStore')
}

const decision = (preferencias) => JSON.stringify({ version: 1, preferencias: { necesarias: true, preferencias, analiticas: false, marketing: false } })

describe('consentimiento de cookies', () => {
  beforeEach(() => { delete globalThis.localStorage })

  it('antes de decidir no se guarda ninguna preferencia', async () => {
    const m = await cargarStore()
    expect(m.guardarPreferenciaLocal('sirso_odontograma_view', '3d')).toBe(false)
    expect(localStorage.getItem('sirso_odontograma_view')).toBeNull()
  })

  it('con «Aceptar todas» se guardan y se leen', async () => {
    const m = await cargarStore()
    m.useCookiesStore.getState().aceptarTodas()
    expect(m.guardarPreferenciaLocal('sirso_odontograma_view', '3d')).toBe(true)
    expect(m.leerPreferenciaLocal('sirso_odontograma_view')).toBe('3d')
  })

  it('al rechazar se BORRA lo ya guardado (correo recordado, vista, primeros pasos) y no se vuelve a guardar', async () => {
    const m = await cargarStore()
    m.useCookiesStore.getState().aceptarTodas()
    m.guardarPreferenciaLocal('siro_usuario_recordado', 'a@b.mx')
    m.guardarPreferenciaLocal('sirso_odontograma_view', '3d')
    m.guardarPreferenciaLocal('siro:onboarding-oculto:u1', '1')
    localStorage.setItem('sb-x-auth-token', 'sesion')
    m.useCookiesStore.getState().rechazarNoNecesarias()
    expect([...localStorage._mapa.keys()].sort()).toEqual(['sb-x-auth-token', 'siro_preferencias_cookies'])
    expect(m.guardarPreferenciaLocal('sirso_odontograma_view', '2d')).toBe(false)
    expect(m.leerPreferenciaLocal('siro_usuario_recordado')).toBeNull()
  })

  it('quien ya había rechazado antes de esta corrección: lo que quedó guardado se limpia al abrir SIRO', async () => {
    await cargarStore({ siro_preferencias_cookies: decision(false), siro_usuario_recordado: 'a@b.mx', 'siro:onboarding-oculto:u': '1', otra: 'x' })
    expect([...localStorage._mapa.keys()].sort()).toEqual(['otra', 'siro_preferencias_cookies'])
  })

  it('analíticas y marketing no se pueden activar (no existen)', async () => {
    const m = await cargarStore()
    m.useCookiesStore.getState().guardar({ preferencias: true, analiticas: true, marketing: true })
    expect(m.useCookiesStore.getState().preferencias).toEqual({ necesarias: true, preferencias: true, analiticas: false, marketing: false })
  })

  it('cada clave de «Preferencias» está declarada en el inventario público', async () => {
    const m = await cargarStore()
    const declarado = INVENTARIO_COOKIES.filter((c) => c.categoria === 'preferencias').map((c) => c.nombre).join(' ')
    for (const c of [...m.CLAVES_PREFERENCIAS, ...m.PREFIJOS_PREFERENCIAS]) expect(declarado).toContain(c)
  })
})

describe('GUARDIA: nadie escribe en localStorage sin pasar por el consentimiento', () => {
  it('localStorage.setItem solo aparece en store/useCookiesStore.js', () => {
    const src = fileURLToPath(new URL('../../../', import.meta.url))
    const archivos = []
    const recorrer = (d) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n)
        if (statSync(p).isDirectory()) { if (n !== '__tests__' && n !== 'node_modules') recorrer(p) } else if (/\.(js|jsx)$/.test(n)) archivos.push(p)
      }
    }
    recorrer(src)
    const infractores = archivos.filter((p) => !p.replace(/\\/g, '/').endsWith('store/useCookiesStore.js') && /localStorage\.setItem\(/.test(readFileSync(p, 'utf8')))
    expect(infractores).toEqual([])
  })
})
