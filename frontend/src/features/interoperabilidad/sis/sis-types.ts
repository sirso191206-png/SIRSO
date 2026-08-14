// ============================================================
// SIRO — Interoperabilidad SIS (Salud Bucal)
// Referencia: GIIS-B016-04-08, versión 4.8 (01/nov/2024)
// ------------------------------------------------------------
// Tipos y contrato estructural del registro SIS.
//
// IMPORTANTE: este módulo NO implica que SIRO esté certificado.
// Solo genera un documento con la estructura descrita en la guía
// para pruebas de carga en el ambiente de la DGIS.
//
// Este archivo es la "fuente de verdad" del ORDEN de las 77
// variables y del ENCABEZADO exacto del archivo de intercambio.
// No debe mezclarse con componentes React ni con Supabase.
// ============================================================

// ------------------------------------------------------------
// Orden canónico de las 77 variables (camelCase, como el
// diccionario de datos). El índice de cada campo ES su posición
// en el archivo TXT. No reordenar sin actualizar la prueba dorada.
// ------------------------------------------------------------
export const SIS_FIELDS = [
  // IDENTIFICACIÓN DE LA UNIDAD
  'clues', // 1
  // DATOS DEL PRESTADOR DE SERVICIOS
  'paisNacimiento', // 2
  'curpPrestador', // 3
  'nombrePrestador', // 4
  'primerApellidoPrestador', // 5
  'segundoApellidoPrestador', // 6
  'tipoPersonal', // 7
  'programaSMyMG', // 8
  // DATOS DEL PACIENTE
  'curpPaciente', // 9
  'nombre', // 10
  'primerApellido', // 11
  'segundoApellido', // 12
  'fechaNacimiento', // 13
  'paisNacPaciente', // 14
  'entidadNacimiento', // 15
  'sexoCURP', // 16
  'sexoBiologico', // 17
  'seAutodenominaAfromexicano', // 18
  'seConsideraIndigena', // 19
  'migrante', // 20
  'paisProcedencia', // 21
  'genero', // 22
  'derechohabiencia', // 23
  // CONSULTA, SOMATOMETRÍA Y OTRAS MEDICIONES
  'fechaConsulta', // 24
  'servicioAtencion', // 25
  'peso', // 26
  'talla', // 27
  'circunferenciaCintura', // 28
  'sistolica', // 29
  'diastolica', // 30
  'frecuenciaCardiaca', // 31
  'frecuenciaRespiratoria', // 32
  'temperatura', // 33
  'saturacionOxigeno', // 34
  'glucemia', // 35
  'tipoMedicion', // 36
  'primeraVezAnio', // 37
  'relacionTemporal', // 38
  'codigoCIEDiagnostico1', // 39
  'primeraVezDiagnostico2', // 40
  'codigoCIEDiagnostico2', // 41  (puede ir vacío)
  'primeraVezDiagnostico3', // 42
  'codigoCIEDiagnostico3', // 43  (puede ir vacío)
  // SALUD BUCAL
  'placaBacteriana', // 44
  'cepillado', // 45
  'hiloDental', // 46
  'limpiezaDental', // 47
  'protesis', // 48
  'tejidosBucales', // 49
  'autoExamen', // 50
  'fluor', // 51
  'raspadoAlisadoPeriodontal', // 52
  'barnizFluor', // 53
  'fosetasFisuras', // 54
  'amalgamas', // 55
  'resinas', // 56
  'ionomeroVidrio', // 57
  'alcasite', // 58
  'obturacionTemporal', // 59
  'dienteTemp', // 60
  'dientePerm', // 61
  'pulpar', // 62
  'cirugiaBucal', // 63
  'farmacoTerapia', // 64
  'otrasAtenciones', // 65
  'radiografias', // 66
  'orientacionSaludBucal', // 67
  'tratamientoIntegral', // 68
  // PROMOCIÓN DE LA SALUD
  'lineaVida', // 69
  'cartillaSalud', // 70
  'esquemaVacunacion', // 71
  // REFERENCIA Y CONTRARREFERENCIA
  'referidoPor', // 72
  'contrarreferido', // 73
  // TELEMEDICINA
  'telemedicina', // 74
  'teleconsulta', // 75
  'estudiosTeleconsulta', // 76
  'modalidadConsulDist', // 77
] as const

export type SisFieldKey = (typeof SIS_FIELDS)[number]

