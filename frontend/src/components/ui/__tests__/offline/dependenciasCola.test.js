import { describe, it, expect } from 'vitest'
import { ordenarPorDependencias, estadoDeDependencias } from '../../../../lib/dependenciasCola.js'

const op = (id, dependeDe = []) => ({ id, dependeDe })

describe('ordenarPorDependencias', () => {
  it('sin dependencias: conserva un orden válido (cualquiera, todas listas)', () => {
    const { orden, enCiclo } = ordenarPorDependencias([op('a'), op('b'), op('c')])
    expect(enCiclo).toEqual([])
    expect(orden.map((o) => o.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('el padre siempre queda ANTES que su hijo, sin importar el orden de entrada', () => {
    const { orden } = ordenarPorDependencias([op('hijo', ['padre']), op('padre')])
    const posiciones = orden.map((o) => o.id)
    expect(posiciones.indexOf('padre')).toBeLessThan(posiciones.indexOf('hijo'))
  })

  it('cadena de tres niveles se ordena completa', () => {
    const { orden } = ordenarPorDependencias([op('nieto', ['hijo']), op('hijo', ['padre']), op('padre')])
    const p = orden.map((o) => o.id)
    expect(p.indexOf('padre')).toBeLessThan(p.indexOf('hijo'))
    expect(p.indexOf('hijo')).toBeLessThan(p.indexOf('nieto'))
  })

  it('una dependencia que YA NO está en el lote (se subió en una corrida anterior) no bloquea nada', () => {
    const { orden, enCiclo } = ordenarPorDependencias([op('hijo', ['padre-ya-subido'])])
    expect(enCiclo).toEqual([])
    expect(orden.map((o) => o.id)).toEqual(['hijo'])
  })

  it('dos hijos del mismo padre: ambos aparecen después del padre', () => {
    const { orden } = ordenarPorDependencias([op('hijoA', ['padre']), op('hijoB', ['padre']), op('padre')])
    const p = orden.map((o) => o.id)
    expect(p.indexOf('padre')).toBeLessThan(p.indexOf('hijoA'))
    expect(p.indexOf('padre')).toBeLessThan(p.indexOf('hijoB'))
  })

  it('un ciclo (A depende de B, B depende de A) se detecta y NINGUNO de los dos entra en `orden`', () => {
    const { orden, enCiclo } = ordenarPorDependencias([op('a', ['b']), op('b', ['a'])])
    expect(orden).toEqual([])
    expect(enCiclo.map((o) => o.id).sort()).toEqual(['a', 'b'])
  })

  it('un ciclo no afecta a otras operaciones sueltas del mismo lote', () => {
    const { orden, enCiclo } = ordenarPorDependencias([op('a', ['b']), op('b', ['a']), op('suelta')])
    expect(orden.map((o) => o.id)).toEqual(['suelta'])
    expect(enCiclo.map((o) => o.id).sort()).toEqual(['a', 'b'])
  })
})

describe('estadoDeDependencias', () => {
  it('sin dependencias: siempre "lista"', () => {
    expect(estadoDeDependencias(op('a'), { exitosas: new Set(), perdidasDefinitivas: new Set() })).toBe('lista')
  })

  it('todas las dependencias ya exitosas: "lista"', () => {
    expect(estadoDeDependencias(op('h', ['p']), { exitosas: new Set(['p']), perdidasDefinitivas: new Set() })).toBe('lista')
  })

  it('dependencia todavía sin resolver: "esperar"', () => {
    expect(estadoDeDependencias(op('h', ['p']), { exitosas: new Set(), perdidasDefinitivas: new Set() })).toBe('esperar')
  })

  it('dependencia perdida para siempre: "bloqueada" — nunca "esperar"', () => {
    expect(estadoDeDependencias(op('h', ['p']), { exitosas: new Set(), perdidasDefinitivas: new Set(['p']) })).toBe('bloqueada')
  })

  it('con VARIAS dependencias, basta que UNA esté perdida para bloquear, aunque las demás ya hayan tenido éxito', () => {
    const r = estadoDeDependencias(op('h', ['p1', 'p2']), { exitosas: new Set(['p1']), perdidasDefinitivas: new Set(['p2']) })
    expect(r).toBe('bloqueada')
  })

  it('con varias dependencias, hacen falta TODAS exitosas para estar "lista"', () => {
    const r = estadoDeDependencias(op('h', ['p1', 'p2']), { exitosas: new Set(['p1']), perdidasDefinitivas: new Set() })
    expect(r).toBe('esperar')
  })
})
