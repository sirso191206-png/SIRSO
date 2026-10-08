// ============================================================
// SIRO â€” Interoperabilidad SIS (Salud Bucal)
// Referencia: GIIS-B016-04-08, versiÃ³n 4.8 (01/nov/2024)
// ------------------------------------------------------------
// Arma un SisRegistro (las 77 variables) a partir de los datos que
// SIRO ya captura hoy, aplicando los valores "desconocido/no aplica"
// que la PROPIA GUÃA define para cada variable cuando el dato falta.
//
// Nunca inventa un valor donde la guÃ­a no ofrece una opciÃ³n oficial de
// "se ignora" / "no especificado": en esos casos marca una advertencia
// en vez de emitir un dato que parezca vÃ¡lido pero sea una suposiciÃ³n.
//
// Severidades de advertencia:
//   'oficial'    â€” SIRO no captura esto, pero la guÃ­a SÃ define un
//                   valor oficial para "desconocido" y se usÃ³ ese.
//                   Seguro de enviar tal cual.
//   'supuesto'   â€” se asumiÃ³ un valor razonable porque la guÃ­a no
//                   ofrece una opciÃ³n de "desconocido" para esta
//                   variable. Debe revisarse a mano antes de enviar,
//                   o resolverse capturando el dato real (corte C).
//   'bloqueante' â€” no hay dato ni valor oficial de reemplazo; el
//                   registro NO deberÃ­a enviarse asÃ­.
// ============================================================

import {
  PAIS_MEXICO,
  sexoDesdeCurp,
  servicioAtencionPara,
  type CatalogosSis,
  buscarEstablecimiento,
} from './sis-catalogs'
import { CURP_GENERICA, type SisRegistro } from './sis-types'

export type SeveridadAdvertencia = 'oficial' | 'supuesto' | 'bloqueante'

export interface AdvertenciaMapeo {
  campo: string
  severidad: SeveridadAdvertencia
  mensaje: string
}

// ------------------------------------------------------------
// Forma de entrada: lo que SIRO ya tiene en su esquema hoy. Los
// nombres de propiedad siguen los nombres de columna reales.
// ------------------------------------------------------------
export interface ClinicaSis {
  clave_unidad_medica: string | null
  nombre: string | null
}

export interface PrestadorSis {
  nombre: string // un solo campo en SIRO â€” no viene separado
  cedula_profesional: string | null
  // --- corte C: columnas nuevas, opcionales. Si vienen, se prefieren
  // sobre la heurÃ­stica/los defaults de abajo. ---
  curp?: string | null
  primer_apellido?: string | null
  segundo_apellido?: string | null
  tipo_personal_sis?: 'pasante_odontologia' | 'odontologo' | 'odontologo_especialista' | 'tecnico_odontologia' | null
  pais_nacimiento?: number | null
  programa_smym_g?: boolean | null
}

export interface PacienteSis {
  nombre_completo: string // un solo campo en SIRO â€” no viene separado
  curp: string | null
  sexo: 'M' | 'F' | 'X' | null // M=Masculino, F=Femenino, X=Otro (ver lib/curp.js)
  fecha_nacimiento: string | null // 'YYYY-MM-DD'
  // --- corte C: columnas nuevas, opcionales. ---
  primer_apellido?: string | null
  segundo_apellido?: string | null
  pais_nacimiento?: number | null
  entidad_nacimiento?: string | null
  sexo_biologico?: 'M' | 'F' | 'X' | null
  genero?:
    | 'no_especificado' | 'masculino' | 'femenino' | 'transgenero'
    | 'transexual' | 'travesti' | 'intersexual' | 'otro' | null
  se_autodenomina_afromexicano?: 'si' | 'no' | 'no_responde' | 'no_sabe' | null
  se_considera_indigena?: 'si' | 'no' | 'no_responde' | 'no_sabe' | null
  migrante?: 'no' | 'nacional' | 'internacional' | 'retornado' | null
  pais_procedencia?: number | null
  derechohabiencia?: string[] | null
}

export interface CitaSis {
  inicio: string // timestamptz ISO
  motivo_consulta: string | null
}

