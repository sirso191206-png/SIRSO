// ============================================================
// SIRO — Interoperabilidad SIS (Salud Bucal)
// Referencia: GIIS-B016-04-08, versión 4.8 (01/nov/2024)
// ------------------------------------------------------------
// Valida un SisRegistro contra las reglas del diccionario de datos.
// No corrige nada ni aplica defaults (eso es trabajo de sis-mapper):
// solo dice si un registro YA ARMADO cumple o no las reglas de la
// guía, con un mensaje legible por variable.
//
// Cobertura: reglas de formato, rango y catálogo cerrado de cada
// variable, más las dependencias explícitas entre variables que la
// guía describe (ej. "si sistolica≠0, diastolica debe estar entre
// 20 y 200"). No valida contra los catálogos externos grandes
// (DIAGNOSTICO_SIS, ENTIDAD FEDERATIVA, PAIS, ESTABLECIMIENTO DE
// SALUD SIS) porque SIRO todavía no los tiene cargados — ver
// sis-catalogs.ts. Cuando se carguen, esas validaciones se pueden
// añadir sin tocar la forma de este módulo.
// ============================================================

import type { SisFieldKey, SisRegistro } from './sis-types'
import type { CatalogosSis } from './sis-catalogs'
import { servicioAtencionEsValidoParaTipoPersonal } from './sis-catalogs'

export interface ErrorValidacion {
  campo: SisFieldKey | 'salud_bucal' // salud_bucal es una regla que cruza 25 campos a la vez
  mensaje: string
}

// ------------------------------------------------------------
// Utilidades de lectura y checks reutilizables.
// ------------------------------------------------------------
function valorTexto(v: SisRegistro[SisFieldKey]): string {
  if (Array.isArray(v)) return v.map(String).join('&')
  return v === null || v === undefined ? '' : String(v)
}

function valorNumero(v: SisRegistro[SisFieldKey]): number {
  return Number(valorTexto(v))
}

const REGEX_FECHA = /^(\d{2})\/(\d{2})\/(\d{4})$/

function fechaValida(texto: string): boolean {
  const m = texto.match(REGEX_FECHA)
  if (!m) return false
  const [, dd, mm, yyyy] = m
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
  return d.getFullYear() === Number(yyyy) && d.getMonth() === Number(mm) - 1 && d.getDate() === Number(dd)
}

function aFecha(texto: string): Date | null {
  if (!fechaValida(texto)) return null
  const [, dd, mm, yyyy] = texto.match(REGEX_FECHA) as RegExpMatchArray
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd))
}

/**
 * A–Z (incluye Ñ), dígitos, espacios y los especiales permitidos
 * (- , . / ' ¨). El ESPACIO no cuenta como carácter especial (así lo
 * dice la guía explícitamente) — por eso "J. FRANCISCO" (punto seguido
 * de espacio) es válido: no son dos especiales consecutivos, el punto
 * está seguido de un espacio, no de otro especial.
 */
