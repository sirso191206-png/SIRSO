import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

const HORA = 60 * 60 * 1000
const MIN = 60 * 1000
const RAPIDO = { iteraciones: 1000 } // para no tardar; una prueba verifica el valor real por defecto
const PIN = '482915'

// Cada prueba = un navegador nuevo. `reiniciar()` = cerrar y reabrir la
// app sobre la MISMA base de datos (se pierde la RAM, no IndexedDB).
async function cargar() {
  vi.resetModules()
  return import('../../../../lib/pinOffline.js')
}

// Lee el registro tal como quedó guardado, sin pasar por el módulo.
function leerCrudo() {
  return new Promise((resolve, reject) => {
    const abrir = indexedDB.open('siro-pin-offline', 1)
    // Si la base aún no existe (nunca se guardó nada), se crea igual que
    // lo haría el módulo — abrirla "en blanco" dejaría una base rota.
    abrir.onupgradeneeded = () => abrir.result.createObjectStore('pin', { keyPath: 'ranura' })
    abrir.onsuccess = () => {
      const peticion = abrir.result.transaction('pin', 'readonly').objectStore('pin').get('dispositivo')
      peticion.onsuccess = () => resolve(peticion.result ?? null)
      peticion.onerror = () => reject(peticion.error)
    }
    abrir.onerror = () => reject(abrir.error)
  })
}

let pinMod
beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-27T10:00:00Z'))
  pinMod = await cargar()
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('Formato del PIN', () => {
  it.each(['482915', '90817263', '3141592653'])('acepta %s', (pin) => {
    expect(pinMod.validarFormatoPin(pin)).toEqual({ valido: true })
  })

  it.each([
    ['12345', 'MUY_CORTO'],
    ['48291573901', 'MUY_LARGO'],
    ['48a915', 'SOLO_DIGITOS'],
    ['', 'SOLO_DIGITOS'],
    ['000000', 'MUY_PREVISIBLE'],
    ['777777', 'MUY_PREVISIBLE'],
    ['123456', 'MUY_PREVISIBLE'],
    ['654321', 'MUY_PREVISIBLE'],
    ['121212', 'MUY_PREVISIBLE'],
    ['123123', 'MUY_PREVISIBLE']
  ])('rechaza %j (%s)', (pin, motivo) => {
    expect(pinMod.validarFormatoPin(pin)).toEqual({ valido: false, motivo })
  })

  it('rechaza lo que no es texto', () => {
    expect(pinMod.validarFormatoPin(482915).valido).toBe(false)
    expect(pinMod.validarFormatoPin(null).valido).toBe(false)
  })
})

describe('Comparación en tiempo constante', () => {
  it('iguales → true; distintos (en cualquier posición) o de distinto largo → false', () => {
    const a = new Uint8Array([1, 2, 3, 4])
    expect(pinMod.igualesEnTiempoConstante(a, new Uint8Array([1, 2, 3, 4]))).toBe(true)
    expect(pinMod.igualesEnTiempoConstante(a, new Uint8Array([9, 2, 3, 4]))).toBe(false)
    expect(pinMod.igualesEnTiempoConstante(a, new Uint8Array([1, 2, 3, 9]))).toBe(false)
    expect(pinMod.igualesEnTiempoConstante(a, new Uint8Array([1, 2, 3]))).toBe(false)
  })
})