/** Las 25 variables de la secciÃ³n SALUD BUCAL (44-68), ver lib/saludBucal.js. */
export interface AccionSaludBucal {
  placaBacteriana?: boolean
  cepillado?: boolean
  hiloDental?: boolean
  limpiezaDental?: boolean
  protesis?: boolean
  tejidosBucales?: boolean
  autoExamen?: boolean
  fluor?: boolean
  raspadoAlisadoPeriodontal?: boolean
  barnizFluor?: boolean
  cirugiaBucal?: boolean
  farmacoTerapia?: boolean
  orientacionSaludBucal?: boolean
  tratamientoIntegral?: boolean
  fosetasFisuras?: number
  amalgamas?: number
  resinas?: number
  ionomeroVidrio?: number
  alcasite?: number
  obturacionTemporal?: number
  dienteTemp?: number
  dientePerm?: number
  pulpar?: number
  otrasAtenciones?: number
  radiografias?: number
}

export interface NotaClinicaSis {
  diagnostico_cie10_codigo: string | null // catÃ¡logo propio K00-K14, NO es DIAGNOSTICO_SIS
  hallazgos: string | null
  accion_salud_bucal?: AccionSaludBucal | null
}

export interface SignosVitalesSis {
  presion_arterial: string | null // texto combinado, ej. "120/80" (compatibilidad histÃ³rica)
  peso: number | null
  estatura: number | null
  temperatura: number | null
  frecuencia_cardiaca: number | null
  frecuencia_respiratoria: number | null // ya existÃ­a en SIRO antes del corte C
  saturacion_oxigeno: number | null // ya existÃ­a en SIRO antes del corte C
  glucosa_capilar: number | null // ya existÃ­a en SIRO antes del corte C (mismo concepto que glucemia SIS)
  // --- corte C: columnas nuevas, opcionales. Se prefieren sobre el
  // parseo de presion_arterial y sobre los defaults en "0". ---
  presion_sistolica?: number | null
  presion_diastolica?: number | null
  circunferencia_cintura?: number | null
  glucemia_en_ayunas?: boolean | null
}

export interface EntradaMapeoSis {
  clinica: ClinicaSis
  prestador: PrestadorSis
  paciente: PacienteSis
  cita: CitaSis
  notaClinica?: NotaClinicaSis | null
  signosVitales?: SignosVitalesSis | null
  /** true si esta es la primera consulta del paciente en el aÃ±o, en esta unidad. */
  primeraVezEnAnio: boolean
  catalogos?: CatalogosSis
}

export interface ResultadoMapeoSis {
  registro: SisRegistro
  advertencias: AdvertenciaMapeo[]
}

// ------------------------------------------------------------
// Utilidades de formato exigidas por la guÃ­a.
// ------------------------------------------------------------

/** dd/mm/aaaa, como exige la guÃ­a para fechas. */
function formatoFecha(iso: string): string {
  const fecha = iso.slice(0, 10)
  const [yyyy, mm, dd] = fecha.split('-')
  return `${dd}/${mm}/${yyyy}`
}

/**
 * La guÃ­a exige nombres/apellidos en MAYÃšSCULAS, sin acentos (solo
 * A-Z, Ã‘, dÃ­gitos y los especiales permitidos â€” "no se acepta ningÃºn
 * otro tipo de caracter especial, ni acentos"). Los datos reales de
 * SIRO vienen en mayÃºsculas/minÃºsculas mixtas y con acentos (nombres
 * mexicanos comunes: "MarÃ­a", "PÃ©rez"), asÃ­ que hay que normalizar
 * antes de emitir. Se protege la Ã‘ explÃ­citamente: Unicode NFD
 * descompone "Ã‘" en "N" + tilde combinante, y si no se protegiera,
 * quitar acentos tambiÃ©n borrarÃ­a la Ã‘ (que SÃ es una letra vÃ¡lida
 * para la guÃ­a, no un acento que deba quitarse).
 */
function normalizarTextoSis(texto: string): string {
  return texto
    .toUpperCase()
    .replace(/\u00D1/g, '\u0001')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0001/g, '\u00D1')
}

/**
 * Separa un nombre completo en (nombre, primerApellido, segundoApellido).
 * HEURÃSTICO: SIRO guarda el nombre en un solo campo. Esta separaciÃ³n
 * es una aproximaciÃ³n (asume "Ãºltimas 1-2 palabras = apellidos") y
 * SIEMPRE debe reportarse como advertencia 'supuesto' â€” nombres
 * compuestos o apellidos con partÃ­cula (DE LA CRUZ, DEL VALLE) pueden
 * separarse mal. La soluciÃ³n real es capturar los campos por separado
 * (corte C), no perfeccionar esta heurÃ­stica.
 */
