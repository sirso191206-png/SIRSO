import { describe, it, expect } from 'vitest'
import { mapearRegistroSis, type EntradaMapeoSis } from '../sis-mapper'
import { construirTxt, construirTxtBytes } from '../sis-exporter'
import { validarRegistroSis } from '../sis-validator'
import { CURP_GENERICA } from '../sis-types'

function entradaBase(): EntradaMapeoSis {
  return {
    clinica: { clave_unidad_medica: 'MCIMB000123', nombre: 'ClÃ­nica Dr. Gonzalo' },
    prestador: { nombre: 'Gonzalo Pérez López', cedula_profesional: '1234567', curp: 'PELG800315HMCRPN04' },
    paciente: {
      nombre_completo: 'María Fernanda García López',
      curp: 'GALM900101MMCRPR05',
      sexo: 'F',
      fecha_nacimiento: '1990-01-01',
    },
    cita: { inicio: '2026-08-16T10:00:00.000Z', motivo_consulta: 'Dolor' },
    notaClinica: { diagnostico_cie10_codigo: 'K021', hallazgos: 'Caries' },
    signosVitales: {
      presion_arterial: '120/80',
      peso: 65,
      estatura: 165,
      temperatura: 36.5,
      frecuencia_cardiaca: 72,
      frecuencia_respiratoria: 18,
      saturacion_oxigeno: 98,
      glucosa_capilar: 90,
    },
    primeraVezEnAnio: false,
  }
}

describe('mapearRegistroSis â€” resoluciÃ³n de servicioAtencion (catÃ¡logo real SIS-SB)', () => {
  it('resuelve servicioAtencion=10 (ODONTOLOGÃA) por default (tipoPersonal=13, sin advertencia extra)', () => {
    const { registro, advertencias } = mapearRegistroSis(entradaBase())
    expect(registro.servicioAtencion).toBe(10)
    expect(advertencias.some((a) => a.campo === 'servicioAtencion')).toBe(false)
  })

  it('resuelve servicioAtencion=11 (ODONTOLOGÃA ESPECIALIZADA) para un especialista, con advertencia de revisiÃ³n', () => {
    const entrada = entradaBase()
    entrada.prestador.tipo_personal_sis = 'odontologo_especialista'
    const { registro, advertencias } = mapearRegistroSis(entrada)
    expect(registro.servicioAtencion).toBe(11)
    const adv = advertencias.find((a) => a.campo === 'servicioAtencion')
    expect(adv?.severidad).toBe('supuesto')
  })

  it('resuelve servicioAtencion=10 para un pasante y para un tÃ©cnico, sin advertencia extra', () => {
    for (const tipo of ['pasante_odontologia', 'tecnico_odontologia'] as const) {
      const entrada = entradaBase()
      entrada.prestador.tipo_personal_sis = tipo
      const { registro, advertencias } = mapearRegistroSis(entrada)
      expect(registro.servicioAtencion).toBe(10)
      expect(advertencias.some((a) => a.campo === 'servicioAtencion')).toBe(false)
    }
  })
})

describe('mapearRegistroSis â€” con datos completos', () => {
  const { registro, advertencias } = mapearRegistroSis(entradaBase())

  it('usa la CLUES real de la clÃ­nica', () => {
    expect(registro.clues).toBe('MCIMB000123')
  })

  it('usa la CURP real del paciente, no la genÃ©rica', () => {
    expect(registro.curpPaciente).toBe('GALM900101MMCRPR05')
    expect(registro.curpPaciente).not.toBe(CURP_GENERICA)
  })

  it('deriva sexoCURP de la CURP real (posiciÃ³n 11 = M â†’ 2)', () => {
    expect(registro.sexoCURP).toBe(2)
  })

  it('separa la presiÃ³n arterial en sistÃ³lica/diastÃ³lica', () => {
    expect(registro.sistolica).toBe(120)
    expect(registro.diastolica).toBe(80)
  })

  it('usa peso/talla/temperatura/frecuencia reales', () => {
    expect(registro.peso).toBe(65)
    expect(registro.talla).toBe(165)
    expect(registro.temperatura).toBe(36.5)
    expect(registro.frecuenciaCardiaca).toBe(72)
  })

  it('formatea la fecha de nacimiento como dd/mm/aaaa', () => {
    expect(registro.fechaNacimiento).toBe('01/01/1990')
  })

  it('marca el diagnÃ³stico como "supuesto" (catÃ¡logo propio, no DIAGNOSTICO_SIS)', () => {
    const adv = advertencias.find((a) => a.campo === 'codigoCIEDiagnostico1')
    expect(adv?.severidad).toBe('supuesto')
    expect(registro.codigoCIEDiagnostico1).toBe('K021')
  })

  it('siempre advierte sobre salud bucal como bloqueante (SIRO no la captura)', () => {
    const adv = advertencias.find((a) => a.campo === 'salud_bucal')
    expect(adv?.severidad).toBe('bloqueante')
  })
})