const REGEX_CARACTERES_PERMITIDOS = /^[A-ZÑ0-9 \-.,/'¨]+$/
const REGEX_DOBLE_ESPACIO = /  /
const REGEX_DOS_ESPECIALES_SEGUIDOS = /[-.,/'¨]{2}/

function nombreValido(texto: string, longitudMinima = 2): boolean {
  if (!texto) return false
  const t = texto.trim()
  if (t.length < longitudMinima || t.length > 50) return false
  if (t !== texto) return false // espacios al inicio/final no permitidos
  if (REGEX_DOBLE_ESPACIO.test(t)) return false
  if (!REGEX_CARACTERES_PERMITIDOS.test(t)) return false
  if (REGEX_DOS_ESPECIALES_SEGUIDOS.test(t)) return false
  return true
}

const REGEX_CURP = /^[A-Z]{4}\d{6}[HMX][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z]\d$/
const CURP_GENERICA = 'XXXX999999XXXXXX99'

function curpValida(curp: string): boolean {
  return curp === CURP_GENERICA || REGEX_CURP.test(curp)
}

// ------------------------------------------------------------
// Validador principal.
// ------------------------------------------------------------
export function validarRegistroSis(registro: SisRegistro, catalogos?: CatalogosSis): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []
  const err = (campo: ErrorValidacion['campo'], mensaje: string) => errores.push({ campo, mensaje })

  // ---------- 1. clues ----------
  const clues = valorTexto(registro.clues)
  if (clues.length !== 11) err('clues', 'La CLUES debe tener 11 caracteres.')

  // ---------- DATOS DEL PRESTADOR ----------
  const curpPrestador = valorTexto(registro.curpPrestador)
  const curpPrestadorEsGenerica = curpPrestador === CURP_GENERICA
  if (!curpValida(curpPrestador)) {
    err('curpPrestador', 'La CURP del prestador no tiene una estructura válida.')
  }

  const nombrePrestador = valorTexto(registro.nombrePrestador)
  if (!curpPrestadorEsGenerica && !nombreValido(nombrePrestador)) {
    err('nombrePrestador', 'El nombre del prestador debe tener entre 2 y 50 caracteres, solo A-Z/Ñ y los especiales permitidos (- , . / \' ¨), sin repetirlos.')
  }

  const primerApellidoPrestador = valorTexto(registro.primerApellidoPrestador)
  if (!curpPrestadorEsGenerica && !nombreValido(primerApellidoPrestador)) {
    err('primerApellidoPrestador', 'El primer apellido del prestador debe tener entre 2 y 50 caracteres y estructura válida.')
  }

  const segundoApellidoPrestador = valorTexto(registro.segundoApellidoPrestador)
  if (segundoApellidoPrestador !== 'XX' && !nombreValido(segundoApellidoPrestador)) {
    err('segundoApellidoPrestador', 'El segundo apellido del prestador debe ser "XX" (si no aplica) o tener estructura válida.')
  }

  const tipoPersonal = valorNumero(registro.tipoPersonal)
  if (![12, 13, 14, 23].includes(tipoPersonal)) {
    err('tipoPersonal', 'tipoPersonal debe ser 12 (pasante), 13 (odontólogo/a), 14 (especialista) o 23 (técnico/a).')
  }

  const programaSMyMG = valorNumero(registro.programaSMyMG)
  if (![0, 1].includes(programaSMyMG)) {
    err('programaSMyMG', 'programaSMyMG debe ser 0 (NO) o 1 (SI).')
  }

  // ---------- DATOS DEL PACIENTE ----------
  const curpPaciente = valorTexto(registro.curpPaciente)
  const curpPacienteEsGenerica = curpPaciente === CURP_GENERICA
  if (!curpValida(curpPaciente)) {
    err('curpPaciente', 'La CURP del paciente no tiene una estructura válida.')
  }
  if (!curpPacienteEsGenerica && curpPaciente === curpPrestador) {
    err('curpPaciente', 'La CURP del paciente no puede ser igual a la del prestador.')
  }

  const nombre = valorTexto(registro.nombre)
  if (!curpPacienteEsGenerica && !nombreValido(nombre)) {
    err('nombre', 'El nombre del paciente debe tener entre 2 y 50 caracteres y estructura válida.')
  }

  const primerApellido = valorTexto(registro.primerApellido)
  if (primerApellido !== 'XX' && !curpPacienteEsGenerica && !nombreValido(primerApellido)) {
    err('primerApellido', 'El primer apellido del paciente debe ser "XX" (si no aplica) o tener estructura válida.')
  }

  const segundoApellido = valorTexto(registro.segundoApellido)
  if (segundoApellido !== 'XX' && !nombreValido(segundoApellido)) {
    err('segundoApellido', 'El segundo apellido del paciente debe ser "XX" (si no aplica) o tener estructura válida.')
  }

  const fechaNacimientoTxt = valorTexto(registro.fechaNacimiento)
  const fechaNacimiento = aFecha(fechaNacimientoTxt)
  if (!fechaNacimiento) {
    err('fechaNacimiento', 'La fecha de nacimiento debe tener formato dd/mm/aaaa y ser una fecha real.')
  }

  const fechaConsultaTxt = valorTexto(registro.fechaConsulta)
  const fechaConsulta = aFecha(fechaConsultaTxt)
  if (!fechaConsulta) {
    err('fechaConsulta', 'La fecha de consulta debe tener formato dd/mm/aaaa y ser una fecha real.')
  }

  if (fechaNacimiento && fechaConsulta) {
    if (fechaNacimiento > fechaConsulta) {
      err('fechaNacimiento', 'La fecha de nacimiento no puede ser posterior a la fecha de consulta.')
    }
    const edadMs = fechaConsulta.getTime() - fechaNacimiento.getTime()
    const edadAnios = edadMs / (1000 * 60 * 60 * 24 * 365.25)
    if (edadAnios > 120) {
      err('fechaNacimiento', 'La edad calculada supera los 120 años permitidos.')
    }
  }
  if (fechaConsulta && fechaConsulta.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    err('fechaConsulta', 'La fecha de consulta no puede ser posterior a hoy.')
  }

  const edadPaciente =
    fechaNacimiento && fechaConsulta
      ? (fechaConsulta.getTime() - fechaNacimiento.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
      : null

  // ---------- servicioAtencion (variable 25) ----------
  const servicioAtencion = valorNumero(registro.servicioAtencion)
  if (![10, 11, 12, 31].includes(servicioAtencion)) {
    err('servicioAtencion', 'servicioAtencion debe ser 10, 11, 12 o 31 (catálogo SIS-SB).')
  } else if (!servicioAtencionEsValidoParaTipoPersonal(servicioAtencion, tipoPersonal)) {
    err('servicioAtencion', `servicioAtencion ${servicioAtencion} no es válido para tipoPersonal ${tipoPersonal} (catálogo SIS-SB).`)
  }
  if (servicioAtencion === 12 && edadPaciente !== null && edadPaciente >= 18) {
    err('servicioAtencion', 'servicioAtencion 12 (ODONTOPEDIATRÍA) requiere que el paciente sea menor de 18 años.')
  }

  const sexoCURP = valorNumero(registro.sexoCURP)
  if (![1, 2, 3].includes(sexoCURP)) {
    err('sexoCURP', 'sexoCURP debe ser 1 (Hombre), 2 (Mujer) o 3 (No binario).')
  }

  const sexoBiologico = valorNumero(registro.sexoBiologico)
  if (![1, 2, 3].includes(sexoBiologico)) {
    err('sexoBiologico', 'sexoBiologico debe ser 1 (Hombre), 2 (Mujer) o 3 (Intersexual).')
  }

  const seAutodenominaAfromexicano = valorNumero(registro.seAutodenominaAfromexicano)
  if (![-1, 0, 1, 2, 3].includes(seAutodenominaAfromexicano)) {
    err('seAutodenominaAfromexicano', 'Debe ser -1, 0, 1, 2 o 3.')
  }

  const seConsideraIndigena = valorNumero(registro.seConsideraIndigena)
  if (![-1, 0, 1, 2, 3].includes(seConsideraIndigena)) {
    err('seConsideraIndigena', 'Debe ser -1, 0, 1, 2 o 3.')
  }

  const migrante = valorNumero(registro.migrante)
  if (![-1, 0, 1, 2, 3].includes(migrante)) {
    err('migrante', 'migrante debe ser -1, 0 (NO), 1 (NACIONAL), 2 (INTERNACIONAL) o 3 (RETORNADO).')
  }

  const paisProcedencia = valorNumero(registro.paisProcedencia)
  if (migrante === 2 && paisProcedencia === 142) {
    err('paisProcedencia', 'Si migrante es INTERNACIONAL, el país de procedencia no puede ser México (142).')
  }
  if ((migrante === 1 || migrante === 3) && paisProcedencia !== 142) {
    err('paisProcedencia', 'Si migrante es NACIONAL o RETORNADO, el país de procedencia debe ser México (142).')
  }
  if ((migrante === 0 || migrante === -1) && paisProcedencia !== -1) {
    err('paisProcedencia', 'Si migrante es NO o se desconoce, el país de procedencia debe ser -1.')
  }

  const genero = valorNumero(registro.genero)
  if (![0, 1, 2, 3, 4, 5, 6, 88].includes(genero)) {
    err('genero', 'genero debe ser uno de: 0,1,2,3,4,5,6,88.')
  }

  const derechohabiencia = valorTexto(registro.derechohabiencia)
  const derechohabienciaValores = derechohabiencia.split('&').filter(Boolean).map(Number)
  const AFILIACION_VALIDA = [0, 1, 2, 3, 4, 5, 6, 8, 10, 11, 14, 99]
  if (derechohabienciaValores.length === 0 || derechohabienciaValores.some((v) => !AFILIACION_VALIDA.includes(v))) {
    err('derechohabiencia', 'derechohabiencia solo admite los valores del catálogo AFILIACION, separados por "&".')
  }
  const exclusivos = derechohabienciaValores.filter((v) => [0, 1, 99].includes(v))
  if (exclusivos.length > 0 && derechohabienciaValores.length > 1) {
    err('derechohabiencia', 'Los valores 0, 1 y 99 no pueden combinarse con otros valores.')
  }
  if (new Set(derechohabienciaValores).size !== derechohabienciaValores.length) {
    err('derechohabiencia', 'No se debe repetir el mismo valor de derechohabiencia.')
  }

  // ---------- CONSULTA, SOMATOMETRÍA ----------
  const peso = valorNumero(registro.peso)
  if (peso !== 999 && (peso < 1 || peso > 400)) {
    err('peso', 'peso debe estar entre 1 y 400 kg, o ser 999 si se desconoce.')
  }

  const talla = valorNumero(registro.talla)
  if (talla !== 999 && (talla < 30 || talla > 220)) {
    err('talla', 'talla debe estar entre 30 y 220 cm, o ser 999 si se desconoce.')
  }

  const circunferenciaCintura = valorNumero(registro.circunferenciaCintura)
  if (circunferenciaCintura !== 0 && (circunferenciaCintura < 20 || circunferenciaCintura > 300)) {
    err('circunferenciaCintura', 'circunferenciaCintura debe estar entre 20 y 300 cm, o ser 0 si se desconoce.')
  }

  const sistolica = valorNumero(registro.sistolica)
  const diastolica = valorNumero(registro.diastolica)
  if (diastolica === 0 && sistolica !== 0) {
    err('sistolica', 'Si diastolica es 0, sistolica también debe ser 0.')
  }
  if (sistolica !== 0 && (sistolica < 50 || sistolica > 300)) {
    err('sistolica', 'sistolica debe estar entre 50 y 300 mmHg (o 0 si se desconoce).')
  }
  if (diastolica !== 0 && (diastolica < 20 || diastolica > 200)) {
    err('diastolica', 'diastolica debe estar entre 20 y 200 mmHg (o 0 si se desconoce).')
  }
  if (sistolica !== 0 && diastolica !== 0 && sistolica < diastolica) {
    err('sistolica', 'sistolica no puede ser menor que diastolica.')
  }

  const frecuenciaCardiaca = valorNumero(registro.frecuenciaCardiaca)
  if (frecuenciaCardiaca !== 0 && (frecuenciaCardiaca < 40 || frecuenciaCardiaca > 220)) {
    err('frecuenciaCardiaca', 'frecuenciaCardiaca debe estar entre 40 y 220 lpm, o ser 0 si se desconoce.')
  }

  const frecuenciaRespiratoria = valorNumero(registro.frecuenciaRespiratoria)
  if (frecuenciaRespiratoria !== 0 && (frecuenciaRespiratoria < 10 || frecuenciaRespiratoria > 99)) {
    err('frecuenciaRespiratoria', 'frecuenciaRespiratoria debe estar entre 10 y 99 rpm, o ser 0 si se desconoce.')
  }

  const temperatura = valorNumero(registro.temperatura)
  if (temperatura !== 0 && (temperatura < 30 || temperatura > 44)) {
    err('temperatura', 'temperatura debe estar entre 30 y 44 °C, o ser 0 si se desconoce.')
  }

  const saturacionOxigeno = valorNumero(registro.saturacionOxigeno)
  if (saturacionOxigeno !== 0 && (saturacionOxigeno < 1 || saturacionOxigeno > 100)) {
    err('saturacionOxigeno', 'saturacionOxigeno debe estar entre 1 y 100%, o ser 0 si se desconoce.')
  }

  const glucemia = valorNumero(registro.glucemia)
  if (glucemia !== 0 && (glucemia < 20 || glucemia > 999)) {
    err('glucemia', 'glucemia debe estar entre 20 y 999, o ser 0 si se desconoce.')
  }

  const tipoMedicion = valorNumero(registro.tipoMedicion)
  if (glucemia !== 0 && ![0, 1].includes(tipoMedicion)) {
    err('tipoMedicion', 'Si glucemia ≠ 0, tipoMedicion debe ser 0 o 1.')
  }
  if (glucemia === 0 && tipoMedicion !== -1) {
    err('tipoMedicion', 'Si glucemia es 0 (o se desconoce), tipoMedicion debe ser -1.')
  }

  const primeraVezAnio = valorNumero(registro.primeraVezAnio)
  if (![0, 1].includes(primeraVezAnio)) {
    err('primeraVezAnio', 'primeraVezAnio debe ser 0 (NO) o 1 (SI).')
  }

  const relacionTemporal = valorNumero(registro.relacionTemporal)
  if (![0, 1].includes(relacionTemporal)) {
    err('relacionTemporal', 'relacionTemporal debe ser 0 (primera vez) o 1 (subsecuente).')
  }

  const codigoCIEDiagnostico1 = valorTexto(registro.codigoCIEDiagnostico1)
  if (codigoCIEDiagnostico1.length !== 4) {
    err('codigoCIEDiagnostico1', 'codigoCIEDiagnostico1 debe tener 4 caracteres.')
  }

  const primeraVezDiagnostico2 = valorNumero(registro.primeraVezDiagnostico2)
  const codigoCIEDiagnostico2 = valorTexto(registro.codigoCIEDiagnostico2)
  if (![-1, 0, 1].includes(primeraVezDiagnostico2)) {
    err('primeraVezDiagnostico2', 'primeraVezDiagnostico2 debe ser -1, 0 o 1.')
  }
  if (primeraVezDiagnostico2 === -1 && codigoCIEDiagnostico2 !== '') {
    err('codigoCIEDiagnostico2', 'Si primeraVezDiagnostico2 es -1, codigoCIEDiagnostico2 debe ir vacío.')
  }
  if (primeraVezDiagnostico2 !== -1) {
    if (codigoCIEDiagnostico2.length !== 4) {
      err('codigoCIEDiagnostico2', 'codigoCIEDiagnostico2 debe tener 4 caracteres cuando aplica.')
    }
    if (codigoCIEDiagnostico2 === codigoCIEDiagnostico1 && codigoCIEDiagnostico2 !== 'R69X') {
      err('codigoCIEDiagnostico2', 'codigoCIEDiagnostico2 no puede repetir codigoCIEDiagnostico1 (salvo "R69X").')
    }
  }

  const primeraVezDiagnostico3 = valorNumero(registro.primeraVezDiagnostico3)
  const codigoCIEDiagnostico3 = valorTexto(registro.codigoCIEDiagnostico3)
  if (![-1, 0, 1].includes(primeraVezDiagnostico3)) {
    err('primeraVezDiagnostico3', 'primeraVezDiagnostico3 debe ser -1, 0 o 1.')
  }
  if (primeraVezDiagnostico3 === -1 && codigoCIEDiagnostico3 !== '') {
    err('codigoCIEDiagnostico3', 'Si primeraVezDiagnostico3 es -1, codigoCIEDiagnostico3 debe ir vacío.')
  }
  if (primeraVezDiagnostico3 !== -1) {
    if (codigoCIEDiagnostico3.length !== 4) {
      err('codigoCIEDiagnostico3', 'codigoCIEDiagnostico3 debe tener 4 caracteres cuando aplica.')
    }
    if (
      codigoCIEDiagnostico3 !== 'R69X' &&
      (codigoCIEDiagnostico3 === codigoCIEDiagnostico1 || codigoCIEDiagnostico3 === codigoCIEDiagnostico2)
    ) {
      err('codigoCIEDiagnostico3', 'codigoCIEDiagnostico3 no puede repetir los anteriores (salvo "R69X").')
    }
  }

  // ---------- Validación real contra DIAGNOSTICO_SIS (si el catálogo está cargado) ----------
  // Regla de la guía: "Se debe validar que se cumplan las restricciones por
  // sexo y edad... de acuerdo a las columnas LSEX, LINF y LSUP. Si el valor
  // de sexoBiologico es INTERSEXUAL, únicamente se debe validar por edad."
  if (catalogos?.diagnosticos) {
    const validarContraCatalogo = (campo: SisFieldKey, codigo: string) => {
      if (!codigo) return
      const entrada = catalogos.diagnosticos!.get(codigo.toUpperCase())
      if (!entrada) {
        err(campo, `El código "${codigo}" no se encontró en el catálogo DIAGNOSTICO_SIS cargado.`)
        return
      }
      if (entrada.sexo !== null && sexoBiologico !== 3) {
        if (entrada.sexo !== sexoBiologico) {
          const esperado = entrada.sexo === 1 ? 'HOMBRE' : 'MUJER'
          err(campo, `"${codigo}" (${entrada.descripcion}) está restringido a ${esperado} según el catálogo.`)
        }
      }
      if (edadPaciente !== null) {
        if (entrada.edadMin !== null && edadPaciente < entrada.edadMin) {
          err(campo, `"${codigo}" (${entrada.descripcion}) requiere una edad mínima de ${entrada.edadMin} años.`)
        }
        if (entrada.edadMax !== null && edadPaciente > entrada.edadMax) {
          err(campo, `"${codigo}" (${entrada.descripcion}) requiere una edad máxima de ${entrada.edadMax} años.`)
        }
      }
    }
    validarContraCatalogo('codigoCIEDiagnostico1', codigoCIEDiagnostico1)
    if (primeraVezDiagnostico2 !== -1) validarContraCatalogo('codigoCIEDiagnostico2', codigoCIEDiagnostico2)
    if (primeraVezDiagnostico3 !== -1) validarContraCatalogo('codigoCIEDiagnostico3', codigoCIEDiagnostico3)
  }

  // ---------- SALUD BUCAL (44-68) ----------
  const CAMPOS_BOOLEANOS_SALUD_BUCAL: SisFieldKey[] = [
    'placaBacteriana', 'cepillado', 'limpiezaDental', 'protesis', 'tejidosBucales',
    'autoExamen', 'fluor', 'raspadoAlisadoPeriodontal', 'barnizFluor',
    'cirugiaBucal', 'farmacoTerapia', 'orientacionSaludBucal', 'tratamientoIntegral',
  ]
  for (const campo of CAMPOS_BOOLEANOS_SALUD_BUCAL) {
    const v = valorNumero(registro[campo])
    if (![0, 1].includes(v)) err(campo, `${campo} debe ser 0 (NO) o 1 (SI).`)
  }

  const CAMPOS_NUMERICOS_SALUD_BUCAL: SisFieldKey[] = [
    'fosetasFisuras', 'amalgamas', 'resinas', 'ionomeroVidrio', 'alcasite',
    'obturacionTemporal',
  ]
  for (const campo of CAMPOS_NUMERICOS_SALUD_BUCAL) {
    const v = valorNumero(registro[campo])
    if (v !== 0 && (v < 1 || v > 32)) err(campo, `${campo} debe estar entre 1 y 32, o ser 0 si no aplica.`)
  }
  const CAMPOS_NUMERICOS_1_9: SisFieldKey[] = [
    'dienteTemp', 'dientePerm', 'pulpar', 'otrasAtenciones', 'radiografias',
  ]
  for (const campo of CAMPOS_NUMERICOS_1_9) {
    const v = valorNumero(registro[campo])
    if (v !== 0 && (v < 1 || v > 9)) err(campo, `${campo} debe estar entre 1 y 9, o ser 0 si no aplica.`)
  }

  const hiloDental = valorNumero(registro.hiloDental)
  if (edadPaciente !== null && edadPaciente >= 6) {
    if (![0, 1].includes(hiloDental)) err('hiloDental', 'Para pacientes de 6 años o más, hiloDental debe ser 0 o 1.')
  } else if (hiloDental !== -1) {
    err('hiloDental', 'Para pacientes menores de 6 años (o edad desconocida), hiloDental debe ser -1.')
  }

  // Regla de conjunto: al menos una acción de salud bucal distinta de
  // "0", y para hiloDental específicamente, distinto tanto de "0" como
  // de "-1" (es decir, debe ser exactamente 1 para contar).
  const algunaAccionBooleana = CAMPOS_BOOLEANOS_SALUD_BUCAL.some((c) => valorNumero(registro[c]) !== 0)
  const algunaAccionNumerica = [...CAMPOS_NUMERICOS_SALUD_BUCAL, ...CAMPOS_NUMERICOS_1_9].some((c) => valorNumero(registro[c]) !== 0)
  const hiloDentalCuenta = hiloDental !== 0 && hiloDental !== -1
  if (!algunaAccionBooleana && !algunaAccionNumerica && !hiloDentalCuenta) {
    err('salud_bucal', 'Al menos una acción de salud bucal debe tener valor distinto de "0" (hiloDental debe ser exactamente 1 para contar).')
  }

  // ---------- PROMOCIÓN DE LA SALUD ----------
  for (const campo of ['lineaVida', 'cartillaSalud', 'esquemaVacunacion'] as SisFieldKey[]) {
    const v = valorNumero(registro[campo])
    if (![0, 1].includes(v)) err(campo, `${campo} debe ser 0 (NO) o 1 (SI).`)
  }

  // ---------- REFERENCIA Y CONTRARREFERENCIA ----------
  const contrarreferido = valorNumero(registro.contrarreferido)
  const referidoPor = valorNumero(registro.referidoPor)
  if (contrarreferido === 0) {
    if (![-1, 5].includes(referidoPor)) err('referidoPor', 'referidoPor debe ser -1 o 5 cuando contrarreferido es NO.')
  } else if (referidoPor !== -1) {
    err('referidoPor', 'Si contrarreferido es SI, referidoPor debe ser -1.')
  }
  if (referidoPor === -1) {
    if (![0, 1].includes(contrarreferido)) err('contrarreferido', 'contrarreferido debe ser 0 o 1.')
  } else if (contrarreferido !== 0) {
    err('contrarreferido', 'Si referidoPor tiene valor, contrarreferido debe ser 0.')
  }

  // ---------- TELEMEDICINA ----------
  const teleconsulta = valorNumero(registro.teleconsulta)
  const telemedicina = valorNumero(registro.telemedicina)
  if (teleconsulta === 0) {
    if (![0, 1].includes(telemedicina)) err('telemedicina', 'telemedicina debe ser 0 o 1 cuando teleconsulta es NO.')
  } else if (telemedicina !== 0) {
    err('telemedicina', 'Si teleconsulta es SI, telemedicina debe ser 0.')
  }
  if (![0, 1].includes(teleconsulta)) err('teleconsulta', 'teleconsulta debe ser 0 o 1.')

  const estudiosTeleconsulta = valorTexto(registro.estudiosTeleconsulta)
  const modalidadConsulDist = valorNumero(registro.modalidadConsulDist)
  if (teleconsulta === 1) {
    if (modalidadConsulDist !== 1) err('modalidadConsulDist', 'Si teleconsulta es SI, modalidadConsulDist debe ser 1 (EN TIEMPO REAL).')
  } else if (teleconsulta === 0 && estudiosTeleconsulta !== '' && estudiosTeleconsulta !== '-1') {
    if (modalidadConsulDist !== 2) err('modalidadConsulDist', 'Si hay estudios a distancia sin teleconsulta en tiempo real, modalidadConsulDist debe ser 2 (DIFERIDA).')
  } else if (modalidadConsulDist !== -1) {
    err('modalidadConsulDist', 'modalidadConsulDist debe ser -1 cuando no aplica.')
  }

  if (teleconsulta === 0 && estudiosTeleconsulta !== '-1' && estudiosTeleconsulta !== '') {
    const ESTUDIO_VALIDO = [1, 2, 3, 4, 5, 6, 7]
    const valores = estudiosTeleconsulta.split('&').filter(Boolean).map(Number)
    if (valores.length === 0 || valores.length > 7 || valores.some((v) => !ESTUDIO_VALIDO.includes(v))) {
      err('estudiosTeleconsulta', 'estudiosTeleconsulta solo admite valores 1-7, separados por "&" (máx. 7).')
    }
    if (new Set(valores).size !== valores.length) {
      err('estudiosTeleconsulta', 'No se debe repetir el mismo valor de estudiosTeleconsulta.')
    }
  }

  return errores
}