function separarNombre(nombreCompleto: string): {
  nombre: string
  primerApellido: string
  segundoApellido: string
} {
  const partes = nombreCompleto.trim().split(/\s+/)
  if (partes.length <= 1) {
    return { nombre: partes[0] ?? '', primerApellido: 'XX', segundoApellido: 'XX' }
  }
  if (partes.length === 2) {
    return { nombre: partes[0], primerApellido: partes[1], segundoApellido: 'XX' }
  }
  const segundoApellido = partes[partes.length - 1]
  const primerApellido = partes[partes.length - 2]
  const nombre = partes.slice(0, -2).join(' ')
  return { nombre, primerApellido, segundoApellido }
}

/**
 * Cuando ya se conocen los apellidos reales (columnas nuevas del corte
 * C), `nombre_completo` sigue siendo el nombre completo â€” se usa en
 * toda la app para mostrar/buscar, no se redefine. AquÃ­ se le quitan
 * los apellidos conocidos del final para obtener solo el nombre de
 * pila (variable "nombre"/"nombrePrestador" de la guÃ­a).
 */
function extraerNombrePila(nombreCompleto: string, primerApellido: string, segundoApellido: string): string {
  let resultado = nombreCompleto.trim()
  for (const apellido of [segundoApellido, primerApellido]) {
    if (!apellido || apellido === 'XX') continue
    const regex = new RegExp(`\\s+${apellido}\\s*$`, 'i')
    resultado = resultado.replace(regex, '')
  }
  return resultado.trim() || nombreCompleto
}

function normalizarNombreSep(sep: { nombre: string; primerApellido: string; segundoApellido: string }) {
  return {
    nombre: normalizarTextoSis(sep.nombre),
    primerApellido: normalizarTextoSis(sep.primerApellido),
    segundoApellido: normalizarTextoSis(sep.segundoApellido),
  }
}

/** Intenta separar "120/80" en {sistolica: 120, diastolica: 80}. */
function separarPresionArterial(texto: string | null): { sistolica: number; diastolica: number } | null {
  if (!texto) return null
  const m = texto.match(/(\d{2,3})\s*\/\s*(\d{2,3})/)
  if (!m) return null
  return { sistolica: Number(m[1]), diastolica: Number(m[2]) }
}

