import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted() es necesario aquí: vi.mock() se eleva por encima de todo
// el archivo, así que la referencia al mock debe elevarse con él (si se
// declarara con un `const` normal, el factory de vi.mock la vería
// todavía sin inicializar).
const { maybeSingleMock } = vi.hoisted(() => ({ maybeSingleMock: vi.fn() }))

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: maybeSingleMock,
        }),
      }),
    }),
  },
}))

const { cargarEstablecimientoPorClues } = await import('../sis-catalogos-supabase')

beforeEach(() => {
  maybeSingleMock.mockClear()
})

describe('cargarEstablecimientoPorClues', () => {
  it('devuelve un CatalogosSis con una sola entrada cuando la CLUES existe', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: {
        clues: 'MCIMB000123',
        institucion: 'SSA',
        entidad: '15',
        en_operacion: true,
        nombre_unidad: 'Clínica de prueba',
      },
      error: null,
    })

    const catalogos = await cargarEstablecimientoPorClues('mcimb000123') // minúsculas a propósito
    expect(catalogos.establecimientos?.size).toBe(1)
    const entrada = catalogos.establecimientos?.get('MCIMB000123')
    expect(entrada?.institucion).toBe('SSA')
    expect(entrada?.enOperacion).toBe(true)
  })

  it('devuelve vacío (no bloqueante) cuando la CLUES no existe', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null })
    const catalogos = await cargarEstablecimientoPorClues('NOEXISTE000')
    expect(catalogos.establecimientos).toBeUndefined()
  })

  it('devuelve vacío si clues es una cadena vacía (no consulta la BD)', async () => {
    const catalogos = await cargarEstablecimientoPorClues('')
    expect(catalogos).toEqual({})
    expect(maybeSingleMock).not.toHaveBeenCalled()
  })
})