describe('mapearRegistroSis â€” con datos mÃ­nimos (paciente sin CURP ni signos vitales)', () => {
  const entrada = entradaBase()
  entrada.paciente.curp = null
  entrada.signosVitales = null

  const { registro, advertencias } = mapearRegistroSis(entrada)

  it('usa la CURP genÃ©rica oficial cuando no hay CURP', () => {
    expect(registro.curpPaciente).toBe(CURP_GENERICA)
    const adv = advertencias.find((a) => a.campo === 'curpPaciente')
    expect(adv?.severidad).toBe('oficial')
  })

  it('deriva sexoCURP de pacientes.sexo cuando no hay CURP (marcado supuesto)', () => {
    expect(registro.sexoCURP).toBe(2) // sexo: 'F' â†’ 2
    const adv = advertencias.find((a) => a.campo === 'sexoCURP')
    expect(adv?.severidad).toBe('supuesto')
  })

  it('usa 999 (oficial) para peso/talla sin signos vitales', () => {
    expect(registro.peso).toBe(999)
    expect(registro.talla).toBe(999)
  })

  it('usa 0 (oficial) para presiÃ³n/temperatura/frecuencia sin signos vitales', () => {
    expect(registro.sistolica).toBe(0)
    expect(registro.diastolica).toBe(0)
    expect(registro.temperatura).toBe(0)
    expect(registro.frecuenciaCardiaca).toBe(0)
  })

  it('usa R69X (oficial) cuando no hay diagnÃ³stico', () => {
    const entradaSinDx = entradaBase()
    entradaSinDx.notaClinica = null
    const r = mapearRegistroSis(entradaSinDx)
    expect(r.registro.codigoCIEDiagnostico1).toBe('R69X')
    const adv = r.advertencias.find((a) => a.campo === 'codigoCIEDiagnostico1')
    expect(adv?.severidad).toBe('oficial')
  })
})

describe('mapearRegistroSis â€” casos bloqueantes', () => {
  it('marca bloqueante si falta la CLUES de la clÃ­nica', () => {
    const entrada = entradaBase()
    entrada.clinica.clave_unidad_medica = null
    const { advertencias } = mapearRegistroSis(entrada)
    const adv = advertencias.find((a) => a.campo === 'clues')
    expect(adv?.severidad).toBe('bloqueante')
  })

  it('marca bloqueante si falta fecha de nacimiento', () => {
    const entrada = entradaBase()
    entrada.paciente.fecha_nacimiento = null
    const { advertencias } = mapearRegistroSis(entrada)
    const adv = advertencias.find((a) => a.campo === 'fechaNacimiento')
    expect(adv?.severidad).toBe('bloqueante')
  })

  it('marca bloqueante si no hay CURP ni sexo capturado', () => {
    const entrada = entradaBase()
    entrada.paciente.curp = null
    entrada.paciente.sexo = null
    const { advertencias } = mapearRegistroSis(entrada)
    const adv = advertencias.find((a) => a.campo === 'sexoCURP')
    expect(adv?.severidad).toBe('bloqueante')
  })
})

describe('mapearRegistroSis â€” separaciÃ³n heurÃ­stica de nombres', () => {
  it('separa "Nombre Apellido1 Apellido2" correctamente', () => {
    const { registro } = mapearRegistroSis(entradaBase())
    // "María Fernanda García López" â€” normalizado a MAYÃšSCULAS sin acentos (regla de la guÃ­a)
    expect(registro.nombre).toBe('MARIA FERNANDA')
    expect(registro.primerApellido).toBe('GARCIA')
    expect(registro.segundoApellido).toBe('LOPEZ')
  })

  it('usa "XX" de segundo apellido cuando solo hay dos palabras', () => {
    const entrada = entradaBase()
    entrada.paciente.nombre_completo = 'Juan Pérez'
    const { registro } = mapearRegistroSis(entrada)
    expect(registro.nombre).toBe('JUAN')
    expect(registro.primerApellido).toBe('PEREZ')
    expect(registro.segundoApellido).toBe('XX')
  })

  it('normaliza a MAYÃšSCULAS sin acentos, pero preserva la Ã‘ (no es un acento, es una letra)', () => {
    const entrada = entradaBase()
    entrada.paciente.nombre_completo = 'Íñigo Muñoz Núñez'
    const { registro } = mapearRegistroSis(entrada)
    expect(registro.nombre).toBe('IÑIGO')
    expect(registro.primerApellido).toBe('MUÑOZ')
    expect(registro.segundoApellido).toBe('NUÑEZ')
  })
})

describe('integraciÃ³n con sis-exporter (corte A)', () => {
  it('el registro mapeado se serializa sin errores', () => {
    const { registro } = mapearRegistroSis(entradaBase())
    const txt = construirTxt([registro])
    const [, lineaRegistro] = txt.split('\r\n')
    expect(lineaRegistro.split('|')).toHaveLength(77)
  })

  it('el registro mapeado se codifica en Windows-1252 sin errores (nombres con acentos/Ã‘)', () => {
    const entrada = entradaBase()
    entrada.paciente.nombre_completo = 'Íñigo Muñoz Núñez'
    const { registro } = mapearRegistroSis(entrada)
    expect(() => construirTxtBytes([registro])).not.toThrow()
  })
})

describe('integraciÃ³n con sis-validator (corte D)', () => {
  it('un registro mapeado CON acciÃ³n de salud bucal capturada pasa la validaciÃ³n', () => {
    const entrada = entradaBase()
    entrada.notaClinica!.accion_salud_bucal = { limpiezaDental: true }
    const { registro } = mapearRegistroSis(entrada)
    const errores = validarRegistroSis(registro)
    expect(errores).toEqual([])
  })

  it('un registro mapeado SIN acciÃ³n de salud bucal falla la validaciÃ³n (esperado: corte C pendiente)', () => {
    const { registro } = mapearRegistroSis(entradaBase())
    const errores = validarRegistroSis(registro)
    expect(errores.some((e) => e.campo === 'salud_bucal')).toBe(true)
  })
})