// ------------------------------------------------------------
// Mapeador principal.
// ------------------------------------------------------------
export function mapearRegistroSis(entrada: EntradaMapeoSis): ResultadoMapeoSis {
  const advertencias: AdvertenciaMapeo[] = []
  const advertir = (campo: string, severidad: SeveridadAdvertencia, mensaje: string) => {
    advertencias.push({ campo, severidad, mensaje })
  }

  const { clinica, prestador, paciente, cita, notaClinica, signosVitales, catalogos } = entrada

  // ---------- IDENTIFICACIÃ“N DE LA UNIDAD ----------
  const clues = clinica.clave_unidad_medica ?? ''
  if (!clues) {
    advertir('clues', 'bloqueante', 'La clÃ­nica no tiene CLUES capturada (ConfiguraciÃ³n de la clÃ­nica).')
  }
  const establecimiento = catalogos ? buscarEstablecimiento(catalogos, clues) : undefined

  // ---------- DATOS DEL PRESTADOR ----------
  let paisNacimiento = PAIS_MEXICO
  if (prestador.pais_nacimiento != null) {
    paisNacimiento = prestador.pais_nacimiento
  } else {
    advertir('paisNacimiento', 'supuesto', 'SIRO no captura el paÃ­s de nacimiento del prestador; se asumiÃ³ MÃ©xico (142).')
  }

  let curpPrestador = ''
  if (prestador.curp) {
    curpPrestador = prestador.curp
  } else {
    advertir('curpPrestador', 'supuesto', 'SIRO no captura la CURP del prestador. La guÃ­a no admite CURP genÃ©rica para el prestador.')
  }

  let nombrePrestadorSep: { nombre: string; primerApellido: string; segundoApellido: string }
  if (prestador.primer_apellido) {
    const primerApellido = prestador.primer_apellido
    const segundoApellido = prestador.segundo_apellido || 'XX'
    nombrePrestadorSep = {
      nombre: extraerNombrePila(prestador.nombre, primerApellido, segundoApellido),
      primerApellido,
      segundoApellido,
    }
  } else {
    nombrePrestadorSep = separarNombre(prestador.nombre)
    advertir('nombrePrestador/apellidos', 'supuesto', 'Nombre del prestador separado por heurÃ­stica (SIRO lo guarda en un solo campo).')
  }
  nombrePrestadorSep = normalizarNombreSep(nombrePrestadorSep)

  const MAPA_TIPO_PERSONAL: Record<string, number> = {
    pasante_odontologia: 12,
    odontologo: 13,
    odontologo_especialista: 14,
    tecnico_odontologia: 23,
  }
  let tipoPersonal = 13
  if (prestador.tipo_personal_sis) {
    tipoPersonal = MAPA_TIPO_PERSONAL[prestador.tipo_personal_sis] ?? 13
  } else {
    advertir('tipoPersonal', 'supuesto', 'SIRO no distingue el tipo de personal odontolÃ³gico; se asumiÃ³ 13 (OdontÃ³loga/o).')
  }

  const esSsaOImb = establecimiento?.institucion === 'SSA' || establecimiento?.institucion === 'IMB'
  let programaSMyMG = esSsaOImb ? 0 : 0
  if (prestador.programa_smym_g != null) {
    programaSMyMG = prestador.programa_smym_g ? 1 : 0
  } else if (!establecimiento) {
    advertir('programaSMyMG', 'oficial', 'Sin catÃ¡logo de establecimientos cargado; se usÃ³ el default "0 â€“ NO" de la guÃ­a.')
  }

  // ---------- DATOS DEL PACIENTE ----------
  const curpPacienteEsGenerica = !paciente.curp
  const curpPaciente = paciente.curp || CURP_GENERICA
  if (curpPacienteEsGenerica) {
    advertir('curpPaciente', 'oficial', 'Paciente sin CURP capturada; se usÃ³ la CURP genÃ©rica que la guÃ­a permite (mÃ¡x. 15% del lote).')
  }

  let nombrePacienteSep: { nombre: string; primerApellido: string; segundoApellido: string }
  if (paciente.primer_apellido) {
    const primerApellido = paciente.primer_apellido
    const segundoApellido = paciente.segundo_apellido || 'XX'
    nombrePacienteSep = {
      nombre: extraerNombrePila(paciente.nombre_completo, primerApellido, segundoApellido),
      primerApellido,
      segundoApellido,
    }
  } else {
    nombrePacienteSep = separarNombre(paciente.nombre_completo)
    advertir('nombre/apellidos', 'supuesto', 'Nombre del paciente separado por heurÃ­stica (SIRO lo guarda en un solo campo).')
  }
  nombrePacienteSep = normalizarNombreSep(nombrePacienteSep)

  let fechaNacimiento: string
  if (paciente.fecha_nacimiento) {
    fechaNacimiento = formatoFecha(paciente.fecha_nacimiento)
  } else {
    advertir('fechaNacimiento', 'bloqueante', 'Paciente sin fecha de nacimiento capturada.')
    fechaNacimiento = ''
  }

  let paisNacPaciente = PAIS_MEXICO
  if (paciente.pais_nacimiento != null) {
    paisNacPaciente = paciente.pais_nacimiento
  } else {
    advertir('paisNacPaciente', 'supuesto', 'SIRO no pregunta el paÃ­s de nacimiento del paciente; se asumiÃ³ MÃ©xico (142).')
  }

  let entidadNacimiento = '99'
  if (paciente.entidad_nacimiento) {
    entidadNacimiento = paciente.entidad_nacimiento
  } else {
    advertir('entidadNacimiento', 'oficial', 'SIRO no captura la entidad de nacimiento; se usÃ³ "99 â€“ SE IGNORA".')
  }

  let sexoCURP: number | null = null
  if (!curpPacienteEsGenerica) {
    sexoCURP = sexoDesdeCurp(paciente.curp as string)
  }
  if (sexoCURP === null && paciente.sexo) {
    sexoCURP = paciente.sexo === 'M' ? 1 : paciente.sexo === 'F' ? 2 : 3
    advertir('sexoCURP', 'supuesto', 'Derivado de pacientes.sexo (SIRO), no de la CURP â€” la guÃ­a trata sexoCURP como el sexo legal registrado en RENAPO.')
  }
  if (sexoCURP === null) {
    advertir('sexoCURP', 'bloqueante', 'Sin CURP ni sexo capturado: no hay valor que registrar (la guÃ­a no admite "se ignora" aquÃ­).')
  }

  let sexoBiologico: number | null = null
  if (paciente.sexo_biologico) {
    sexoBiologico = paciente.sexo_biologico === 'M' ? 1 : paciente.sexo_biologico === 'F' ? 2 : 3
  } else if (paciente.sexo) {
    sexoBiologico = paciente.sexo === 'M' ? 1 : paciente.sexo === 'F' ? 2 : 3
    advertir('sexoBiologico', 'supuesto', 'SIRO no distingue sexo biolÃ³gico de sexo legal/identidad; se reutilizÃ³ pacientes.sexo.')
  } else {
    advertir('sexoBiologico', 'bloqueante', 'Paciente sin sexo capturado.')
  }

  const MAPA_GENERO: Record<string, number> = {
    no_especificado: 0, masculino: 1, femenino: 2, transgenero: 3,
    transexual: 4, travesti: 5, intersexual: 6, otro: 88,
  }
  let genero = 0
  if (paciente.genero) {
    genero = MAPA_GENERO[paciente.genero] ?? 0
  } else {
    advertir('genero', 'oficial', 'SIRO no pregunta identidad de gÃ©nero; se usÃ³ "0 â€“ NO ESPECIFICADO".')
  }

  const MAPA_SI_NO: Record<string, number> = { si: 1, no: 0, no_responde: 2, no_sabe: 3 }
  let seAutodenominaAfromexicano = -1
  if (paciente.se_autodenomina_afromexicano) {
    seAutodenominaAfromexicano = MAPA_SI_NO[paciente.se_autodenomina_afromexicano] ?? -1
  } else {
    advertir('seAutodenominaAfromexicano', 'oficial', 'SIRO no pregunta esto; se usÃ³ "-1 â€“ se desconoce".')
  }

  let seConsideraIndigena = -1
  if (paciente.se_considera_indigena) {
    seConsideraIndigena = MAPA_SI_NO[paciente.se_considera_indigena] ?? -1
  } else {
    advertir('seConsideraIndigena', 'oficial', 'SIRO no pregunta esto; se usÃ³ "-1 â€“ se desconoce".')
  }

  const MAPA_MIGRANTE: Record<string, number> = { no: 0, nacional: 1, internacional: 2, retornado: 3 }
  let migrante = -1
  let paisProcedencia = -1
  if (paciente.migrante) {
    migrante = MAPA_MIGRANTE[paciente.migrante] ?? -1
    if (paciente.migrante === 'internacional') {
      paisProcedencia = paciente.pais_procedencia ?? -1
      if (paciente.pais_procedencia == null) {
        advertir('paisProcedencia', 'supuesto', 'Paciente migrante internacional sin paÃ­s de procedencia capturado.')
      }
    } else if (paciente.migrante === 'nacional' || paciente.migrante === 'retornado') {
      paisProcedencia = PAIS_MEXICO
    }
  } else {
    advertir('migrante', 'oficial', 'SIRO no pregunta esto; se usÃ³ "-1 â€“ se desconoce".')
  }

  const MAPA_AFILIACION: Record<string, number> = {
    ninguna: 1, imss: 2, issste: 3, pemex: 4, sedena: 5, semar: 6,
    otra: 8, imss_bienestar: 10, issfam: 11, opd_imss_bienestar: 14,
  }
  let derechohabiencia = '0'
  if (paciente.derechohabiencia && paciente.derechohabiencia.length > 0) {
    const codigos = paciente.derechohabiencia
      .map((d) => MAPA_AFILIACION[d])
      .filter((v): v is number => v != null)
    derechohabiencia = codigos.length > 0 ? codigos.join('&') : '0'
  } else {
    advertir('derechohabiencia', 'oficial', 'SIRO no captura afiliaciÃ³n a instituciones de salud; se usÃ³ "0 â€“ NO ESPECIFICADO".')
  }

  // ---------- CONSULTA, SOMATOMETRÃA ----------
  const fechaConsulta = formatoFecha(cita.inicio)

  const servicioAtencionResuelto = servicioAtencionPara(tipoPersonal)
  let servicioAtencion = 0
  if (servicioAtencionResuelto !== null) {
    servicioAtencion = servicioAtencionResuelto
    if (servicioAtencionResuelto === 11) {
      advertir(
        'servicioAtencion',
        'supuesto',
        'El prestador es especialista (14): se asumiÃ³ "11 â€“ ODONTOLOGÃA ESPECIALIZADA", pero tambiÃ©n podrÃ­a ser "12 â€“ ODONTOPEDIATRÃA" o "31 â€“ CIRUGÃA MAXILOFACIAL" segÃºn el caso clÃ­nico real â€” revisar antes de enviar.',
      )
    }
  } else {
    advertir('servicioAtencion', 'bloqueante', `tipoPersonal (${tipoPersonal}) no tiene un servicioAtencion vÃ¡lido en el catÃ¡logo SIS-SB.`)
  }

  const peso = signosVitales?.peso != null ? signosVitales.peso : 999
  if (signosVitales?.peso == null) advertir('peso', 'oficial', 'Sin peso capturado; se usÃ³ "999" (valor oficial de la guÃ­a).')

  const talla = signosVitales?.estatura != null ? signosVitales.estatura : 999
  if (signosVitales?.estatura == null) advertir('talla', 'oficial', 'Sin talla capturada; se usÃ³ "999" (valor oficial de la guÃ­a).')

  advertir('circunferenciaCintura', 'oficial', 'SIRO no captura esto; se usÃ³ "0" (valor oficial de la guÃ­a).')
  let circunferenciaCintura = 0
  if (signosVitales?.circunferencia_cintura != null) {
    circunferenciaCintura = signosVitales.circunferencia_cintura
  }

  let sistolica: number
  let diastolica: number
  if (signosVitales?.presion_sistolica != null && signosVitales?.presion_diastolica != null) {
    sistolica = signosVitales.presion_sistolica
    diastolica = signosVitales.presion_diastolica
  } else {
    const presion = separarPresionArterial(signosVitales?.presion_arterial ?? null)
    sistolica = presion?.sistolica ?? 0
    diastolica = presion?.diastolica ?? 0
    if (!presion) advertir('sistolica/diastolica', 'oficial', 'Sin presiÃ³n arterial separable; se usÃ³ "0" (valor oficial cuando se desconoce).')
  }

  const frecuenciaCardiaca = signosVitales?.frecuencia_cardiaca ?? 0
  if (signosVitales?.frecuencia_cardiaca == null) advertir('frecuenciaCardiaca', 'oficial', 'Sin dato; se usÃ³ "0" (valor oficial).')

  const frecuenciaRespiratoria = signosVitales?.frecuencia_respiratoria ?? 0
  if (signosVitales?.frecuencia_respiratoria == null) advertir('frecuenciaRespiratoria', 'oficial', 'Sin dato; se usÃ³ "0" (valor oficial).')

  const temperatura = signosVitales?.temperatura ?? 0
  if (signosVitales?.temperatura == null) advertir('temperatura', 'oficial', 'Sin dato; se usÃ³ "0" (valor oficial).')

  const saturacionOxigeno = signosVitales?.saturacion_oxigeno ?? 0
  if (signosVitales?.saturacion_oxigeno == null) advertir('saturacionOxigeno', 'oficial', 'Sin dato; se usÃ³ "0" (valor oficial).')

  // glucemia SIS = glucosa_capilar de SIRO (mismo concepto, ya se capturaba
  // desde antes del corte C con este otro nombre de columna).
  let glucemia = 0
  let tipoMedicion = -1
  if (signosVitales?.glucosa_capilar != null) {
    glucemia = signosVitales.glucosa_capilar
    // La guÃ­a exige 0 o 1 (nunca -1) en cuanto glucemiaâ‰ 0 â€” no hay
    // opciÃ³n de "se desconoce" una vez que hay un valor de glucosa.
    if (signosVitales.glucemia_en_ayunas != null) {
      tipoMedicion = signosVitales.glucemia_en_ayunas ? 1 : 0
    } else {
      tipoMedicion = 0
      advertir('tipoMedicion', 'supuesto', 'Hay glucosa capturada pero no se sabe si fue en ayunas; se asumiÃ³ "0 â€“ NO" (la guÃ­a no admite "-1" una vez que glucemiaâ‰ 0).')
    }
  } else {
    advertir('glucemia', 'oficial', 'Sin dato; se usÃ³ "0" (valor oficial).')
  }

  const primeraVezAnio = entrada.primeraVezEnAnio ? 1 : 0
  const relacionTemporal = entrada.primeraVezEnAnio ? 0 : 1

  let codigoCIEDiagnostico1 = 'R69X'
  if (notaClinica?.diagnostico_cie10_codigo) {
    codigoCIEDiagnostico1 = notaClinica.diagnostico_cie10_codigo
    advertir('codigoCIEDiagnostico1', 'supuesto', 'Viene del catÃ¡logo CIE-10 propio de SIRO (K00-K14), no del catÃ¡logo DIAGNOSTICO_SIS oficial â€” verificar antes de enviar.')
  } else {
    advertir('codigoCIEDiagnostico1', 'oficial', 'Sin diagnÃ³stico capturado; se usÃ³ "R69X" (tope 5% del lote segÃºn la guÃ­a).')
  }

  const primeraVezDiagnostico2 = -1
  const codigoCIEDiagnostico2 = ''
  const primeraVezDiagnostico3 = -1
  const codigoCIEDiagnostico3 = ''

  // ---------- SALUD BUCAL (44-68) ----------
  const accion = notaClinica?.accion_salud_bucal ?? null

  let edadPaciente: number | null = null
  if (paciente.fecha_nacimiento) {
    const nacimiento = new Date(paciente.fecha_nacimiento)
    const hoy = new Date(cita.inicio)
    edadPaciente = hoy.getFullYear() - nacimiento.getFullYear()
  }

  // hiloDental es un caso especial: la guÃ­a exige "-1" si el paciente
  // es menor de 6 aÃ±os o se desconoce su edad, sin importar lo
  // capturado. Se aplica esa regla ANTES de leer el checkbox.
  let hiloDental: number
  if (edadPaciente === null || edadPaciente < 6) {
    hiloDental = -1
  } else {
    hiloDental = accion?.hiloDental ? 1 : 0
  }

  const bool = (v: boolean | undefined) => (v ? 1 : 0)
  const num = (v: number | undefined) => v ?? 0

  const camposSaludBucal = {
    placaBacteriana: bool(accion?.placaBacteriana),
    cepillado: bool(accion?.cepillado),
    hiloDental,
    limpiezaDental: bool(accion?.limpiezaDental),
    protesis: bool(accion?.protesis),
    tejidosBucales: bool(accion?.tejidosBucales),
    autoExamen: bool(accion?.autoExamen),
    fluor: bool(accion?.fluor),
    raspadoAlisadoPeriodontal: bool(accion?.raspadoAlisadoPeriodontal),
    barnizFluor: bool(accion?.barnizFluor),
    fosetasFisuras: num(accion?.fosetasFisuras),
    amalgamas: num(accion?.amalgamas),
    resinas: num(accion?.resinas),
    ionomeroVidrio: num(accion?.ionomeroVidrio),
    alcasite: num(accion?.alcasite),
    obturacionTemporal: num(accion?.obturacionTemporal),
    dienteTemp: num(accion?.dienteTemp),
    dientePerm: num(accion?.dientePerm),
    pulpar: num(accion?.pulpar),
    cirugiaBucal: bool(accion?.cirugiaBucal),
    farmacoTerapia: bool(accion?.farmacoTerapia),
    otrasAtenciones: num(accion?.otrasAtenciones),
    radiografias: num(accion?.radiografias),
    orientacionSaludBucal: bool(accion?.orientacionSaludBucal),
    tratamientoIntegral: bool(accion?.tratamientoIntegral),
  }

  // La guÃ­a exige que AL MENOS una acciÃ³n sea distinta de "0" (y,
  // para hiloDental, distinta tambiÃ©n de "-1"). Si no hay ninguna
  // capturada, el registro sigue sin poder enviarse.
  const hayAlgunaAccion =
    Object.entries(camposSaludBucal).some(([clave, valor]) => {
      if (clave === 'hiloDental') return valor !== 0 && valor !== -1
      return valor !== 0
    })
  if (!hayAlgunaAccion) {
    advertir(
      'salud_bucal',
      'bloqueante',
      'Esta consulta no tiene ninguna acciÃ³n de salud bucal registrada. ' +
        'La guÃ­a exige que al menos una tenga valor distinto de "0" antes de enviar el registro.',
    )
  }

  // ---------- PROMOCIÃ“N DE LA SALUD ----------
  advertir('lineaVida', 'oficial', 'SIRO no captura esto; se usÃ³ "0" (valor oficial).')
  advertir('cartillaSalud', 'oficial', 'SIRO no captura esto; se usÃ³ "0" (valor oficial).')
  advertir('esquemaVacunacion', 'oficial', 'SIRO no captura esto; se usÃ³ "0" (valor oficial).')
  const lineaVida = 0
  const cartillaSalud = 0
  const esquemaVacunacion = 0

  // ---------- REFERENCIA Y CONTRARREFERENCIA ----------
  const referidoPor = -1
  const contrarreferido = 0

  // ---------- TELEMEDICINA ----------
  const telemedicina = 0
  const teleconsulta = 0
  const estudiosTeleconsulta = -1
  const modalidadConsulDist = -1

  const registro: SisRegistro = {
    clues,
    paisNacimiento,
    curpPrestador,
    nombrePrestador: nombrePrestadorSep.nombre,
    primerApellidoPrestador: nombrePrestadorSep.primerApellido,
    segundoApellidoPrestador: nombrePrestadorSep.segundoApellido,
    tipoPersonal,
    programaSMyMG,
    curpPaciente,
    nombre: nombrePacienteSep.nombre,
    primerApellido: nombrePacienteSep.primerApellido,
    segundoApellido: nombrePacienteSep.segundoApellido,
    fechaNacimiento,
    paisNacPaciente,
    entidadNacimiento,
    sexoCURP: sexoCURP ?? '',
    sexoBiologico: sexoBiologico ?? '',
    seAutodenominaAfromexicano,
    seConsideraIndigena,
    migrante,
    paisProcedencia,
    genero,
    derechohabiencia,
    fechaConsulta,
    servicioAtencion,
    peso,
    talla,
    circunferenciaCintura,
    sistolica,
    diastolica,
    frecuenciaCardiaca,
    frecuenciaRespiratoria,
    temperatura,
    saturacionOxigeno,
    glucemia,
    tipoMedicion,
    primeraVezAnio,
    relacionTemporal,
    codigoCIEDiagnostico1,
    primeraVezDiagnostico2,
    codigoCIEDiagnostico2,
    primeraVezDiagnostico3,
    codigoCIEDiagnostico3,
    placaBacteriana: camposSaludBucal.placaBacteriana,
    cepillado: camposSaludBucal.cepillado,
    hiloDental: camposSaludBucal.hiloDental,
    limpiezaDental: camposSaludBucal.limpiezaDental,
    protesis: camposSaludBucal.protesis,
    tejidosBucales: camposSaludBucal.tejidosBucales,
    autoExamen: camposSaludBucal.autoExamen,
    fluor: camposSaludBucal.fluor,
    raspadoAlisadoPeriodontal: camposSaludBucal.raspadoAlisadoPeriodontal,
    barnizFluor: camposSaludBucal.barnizFluor,
    fosetasFisuras: camposSaludBucal.fosetasFisuras,
    amalgamas: camposSaludBucal.amalgamas,
    resinas: camposSaludBucal.resinas,
    ionomeroVidrio: camposSaludBucal.ionomeroVidrio,
    alcasite: camposSaludBucal.alcasite,
    obturacionTemporal: camposSaludBucal.obturacionTemporal,
    dienteTemp: camposSaludBucal.dienteTemp,
    dientePerm: camposSaludBucal.dientePerm,
    pulpar: camposSaludBucal.pulpar,
    cirugiaBucal: camposSaludBucal.cirugiaBucal,
    farmacoTerapia: camposSaludBucal.farmacoTerapia,
    otrasAtenciones: camposSaludBucal.otrasAtenciones,
    radiografias: camposSaludBucal.radiografias,
    orientacionSaludBucal: camposSaludBucal.orientacionSaludBucal,
    tratamientoIntegral: camposSaludBucal.tratamientoIntegral,
    lineaVida,
    cartillaSalud,
    esquemaVacunacion,
    referidoPor,
    contrarreferido,
    telemedicina,
    teleconsulta,
    estudiosTeleconsulta,
    modalidadConsulDist,
  }

  return { registro, advertencias }
}



