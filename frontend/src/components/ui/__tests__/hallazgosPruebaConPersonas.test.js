// Correcciones de la prueba con personas (29/10/2026): teléfonos, alergias contra la receta y la cuadrícula de la agenda.
import { describe, it, expect } from 'vitest'
import { normalizarTelefono, telefonoValido, terminoTelefonico } from '../../../lib/telefono'
import { conflictosDeAlergia } from '../../../lib/alergiasMedicamentos'
import { rangoDeHoras, columnasDeCitas } from '../../agenda/CuadriculaCalendario'
import { HORA_INICIO, HORA_FIN } from '../../agenda/constantes'
import { prepararPacienteNuevo, nombreTrasCambioDeApellidos } from '../../../lib/pacienteNuevo'

describe('teléfonos', () => {
  it('se guardan solo con dígitos (y + internacional)', () => {
    expect(normalizarTelefono('55 1234 5678')).toBe('5512345678')
    expect(normalizarTelefono('(55) 1234-5678')).toBe('5512345678')
    expect(normalizarTelefono('+52 55 1234 5678')).toBe('+525512345678')
    expect(prepararPacienteNuevo({ nombre_completo: 'X', telefono: '55-1234-5678' }).telefono).toBe('5512345678')
  })
  it('rechaza letras o números cortos; vacío es válido (opcional)', () => {
    expect(telefonoValido('55-12ab')).toBe(false)
    expect(telefonoValido('5512')).toBe(false)
    expect(telefonoValido('55 1234 5678')).toBe(true)
    expect(telefonoValido('')).toBe(true)
  })
  it('una búsqueda con forma de teléfono se busca por sus dígitos', () => {
    expect(terminoTelefonico('55 1234')).toBe('551234')
    expect(terminoTelefonico('Pérez')).toBeNull()
  })
})

describe('alergias contra la receta', () => {
  const alergias = [{ sustancia: 'Penicilina', severidad: 'Grave' }]
  it('avisa amoxicilina (familia de la penicilina), sin importar mayúsculas ni acentos', () => {
    const c = conflictosDeAlergia([{ medicamento: 'AMOXICILINA' }, { medicamento: 'Paracetamol' }], alergias)
    expect(c).toEqual([{ medicamento: 'AMOXICILINA', alergia: 'Penicilina', severidad: 'Grave' }])
    expect(conflictosDeAlergia([{ medicamento: 'Penicilina benzatínica' }], alergias)).toHaveLength(1)
  })
  it('AINE: ibuprofeno choca con «alergia a AINEs»; sin alergias no hay avisos', () => {
    expect(conflictosDeAlergia([{ medicamento: 'Ibuprofeno 400 mg' }], [{ sustancia: 'AINEs' }])).toHaveLength(1)
    expect(conflictosDeAlergia([{ medicamento: 'Amoxicilina' }], [])).toEqual([])
  })
})

describe('agenda', () => {
  const cita = (id, ini, fin) => ({ id, inicio: ini, fin })
  it('la cuadrícula se amplía para incluir citas de madrugada o de noche', () => {
    expect(rangoDeHoras([])).toEqual({ inicio: HORA_INICIO, fin: HORA_FIN })
    const r = rangoDeHoras([cita('a', '2026-10-29T00:30:00', '2026-10-29T01:15:00'), cita('b', '2026-10-29T22:00:00', '2026-10-29T23:30:00')])
    expect(r).toEqual({ inicio: 0, fin: 24 })
  })
  it('las citas que se empalman quedan lado a lado', () => {
    const cols = columnasDeCitas([
      cita('a', '2026-10-29T10:00:00', '2026-10-29T11:00:00'),
      cita('b', '2026-10-29T10:15:00', '2026-10-29T10:45:00'),
      cita('c', '2026-10-29T12:00:00', '2026-10-29T12:30:00')
    ])
    expect(cols.get('a')).toEqual({ columna: 0, total: 2 })
    expect(cols.get('b')).toEqual({ columna: 1, total: 2 })
    expect(cols.get('c')).toEqual({ columna: 0, total: 1 })
  })
})

describe('apellidos editados', () => {
  it('el nombre visible sigue a los apellidos', () => {
    expect(nombreTrasCambioDeApellidos('Laura Gómez Ríos', { primer_apellido: 'Gómez', segundo_apellido: 'Ríos' }, { primer_apellido: 'Ruiz', segundo_apellido: 'Ríos' })).toBe('Laura Ruiz Ríos')
    expect(nombreTrasCambioDeApellidos('Diego', { primer_apellido: null }, { primer_apellido: 'Martínez' })).toBe('Diego Martínez')
    expect(nombreTrasCambioDeApellidos('Ana Pérez Gil', { primer_apellido: 'Pérez', segundo_apellido: 'Gil' }, { primer_apellido: 'Pérez', segundo_apellido: '' })).toBe('Ana Pérez')
  })
})

describe('búsqueda sin acentos y planes públicos', async () => {
  const { sinAcentos } = await import('../../../lib/texto')
  const { buscarCie10 } = await import('../../../lib/cie10')
  const { formatearPrecioPublico } = await import('../../../services/planesPublicos')
  it('José/Jose, García/Garcia, Clínica/Clinica, Rodríguez/Rodriguez comparan igual', () => {
    for (const [con, sin] of [['José', 'jose'], ['García', 'garcia'], ['Clínica', 'clinica'], ['RODRÍGUEZ', 'rodriguez'], ['Peña', 'pena']]) {
      expect(sinAcentos(con)).toBe(sinAcentos(sin))
    }
  })
  it('CIE-10 encuentra con o sin acentos', () => {
    expect(buscarCie10('dentina').length).toBeGreaterThan(0)
    expect(buscarCie10('erosion').map((c) => c.codigo)).toEqual(buscarCie10('erosión').map((c) => c.codigo))
  })
  it('el precio público se formatea en pesos sin inventar decimales', () => {
    expect(formatearPrecioPublico(999, 'MXN')).toMatch(/999/)
    expect(formatearPrecioPublico('x')).toBe('')
  })
})
