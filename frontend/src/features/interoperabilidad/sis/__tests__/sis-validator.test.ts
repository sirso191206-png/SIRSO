import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { validarRegistroSis } from '../sis-validator'
import { parsearTxt } from '../sis-exporter'
import { SIS_FIELDS, type SisRegistro } from '../sis-types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_OFICIAL = join(__dirname, 'fixtures', 'CSB-EJEMPLOS-2410.txt')

function registroValido(): SisRegistro {
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
    fechaNacimiento: '13/10/1997',
    paisNacPaciente: 142,
    entidadNacimiento: '15',
    sexoCURP: 2,
    sexoBiologico: 2,
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
    codigoCIEDiagnostico1: 'S014',
    primeraVezDiagnostico2: 0,
    codigoCIEDiagnostico2: 'T170',
    primeraVezDiagnostico3: 0,
    codigoCIEDiagnostico3: 'R69X',
    placaBacteriana: 1,
    cepillado: 1,
    hiloDental: 1,
    limpiezaDental: 0,
    protesis: 0,
    tejidosBucales: 0,
    autoExamen: 1,
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
    orientacionSaludBucal: 1,
    tratamientoIntegral: 1,
    lineaVida: 0,
    cartillaSalud: 1,
    esquemaVacunacion: 1,
    referidoPor: -1,
    contrarreferido: 0,
    telemedicina: 0,
    teleconsulta: 0,
    estudiosTeleconsulta: '-1',
    modalidadConsulDist: -1,
  }
}

describe('prueba dorada: los 10 registros oficiales pasan validación', () => {
  const contenido = readFileSync(RUTA_OFICIAL).toString('latin1')
  const { registros } = parsearTxt(contenido)

  registros.forEach((registro, i) => {
    it(`registro oficial #${i + 1} no tiene errores de validación`, () => {
      const errores = validarRegistroSis(registro)
      if (errores.length > 0) {
        console.log(`Registro #${i + 1} errores:`, errores)
      }
      expect(errores).toEqual([])
    })
  })
})

describe('prueba dorada + catálogo real: los 10 registros oficiales, validados también contra DIAGNOSTICO_SIS', () => {
  const contenido = readFileSync(RUTA_OFICIAL).toString('latin1')
  const { registros } = parsearTxt(contenido)

  registros.forEach((registro, i) => {
    it(`registro oficial #${i + 1}: sus códigos CIE-10 son consistentes con sexo/edad del catálogo real`, async () => {
      const { cargarCatalogoDiagnosticos } = await import('../sis-catalogs')
      const diagnosticos = await cargarCatalogoDiagnosticos()
      const errores = validarRegistroSis(registro, { diagnosticos })
      // Solo nos interesan errores de los campos de diagnóstico — el resto
      // ya se cubre en la prueba dorada de arriba.
      const erroresDiagnostico = errores.filter((e) => e.campo.toString().startsWith('codigoCIEDiagnostico'))
      if (erroresDiagnostico.length > 0) {
        console.log(`Registro #${i + 1} — errores de diagnóstico:`, erroresDiagnostico)
      }
      expect(erroresDiagnostico).toEqual([])
    })
  })
})
describe('validarRegistroSis — registro construido válido', () => {
  it('no tiene errores', () => {
    expect(validarRegistroSis(registroValido())).toEqual([])
  })
})