describe('Almacenamiento seguro (hash/derivación, nunca el PIN)', () => {
  it('lo guardado NO contiene el PIN ni en claro ni en ninguna forma legible', async () => {
    await pinMod.configurarPin('u1', PIN, RAPIDO)
    const registro = await leerCrudo()

    expect(JSON.stringify(registro)).not.toContain(PIN)
    expect(Object.keys(registro).sort()).toEqual([
      'algoritmo', 'bloqueadoHasta', 'creadoEn', 'duracionHoras', 'hash', 'intentosFallidos',
      'iteraciones', 'ranura', 'sal', 'userId', 'validadoEn', 'version'
    ])
    // Y ninguna credencial de sesión:
    expect(JSON.stringify(registro)).not.toMatch(/token|password|contrase/i)
  })

  it('usa PBKDF2-SHA256 y registra sus parámetros, para poder verificar y endurecer después', async () => {
    await pinMod.configurarPin('u1', PIN, RAPIDO)
    const r = await leerCrudo()
    expect(r.algoritmo).toBe('PBKDF2-SHA256')
    expect(r.iteraciones).toBe(1000)
    expect(atob(r.sal)).toHaveLength(16) // sal de 16 bytes
    expect(atob(r.hash)).toHaveLength(32) // derivación de 256 bits
  })

  it('el valor por defecto de iteraciones es ≥ 600 000 (recomendación OWASP para PBKDF2-SHA256)', async () => {
    expect(pinMod.CONFIG_PIN.iteraciones).toBeGreaterThanOrEqual(600_000)
    await pinMod.configurarPin('u1', PIN) // sin RAPIDO: usa el real
    expect((await leerCrudo()).iteraciones).toBe(pinMod.CONFIG_PIN.iteraciones)
  })

  it('el mismo PIN en dos momentos produce sal y hash DISTINTOS (sal aleatoria por PIN)', async () => {
    await pinMod.configurarPin('u1', PIN, RAPIDO)
    const a = await leerCrudo()
    await pinMod.configurarPin('u1', PIN, RAPIDO)
    const b = await leerCrudo()

    expect(a.sal).not.toBe(b.sal)
    expect(a.hash).not.toBe(b.hash)
  })

  it('un piso absoluto impide configurar 1 iteración por error', async () => {
    await pinMod.configurarPin('u1', PIN, { iteraciones: 1 })
    expect((await leerCrudo()).iteraciones).toBeGreaterThanOrEqual(1000)
  })

  it('no permite configurar un PIN inválido y no deja nada guardado', async () => {
    expect(await pinMod.configurarPin('u1', '123456', RAPIDO)).toEqual({ ok: false, motivo: 'MUY_PREVISIBLE' })
    expect(await leerCrudo()).toBeNull()
  })

  it('obtenerEstadoPin nunca devuelve sal ni hash', async () => {
    await pinMod.configurarPin('u1', PIN, RAPIDO)
    const estado = await pinMod.obtenerEstadoPin('u1')
    expect(JSON.stringify(estado)).not.toMatch(/sal|hash/i)
    expect(estado.configurado).toBe(true)
  })
})

describe('Verificar el PIN', () => {
  beforeEach(() => pinMod.configurarPin('u1', PIN, RAPIDO))

  it('el PIN correcto desbloquea', async () => {
    expect(await pinMod.verificarPin('u1', PIN)).toEqual({ ok: true })
  })

  it('un PIN incorrecto NO desbloquea y dice cuántos intentos quedan', async () => {
    expect(await pinMod.verificarPin('u1', '000111')).toEqual({ ok: false, motivo: 'PIN_INCORRECTO', intentosRestantes: 4 })
    expect(await pinMod.verificarPin('u1', '000111')).toMatchObject({ intentosRestantes: 3 })
  })

  it('un PIN casi correcto (un dígito distinto) tampoco desbloquea', async () => {
    expect((await pinMod.verificarPin('u1', '482916')).ok).toBe(false)
  })

  it('no desbloquea a otro usuario: el PIN de u1 no sirve para u2', async () => {
    expect(await pinMod.verificarPin('u2', PIN)).toEqual({ ok: false, motivo: 'SIN_PIN' })
  })

  it('sin PIN configurado responde SIN_PIN', async () => {
    await pinMod.revocarPin()
    expect(await pinMod.verificarPin('u1', PIN)).toEqual({ ok: false, motivo: 'SIN_PIN' })
  })

  it('un acierto pone el contador de fallos en cero', async () => {
    await pinMod.verificarPin('u1', '000111')
    await pinMod.verificarPin('u1', '000111')
    await pinMod.verificarPin('u1', PIN)
    expect((await leerCrudo()).intentosFallidos).toBe(0)
    expect(await pinMod.verificarPin('u1', '000111')).toMatchObject({ intentosRestantes: 4 })
  })
})