// ------------------------------------------------------------
// Encabezado EXACTO del archivo oficial (en MAYÚSCULAS).
//
// OJO / NO "CORREGIR": la columna 24 se llama 'FECHACONSULTA '
// CON UN ESPACIO al final. Así viene en el archivo publicado por
// la DGIS (CSB-EJEMPLOS-2410.txt). Replicarlo tal cual es lo que
// hace que nuestro archivo sea idéntico al oficial. Si alguien lo
// "arregla", la prueba dorada fallará a propósito.
// ------------------------------------------------------------
export const SIS_HEADER_TOKENS: readonly string[] = [
  'CLUES',
  'PAISNACIMIENTO',
  'CURPPRESTADOR',
  'NOMBREPRESTADOR',
  'PRIMERAPELLIDOPRESTADOR',
  'SEGUNDOAPELLIDOPRESTADOR',
  'TIPOPERSONAL',
  'PROGRAMASMYMG',
  'CURPPACIENTE',
  'NOMBRE',
  'PRIMERAPELLIDO',
  'SEGUNDOAPELLIDO',
  'FECHANACIMIENTO',
  'PAISNACPACIENTE',
  'ENTIDADNACIMIENTO',
  'SEXOCURP',
  'SEXOBIOLOGICO',
  'SEAUTODENOMINAAFROMEXICANO',
  'SECONSIDERAINDIGENA',
  'MIGRANTE',
  'PAISPROCEDENCIA',
  'GENERO',
  'DERECHOHABIENCIA',
  'FECHACONSULTA ', // <-- espacio intencional (archivo oficial)
  'SERVICIOATENCION',
  'PESO',
  'TALLA',
  'CIRCUNFERENCIACINTURA',
  'SISTOLICA',
  'DIASTOLICA',
  'FRECUENCIACARDIACA',
  'FRECUENCIARESPIRATORIA',
  'TEMPERATURA',
  'SATURACIONOXIGENO',
  'GLUCEMIA',
  'TIPOMEDICION',
  'PRIMERAVEZANIO',
  'RELACIONTEMPORAL',
  'CODIGOCIEDIAGNOSTICO1',
  'PRIMERAVEZDIAGNOSTICO2',
  'CODIGOCIEDIAGNOSTICO2',
  'PRIMERAVEZDIAGNOSTICO3',
  'CODIGOCIEDIAGNOSTICO3',
  'PLACABACTERIANA',
  'CEPILLADO',
  'HILODENTAL',
  'LIMPIEZADENTAL',
  'PROTESIS',
  'TEJIDOSBUCALES',
  'AUTOEXAMEN',
  'FLUOR',
  'RASPADOALISADOPERIODONTAL',
  'BARNIZFLUOR',
  'FOSETASFISURAS',
  'AMALGAMAS',
  'RESINAS',
  'IONOMEROVIDRIO',
  'ALCASITE',
  'OBTURACIONTEMPORAL',
  'DIENTETEMP',
  'DIENTEPERM',
  'PULPAR',
  'CIRUGIABUCAL',
  'FARMACOTERAPIA',
  'OTRASATENCIONES',
  'RADIOGRAFIAS',
  'ORIENTACIONSALUDBUCAL',
  'TRATAMIENTOINTEGRAL',
  'LINEAVIDA',
  'CARTILLASALUD',
  'ESQUEMAVACUNACION',
  'REFERIDOPOR',
  'CONTRARREFERIDO',
  'TELEMEDICINA',
  'TELECONSULTA',
  'ESTUDIOSTELECONSULTA',
  'MODALIDADCONSULDIST',
]

// ------------------------------------------------------------
// Metadatos útiles para el validador (corte D) y el mapeador.
// ------------------------------------------------------------

/** CURP genérica que la guía permite cuando no se cuenta con el dato. */
export const CURP_GENERICA = 'XXXX999999XXXXXX99'

/** País 142 = MÉXICO (catálogo PAIS). */
export const PAIS_MEXICO = 142

/**
 * Únicas dos variables que la guía permite reportar VACÍAS.
 * El resto siempre lleva valor (o su valor por defecto: 0 / -1 / 999
 * según la regla de cada variable).
 */
export const SIS_CAMPOS_NULLABLES: readonly SisFieldKey[] = [
  'codigoCIEDiagnostico2',
  'codigoCIEDiagnostico3',
]

/**
 * Variables que admiten múltiples valores separados por "&".
 * (El mapeador entrega estas ya unidas con "&", o como arreglo que
 * el exportador une.)
 */
export const SIS_CAMPOS_MULTIVALOR: readonly SisFieldKey[] = [
  'derechohabiencia',
  'estudiosTeleconsulta',
]

/**
 * Un registro SIS: exactamente las 77 llaves, cada una con un valor
 * ya normalizado a string o número. El exportador se encarga de la
 * serialización final; el FORMATO numérico (p. ej. "32.5", "999") es
 * responsabilidad del mapeador (corte B), no del exportador.
 *
 * Los campos multivalor pueden entregarse como string ya unido con
 * "&" o como arreglo de strings/números.
 */
export type SisRegistro = {
  [K in SisFieldKey]: string | number | (string | number)[]
}