describe('validarRegistroSis — casos negativos representativos', () => {
  it('rechaza CLUES con longitud incorrecta', () => {
    const r = { ...registroValido(), clues: 'CORTA' }
    expect(validarRegistroSis(r).some((e) => e.campo === 'clues')).toBe(true)
  })

  it('rechaza fecha de nacimiento posterior a la fecha de consulta', () => {
    const r = { ...registroValido(), fechaNacimiento: '01/01/2027', fechaConsulta: '01/10/2025' }
    expect(validarRegistroSis(r).some((e) => e.campo === 'fechaNacimiento')).toBe(true)
  })

  it('rechaza sistolica sin diastolica (diastolica=0 pero sistolica≠0)', () => {
    const r = { ...registroValido(), sistolica: 120, diastolica: 0 }
    expect(validarRegistroSis(r).some((e) => e.campo === 'sistolica')).toBe(true)
  })

  it('rechaza sistolica menor que diastolica', () => {
    const r = { ...registroValido(), sistolica: 60, diastolica: 100 }
    expect(validarRegistroSis(r).some((e) => e.campo === 'sistolica')).toBe(true)
  })

  it('rechaza hiloDental=1 en un paciente menor de 6 años', () => {
    const r = {
      ...registroValido(),
      fechaNacimiento: '01/01/2024', // ~2 años en la fecha de consulta de prueba
      fechaConsulta: '01/10/2025',
      hiloDental: 1,
    }
    expect(validarRegistroSis(r).some((e) => e.campo === 'hiloDental')).toBe(true)
  })

  it('rechaza hiloDental=-1 en un paciente de 6+ años', () => {
    const r = { ...registroValido(), hiloDental: -1 } // registroValido ya es adulto
    // hiloDental=-1 es válido SOLO si es menor de 6; el registro base es adulto (1997),
    // así que -1 aquí debe fallar.
    expect(validarRegistroSis(r).some((e) => e.campo === 'hiloDental')).toBe(true)
  })

  it('acepta hiloDental=-1 en un paciente menor de 6 años', () => {
    const r = {
      ...registroValido(),
      fechaNacimiento: '01/01/2024',
      fechaConsulta: '01/10/2025',
      hiloDental: -1,
      // aseguramos que quede al menos una acción distinta de 0 para no
      // disparar el error de "salud_bucal" por otra razón
      placaBacteriana: 1,
    }
    expect(validarRegistroSis(r).some((e) => e.campo === 'hiloDental')).toBe(false)
  })

  it('rechaza un registro sin ninguna acción de salud bucal', () => {
    const r = {
      ...registroValido(),
      placaBacteriana: 0, cepillado: 0, limpiezaDental: 0, protesis: 0, tejidosBucales: 0,
      autoExamen: 0, fluor: 0, raspadoAlisadoPeriodontal: 0, barnizFluor: 0, cirugiaBucal: 0,
      farmacoTerapia: 0, orientacionSaludBucal: 0, tratamientoIntegral: 0,
      fosetasFisuras: 0, amalgamas: 0, resinas: 0, ionomeroVidrio: 0, alcasite: 0,
      obturacionTemporal: 0, dienteTemp: 0, dientePerm: 0, pulpar: 0, otrasAtenciones: 0,
      radiografias: 0, hiloDental: -1,
    }
    expect(validarRegistroSis(r).some((e) => e.campo === 'salud_bucal')).toBe(true)
  })

  it('acepta un registro con solo hiloDental=1 como única acción', () => {
    const r = {
      ...registroValido(),
      placaBacteriana: 0, cepillado: 0, limpiezaDental: 0, protesis: 0, tejidosBucales: 0,
      autoExamen: 0, fluor: 0, raspadoAlisadoPeriodontal: 0, barnizFluor: 0, cirugiaBucal: 0,
      farmacoTerapia: 0, orientacionSaludBucal: 0, tratamientoIntegral: 0,
      fosetasFisuras: 0, amalgamas: 0, resinas: 0, ionomeroVidrio: 0, alcasite: 0,
      obturacionTemporal: 0, dienteTemp: 0, dientePerm: 0, pulpar: 0, otrasAtenciones: 0,
      radiografias: 0, hiloDental: 1, // registroValido ya es adulto, así que 1 es válido
    }
    expect(validarRegistroSis(r).some((e) => e.campo === 'salud_bucal')).toBe(false)
  })

  it('rechaza codigoCIEDiagnostico2 repetido de codigoCIEDiagnostico1 (salvo R69X)', () => {
    const r = {
      ...registroValido(),
      codigoCIEDiagnostico1: 'K021',
      primeraVezDiagnostico2: 1,
      codigoCIEDiagnostico2: 'K021',
    }
    expect(validarRegistroSis(r).some((e) => e.campo === 'codigoCIEDiagnostico2')).toBe(true)
  })

  it('rechaza codigoCIEDiagnostico2 no vacío cuando primeraVezDiagnostico2 es -1', () => {
    const r = { ...registroValido(), primeraVezDiagnostico2: -1, codigoCIEDiagnostico2: 'K021' }
    expect(validarRegistroSis(r).some((e) => e.campo === 'codigoCIEDiagnostico2')).toBe(true)
  })

  it('rechaza migrante internacional con país de procedencia México', () => {
    const r = { ...registroValido(), migrante: 2, paisProcedencia: 142 }
    expect(validarRegistroSis(r).some((e) => e.campo === 'paisProcedencia')).toBe(true)
  })

  it('rechaza derechohabiencia combinando "1 – NINGUNA" con otro valor', () => {
    const r = { ...registroValido(), derechohabiencia: '1&2' }
    expect(validarRegistroSis(r).some((e) => e.campo === 'derechohabiencia')).toBe(true)
  })

  it('acepta derechohabiencia con múltiples valores no exclusivos', () => {
    const r = { ...registroValido(), derechohabiencia: '2&3' }
    expect(validarRegistroSis(r).some((e) => e.campo === 'derechohabiencia')).toBe(false)
  })

  it('rechaza teleconsulta=1 con modalidadConsulDist≠1', () => {
    const r = { ...registroValido(), teleconsulta: 1, modalidadConsulDist: -1 }
    expect(validarRegistroSis(r).some((e) => e.campo === 'modalidadConsulDist')).toBe(true)
  })

  it('rechaza peso fuera de rango (y distinto de 999)', () => {
    const r = { ...registroValido(), peso: 500 }
    expect(validarRegistroSis(r).some((e) => e.campo === 'peso')).toBe(true)
  })

  it('acepta peso=999 (desconocido) sin error', () => {
    const r = { ...registroValido(), peso: 999 }
    expect(validarRegistroSis(r).some((e) => e.campo === 'peso')).toBe(false)
  })

  it('rechaza servicioAtencion fuera del catálogo SIS-SB (solo 10/11/12/31 son válidos)', () => {
    const r = { ...registroValido(), servicioAtencion: 4 } // 4 = CONSULTA EXTERNA GENERAL, no es de Salud Bucal
    expect(validarRegistroSis(r).some((e) => e.campo === 'servicioAtencion')).toBe(true)
  })

  it('rechaza servicioAtencion=11 (Odontología Especializada) para tipoPersonal=13 (odontólogo general)', () => {
    const r = { ...registroValido(), tipoPersonal: 13, servicioAtencion: 11 }
    expect(validarRegistroSis(r).some((e) => e.campo === 'servicioAtencion')).toBe(true)
  })

  it('acepta servicioAtencion=11 para tipoPersonal=14 (especialista)', () => {
    const r = { ...registroValido(), tipoPersonal: 14, servicioAtencion: 11 }
    expect(validarRegistroSis(r).some((e) => e.campo === 'servicioAtencion')).toBe(false)
  })

  it('acepta servicioAtencion=10 (Odontología) para pasante (12), odontólogo (13) y técnico (23)', () => {
    for (const tp of [12, 13, 23]) {
      const r = { ...registroValido(), tipoPersonal: tp, servicioAtencion: 10 }
      expect(validarRegistroSis(r).some((e) => e.campo === 'servicioAtencion')).toBe(false)
    }
  })

  it('rechaza servicioAtencion=12 (Odontopediatría) en un paciente de 18 años o más', () => {
    const r = {
      ...registroValido(),
      tipoPersonal: 14,
      servicioAtencion: 12,
      fechaNacimiento: '01/01/2000', // adulto para la fecha de consulta de prueba (2025)
    }
    expect(validarRegistroSis(r).some((e) => e.campo === 'servicioAtencion' && /18 años/.test(e.mensaje))).toBe(true)
  })

  it('acepta servicioAtencion=12 (Odontopediatría) en un paciente menor de 18 años', () => {
    const r = {
      ...registroValido(),
      tipoPersonal: 14,
      servicioAtencion: 12,
      fechaNacimiento: '01/01/2015', // ~10 años para la fecha de consulta de prueba
    }
    expect(validarRegistroSis(r).some((e) => e.campo === 'servicioAtencion')).toBe(false)
  })
})
