import { describe, it, expect, beforeAll } from 'vitest'
import { validarRegistroSis } from '../sis-validator'
import { cargarCatalogoDiagnosticos, type CatalogosSis } from '../sis-catalogs'
import type { SisRegistro } from '../sis-types'

function registroBase(): SisRegistro {
  return {
    clues: 'MCIMB000123',
    paisNacimiento: 142,
    curpPrestador: 'LOSD900505MOCPNN01',
    nombrePrestador: 'DANIELA',
    primerApellidoPrestador: 'LOPEZ',
    segundoApellidoPrestador: 'SANCHEZ',
    tipoPersonal: 13,
    programaSMyMG: 0,
    curpPaciente: 'BEGN971013MMCCNL00',
    nombre: 'NALLELY NOEMI',
    primerApellido: 'BECERRIL',
    segundoApellido: 'GONZALEZ',
    fechaNacimiento: '13/10/1997', // adulta al momento de la consulta de prueba
    paisNacPaciente: 142,
    entidadNacimiento: '15',
    sexoCURP: 2,
    sexoBiologico: 2, // MUJER
    seAutodenominaAfromexicano: 0,
    seConsideraIndigena: 0,
    migrante: 0,
    paisProcedencia: -1,
    genero: 2,
    derechohabiencia: '3',
    fechaConsulta: '01/10/2025',
    servicioAtencion: 10,
    peso: 67,
    talla: 165,
    circunferenciaCintura: 85,
    sistolica: 100,
    diastolica: 60,
    frecuenciaCardiaca: 88,
    frecuenciaRespiratoria: 20,
    temperatura: 36.5,
    saturacionOxigeno: 0,
    glucemia: 0,
    tipoMedicion: -1,
    primeraVezAnio: 1,
    relacionTemporal: 0,
    codigoCIEDiagnostico1: 'K021', // CARIES DE LA DENTINA — sin restricción de sexo/edad
    primeraVezDiagnostico2: -1,
    codigoCIEDiagnostico2: '',
    primeraVezDiagnostico3: -1,
    codigoCIEDiagnostico3: '',
    placaBacteriana: 1,
    cepillado: 0,
    hiloDental: 1,
    limpiezaDental: 0,
    protesis: 0,
    tejidosBucales: 0,
    autoExamen: 0,
    fluor: 0,
    raspadoAlisadoPeriodontal: 0,
    barnizFluor: 0,
    fosetasFisuras: 0,
    amalgamas: 0,
    resinas: 0,
    ionomeroVidrio: 0,
    alcasite: 0,
    obturacionTemporal: 0,
    dienteTemp: 0,
    dientePerm: 0,
    pulpar: 0,
    cirugiaBucal: 0,
    farmacoTerapia: 0,
    otrasAtenciones: 0,
    radiografias: 0,
    orientacionSaludBucal: 0,
    tratamientoIntegral: 0,
    lineaVida: 0,
    cartillaSalud: 0,
    esquemaVacunacion: 0,
    referidoPor: -1,
    contrarreferido: 0,
    telemedicina: 0,
    teleconsulta: 0,
    estudiosTeleconsulta: '-1',
    modalidadConsulDist: -1,
  }
}