describe('Límite de intentos', () => {
  beforeEach(() => pinMod.configurarPin('u1', PIN, RAPIDO))
  const fallar = async (n) => { for (let i = 0; i < n; i++) await pinMod.verificarPin('u1', '000111') }

  it('el 5.º error seguido bloquea 15 minutos', async () => {
    await fallar(4)
    const quinto = await pinMod.verificarPin('u1', '000111')
    expect(quinto).toMatchObject({ ok: false, motivo: 'PIN_INCORRECTO', intentosRestantes: 5 })
    expect(quinto.bloqueadoHasta).toBe(Date.now() + 15 * MIN)
  })

  it('mientras está bloqueado, ni el PIN CORRECTO desbloquea — y no cuenta como intento', async () => {
    await fallar(5)
    const intentosAntes = (await leerCrudo()).intentosFallidos

    const r = await pinMod.verificarPin('u1', PIN)
    expect(r).toMatchObject({ ok: false, motivo: 'BLOQUEADO_TEMPORAL' })
    expect((await leerCrudo()).intentosFallidos).toBe(intentosAntes)
  })

  it('pasado el bloqueo, el PIN correcto vuelve a funcionar', async () => {
    await fallar(5)
    vi.setSystemTime(Date.now() + 15 * MIN + 1000)
    expect(await pinMod.verificarPin('u1', PIN)).toEqual({ ok: true })
  })

  it('tras el bloqueo, cada nuevo error vuelve a bloquear (el contador NO se reinicia solo)', async () => {
    await fallar(5)
    vi.setSystemTime(Date.now() + 15 * MIN + 1000)
    const sexto = await pinMod.verificarPin('u1', '000111')
    expect(sexto.intentosRestantes).toBe(4) // faltan 4 para la revocación (10 - 6)
    expect(sexto.bloqueadoHasta).toBeGreaterThan(Date.now())
  })

  it('el 10.º error seguido REVOCA el PIN: se borra y hay que volver a entrar con contraseña', async () => {
    for (let i = 0; i < 9; i++) {
      await pinMod.verificarPin('u1', '000111')
      vi.setSystemTime(Date.now() + 16 * MIN) // esperar cada bloqueo
    }
    const decimo = await pinMod.verificarPin('u1', '000111')
    expect(decimo).toEqual({ ok: false, motivo: 'REVOCADO_POR_INTENTOS' })
    expect(await leerCrudo()).toBeNull()

    // Ni siquiera el PIN correcto sirve ya:
    expect(await pinMod.verificarPin('u1', PIN)).toEqual({ ok: false, motivo: 'SIN_PIN' })
  })

  it('los intentos y el bloqueo SOBREVIVEN a cerrar y reabrir la app (no basta con recargar para reiniciarlos)', async () => {
    await fallar(5)
    const reabierta = await cargar() // módulos nuevos, misma base
    expect(await reabierta.verificarPin('u1', PIN)).toMatchObject({ ok: false, motivo: 'BLOQUEADO_TEMPORAL' })
  })

  it('un fallo A MITAD de la verificación igualmente cuenta como intento (no regala intentos gratis)', async () => {
    vi.spyOn(globalThis.crypto.subtle, 'deriveBits').mockRejectedValueOnce(new Error('se cerró la pestaña'))
    await expect(pinMod.verificarPin('u1', PIN)).rejects.toThrow('se cerró la pestaña')
    expect((await leerCrudo()).intentosFallidos).toBe(1)
  })

  it('dos intentos lanzados a la vez se cuentan los dos (no se "comen" un intento entre sí)', async () => {
    await Promise.all([
      pinMod.verificarPin('u1', '000111'),
      pinMod.verificarPin('u1', '000222'),
      pinMod.verificarPin('u1', '000333')
    ])
    expect((await leerCrudo()).intentosFallidos).toBe(3)
  })
})

