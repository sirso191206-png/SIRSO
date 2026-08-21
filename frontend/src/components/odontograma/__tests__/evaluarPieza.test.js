import { describe, it, expect } from 'vitest'
import { evaluarPieza } from '../Diente3D'

function pieza(estado, caras = []) {
  return { id: 'x', numero_pieza: '47', estado, caras }
}

describe('evaluarPieza — mapeo de estado clínico a representación visual', () => {
  it('sano → color marfil, sin símbolo', () => {
    const info = evaluarPieza(pieza('sano'))
    expect(info.simbolo).toBeNull()
    expect(info.opacity).toBe(1)
  })

  it('ausente → opacidad reducida, símbolo ×, SIN raíz (se oculta la pieza completa)', () => {
    const info = evaluarPieza(pieza('ausente'))
    expect(info.simbolo).toBe('×')
    expect(info.opacity).toBe(0.3)
    expect(info.esRaiz).toBe(false)
  })

  it('implante → color violeta, símbolo ◆', () => {
    const info = evaluarPieza(pieza('implante'))
    expect(info.color).toBe('#C4B5FD')
    expect(info.simbolo).toBe('◆')
  })

  it('corona → color amarillo, símbolo ●', () => {
    const info = evaluarPieza(pieza('corona'))
    expect(info.color).toBe('#FCD34D')
    expect(info.simbolo).toBe('●')
  })

  it('caries (por cara) → color rojizo, símbolo ●', () => {
    const info = evaluarPieza(pieza('sano', [{ cara: 'oclusal', estado: 'caries' }]))
    expect(info.color).toBe('#FCA5A5')
  })

  it('fracturado (por cara) → color naranja', () => {
    const info = evaluarPieza(pieza('sano', [{ cara: 'vestibular', estado: 'fracturado' }]))
    expect(info.color).toBe('#FDBA74')
  })

  it('en_tratamiento → color cian', () => {
    const info = evaluarPieza(pieza('en_tratamiento'))
    expect(info.color).toBe('#67E8F9')
  })

  it('obturado (por cara) → color azul, símbolo ✓', () => {
    const info = evaluarPieza(pieza('sano', [{ cara: 'oclusal', estado: 'obturado' }]))
    expect(info.color).toBe('#93C5FD')
    expect(info.simbolo).toBe('✓')
  })

  it('todos los estados menos "ausente" tienen esRaiz=true (raíz artificial aplica salvo cuando el diente no existe)', () => {
    for (const estado of ['sano', 'implante', 'corona', 'endodoncia', 'en_tratamiento']) {
      expect(evaluarPieza(pieza(estado)).esRaiz).toBe(true)
    }
    expect(evaluarPieza(pieza('ausente')).esRaiz).toBe(false)
  })
})