describe('validador + catálogo real DIAGNOSTICO_SIS (9,076 códigos oficiales)', () => {
  let catalogos: CatalogosSis

  beforeAll(async () => {
    catalogos = { diagnosticos: await cargarCatalogoDiagnosticos() }
  })

  it('carga el catálogo completo (9,076 códigos vigentes filtrados por VALID/DIA_SIS)', () => {
    expect(catalogos.diagnosticos!.size).toBe(9076)
  })

  it('K021 (caries de la dentina, sin restricción) pasa validación en una mujer adulta', () => {
    const errores = validarRegistroSis(registroBase(), catalogos)
    expect(errores).toEqual([])
  })

  it('rechaza un código HOMBRE-restringido (B260 orquitis) en una paciente mujer', () => {
    const r = { ...registroBase(), codigoCIEDiagnostico1: 'B260' }
    const errores = validarRegistroSis(r, catalogos)
    expect(errores.some((e) => e.campo === 'codigoCIEDiagnostico1' && /HOMBRE/.test(e.mensaje))).toBe(true)
  })

  it('acepta un código HOMBRE-restringido en un paciente hombre', () => {
    const r = { ...registroBase(), sexoBiologico: 1, codigoCIEDiagnostico1: 'B260' }
    const errores = validarRegistroSis(r, catalogos)
    expect(errores.some((e) => e.campo === 'codigoCIEDiagnostico1')).toBe(false)
  })

  it('rechaza un código MUJER-restringido (C510, tumor del labio mayor) en un paciente hombre', () => {
    const r = { ...registroBase(), sexoBiologico: 1, codigoCIEDiagnostico1: 'C510' }
    const errores = validarRegistroSis(r, catalogos)
    expect(errores.some((e) => e.campo === 'codigoCIEDiagnostico1' && /MUJER/.test(e.mensaje))).toBe(true)
  })

  it('un paciente INTERSEXUAL (sexoBiologico=3) omite la restricción de sexo del catálogo', () => {
    const r = { ...registroBase(), sexoBiologico: 3, codigoCIEDiagnostico1: 'B260' } // restringido a HOMBRE
    const errores = validarRegistroSis(r, catalogos)
    expect(errores.some((e) => e.campo === 'codigoCIEDiagnostico1' && /HOMBRE/.test(e.mensaje))).toBe(false)
  })

  it('rechaza un código fuera del rango de edad (A34X, tétanos obstétrico, 10-54 años)', () => {
    const r = { ...registroBase(), fechaNacimiento: '01/01/2020', codigoCIEDiagnostico1: 'A34X' } // ~5 años
    const errores = validarRegistroSis(r, catalogos)
    expect(errores.some((e) => e.campo === 'codigoCIEDiagnostico1' && /edad mínima/.test(e.mensaje))).toBe(true)
  })

  it('rechaza un código que no existe en el catálogo', () => {
    const r = { ...registroBase(), codigoCIEDiagnostico1: 'ZZ99' }
    const errores = validarRegistroSis(r, catalogos)
    expect(errores.some((e) => e.campo === 'codigoCIEDiagnostico1' && /no se encontró/.test(e.mensaje))).toBe(true)
  })

  it('R69X (el fallback que usa sis-mapper cuando no hay diagnóstico) SÍ existe en el catálogo', () => {
    const r = { ...registroBase(), codigoCIEDiagnostico1: 'R69X' }
    const errores = validarRegistroSis(r, catalogos)
    expect(errores.some((e) => e.campo === 'codigoCIEDiagnostico1')).toBe(false)
  })

  it('sin catálogo cargado (llamada sin segundo argumento), no valida contra DIAGNOSTICO_SIS — solo formato', () => {
    const r = { ...registroBase(), codigoCIEDiagnostico1: 'ZZZZ' } // 4 caracteres, formato válido, código inexistente
    const errores = validarRegistroSis(r) // sin catalogos
    expect(errores).toEqual([])
  })
})

describe('sis-catalogs — PAIS y ENTIDAD_FEDERATIVA reales', () => {
  it('México es la clave 142 en el catálogo PAIS real', async () => {
    const { PAIS, buscarPais } = await import('../sis-catalogs')
    expect(buscarPais(142)?.nombre).toBe('MÉXICO')
    expect(PAIS.length).toBeGreaterThan(200)
  })

  it('el Estado de México es la clave 15 en ENTIDAD_FEDERATIVA', async () => {
    const { buscarEntidad, ENTIDAD_FEDERATIVA } = await import('../sis-catalogs')
    expect(buscarEntidad('15')?.nombre).toBe('MÉXICO')
    expect(ENTIDAD_FEDERATIVA.length).toBe(35)
  })

  it('incluye los códigos especiales 00, 88 y 99 de ENTIDAD_FEDERATIVA', async () => {
    const { buscarEntidad } = await import('../sis-catalogs')
    expect(buscarEntidad('00')?.nombre).toBe('NO ESPECIFICADO')
    expect(buscarEntidad('88')?.nombre).toBe('NO APLICA')
    expect(buscarEntidad('99')?.nombre).toBe('SE IGNORA')
  })
})