describe('Vigencia configurable (expiración)', () => {
  it.each([8, 24, 72, 168])('acepta una vigencia de %i h', async (h) => {
    const r = await pinMod.configurarPin('u1', PIN, { ...RAPIDO, duracionHoras: h })
    expect(r.ok).toBe(true)
    expect(r.expiraEn).toBe(Date.now() + h * HORA)
  })

  it('rechaza una vigencia fuera de las opciones permitidas (nadie puede fijar "para siempre")', async () => {
    for (const h of [0, 1, 100, 9999, '72', null]) {
      expect(await pinMod.configurarPin('u1', PIN, { ...RAPIDO, duracionHoras: h })).toEqual({ ok: false, motivo: 'DURACION_INVALIDA' })
    }
  })

  it('por defecto la vigencia es de 72 h', async () => {
    await pinMod.configurarPin('u1', PIN, RAPIDO)
    expect((await pinMod.obtenerEstadoPin('u1')).duracionHoras).toBe(72)
  })

  it('pasada la vigencia sin internet, el PIN correcto YA NO desbloquea (EXPIRADO)', async () => {
    await pinMod.configurarPin('u1', PIN, { ...RAPIDO, duracionHoras: 8 })
    vi.setSystemTime(Date.now() + 8 * HORA - MIN)
    expect((await pinMod.verificarPin('u1', PIN)).ok).toBe(true)

    vi.setSystemTime(Date.now() + 2 * MIN)
    expect(await pinMod.verificarPin('u1', PIN)).toEqual({ ok: false, motivo: 'EXPIRADO' })
  })

  it('un PIN expirado no se ofrece en la pantalla de arranque', async () => {
    await pinMod.configurarPin('u1', PIN, { ...RAPIDO, duracionHoras: 8 })
    expect(await pinMod.obtenerPinDisponible()).not.toBeNull()
    vi.setSystemTime(Date.now() + 9 * HORA)
    expect(await pinMod.obtenerPinDisponible()).toBeNull()
  })

  it('validar la sesión con internet DESLIZA la vigencia (cuenta desde la última vez que hubo servidor)', async () => {
    await pinMod.configurarPin('u1', PIN, { ...RAPIDO, duracionHoras: 8 })
    vi.setSystemTime(Date.now() + 7 * HORA)
    await pinMod.registrarValidacionOnline('u1')

    vi.setSystemTime(Date.now() + 7 * HORA) // 14 h desde que se creó, pero 7 h desde la validación
    expect((await pinMod.verificarPin('u1', PIN)).ok).toBe(true)
  })

  it('si inicia sesión OTRA persona con internet, el PIN de la anterior se elimina', async () => {
    await pinMod.configurarPin('u1', PIN, RAPIDO)
    await pinMod.registrarValidacionOnline('u2')
    expect(await leerCrudo()).toBeNull()
  })
})

describe('Cambiar y revocar (solo con internet y sesión real: lo exige el store)', () => {
  beforeEach(() => pinMod.configurarPin('u1', PIN, { ...RAPIDO, duracionHoras: 24 }))

  it('cambiar exige el PIN actual correcto', async () => {
    expect(await pinMod.cambiarPin('u1', '000111', '719304', RAPIDO)).toMatchObject({ ok: false, motivo: 'PIN_INCORRECTO' })
    expect((await pinMod.verificarPin('u1', PIN)).ok).toBe(true) // sigue el PIN viejo
  })

  it('con el actual correcto cambia el PIN, conserva la vigencia elegida, y el viejo deja de servir', async () => {
    expect((await pinMod.cambiarPin('u1', PIN, '719304', RAPIDO)).ok).toBe(true)
    expect((await pinMod.obtenerEstadoPin('u1')).duracionHoras).toBe(24)
    expect((await pinMod.verificarPin('u1', '719304')).ok).toBe(true)
    expect((await pinMod.verificarPin('u1', PIN)).ok).toBe(false)
  })

  it('no permite "cambiar" al mismo PIN', async () => {
    expect(await pinMod.cambiarPin('u1', PIN, PIN, RAPIDO)).toEqual({ ok: false, motivo: 'IGUAL_AL_ACTUAL' })
  })

  it('un PIN nuevo inválido no destruye el actual', async () => {
    expect(await pinMod.cambiarPin('u1', PIN, '111111', RAPIDO)).toMatchObject({ ok: false, motivo: 'MUY_PREVISIBLE' })
    expect((await pinMod.verificarPin('u1', PIN)).ok).toBe(true)
  })

  it('revocar borra el PIN sin pedirlo (la salida de "olvidé mi PIN")', async () => {
    await pinMod.revocarPin()
    expect(await leerCrudo()).toBeNull()
    expect((await pinMod.obtenerEstadoPin('u1')).configurado).toBe(false)
  })
})
