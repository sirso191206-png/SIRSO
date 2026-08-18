// ============================================================
// SIRO — Interoperabilidad SIS (Salud Bucal)
// Referencia: GIIS-B016-04-08, versión 4.8 (01/nov/2024)
// ------------------------------------------------------------
// Catálogos oficiales de la DGIS.
//
// PAIS y ENTIDAD_FEDERATIVA: datos REALES de los catálogos maestros
// oficiales (gobi.salud.gob.mx/gobi/catalogos/catalogosmaestros/),
// embebidos completos porque son pequeños (225 y 35 filas). Fuente:
//   PAIS_2021_Rev_20241101.xlsx (actualización: noviembre 2024)
//   ENTIDAD_FEDERATIVA_201602.xlsx (actualización: febrero 2016,
//   revisión junio 2021)
//
// DIAGNOSTICO_SIS: el catálogo oficial de diagnósticos (9,076 códigos
// vigentes, filtrados de DIAGNOSTICOS_20240416.zip por VALID='SI' y
// DIA_SIS='SI') es demasiado grande para incrustar en el código
// (~940 KB) — se carga de forma diferida desde un JSON aparte
// (./data/diagnosticos-sis.json), ver cargarCatalogoDiagnosticos().
// IMPORTANTE: este catálogo trae las columnas LSEX/LINF/LSUP (sexo y
// edad permitidos) que si describe la guía, pero NO trae la columna
// VALIDO_SB (qué código es válido para cada tipoPersonal) — esa
// relación sigue sin conseguirse; ver README.
//
// ESTABLECIMIENTO DE SALUD (CLUES): el catálogo nacional completo
// tiene 64,006 filas (~10 MB incluso recortado a las columnas
// mínimas) — demasiado grande para el frontend. La arquitectura
// correcta es una tabla en Supabase (el mapper solo necesita
// consultar UNA fila, la CLUES de la propia clínica, no las 64,006),
// ver migración 032 y cargarEstablecimientoPorClues() más abajo.
// ============================================================

/** País de nacimiento — México, usado como referencia constante en el mapper. */
export const PAIS_MEXICO = 142

export const PAIS: readonly { readonly clave: number; readonly nombre: string }[] = [
  { clave: 1, nombre: 'REPÚBLICA DEL ECUADOR' },
  { clave: 2, nombre: 'REPÚBLICA ÁRABE DE EGIPTO' },
  { clave: 3, nombre: 'ARUBA' },
  { clave: 4, nombre: 'REPÚBLICA ISLÁMICA DE AFGANISTÁN' },
  { clave: 5, nombre: 'REPÚBLICA DE ANGOLA' },
  { clave: 6, nombre: 'ANGUILA*' },
  { clave: 7, nombre: 'REPÚBLICA DE ALBANIA' },
  { clave: 8, nombre: 'PRINCIPADO DE ANDORRA' },
  { clave: 10, nombre: 'EMIRATOS ÁRABES UNIDOS' },
  { clave: 11, nombre: 'REPÚBLICA ARGENTINA' },
  { clave: 12, nombre: 'REPÚBLICA DE ARMENIA' },
  { clave: 13, nombre: 'SAMOA AMERICANA*' },
  { clave: 16, nombre: 'ANTIGUA Y BARBUDA' },
  { clave: 17, nombre: 'MANCOMUNIDAD DE AUSTRALIA' },
  { clave: 18, nombre: 'REPÚBLICA DE AUSTRIA' },
  { clave: 19, nombre: 'REPÚBLICA DE AZERBAIYÁN' },
  { clave: 20, nombre: 'REPÚBLICA DE BURUNDI' },
  { clave: 21, nombre: 'REINO DE BÉLGICA' },
  { clave: 22, nombre: 'REPÚBLICA DE BENÍN' },
  { clave: 23, nombre: 'BURKINA FASO' },
  { clave: 24, nombre: 'REPÚBLICA POPULAR DE BANGLADESH' },
  { clave: 25, nombre: 'REPÚBLICA DE BULGARIA' },
  { clave: 26, nombre: 'REINO DE BAHRÉIN' },
  { clave: 27, nombre: 'MANCOMUNIDAD DE LAS BAHAMAS' },
  { clave: 28, nombre: 'BOSNIA Y HERZEGOVINA' },
  { clave: 29, nombre: 'REPÚBLICA DE BIELORRUSIA' },
  { clave: 30, nombre: 'BELICE' },
  { clave: 31, nombre: 'BERMUDAS*' },
  { clave: 32, nombre: 'ESTADO PLURINACIONAL DE BOLIVIA' },
  { clave: 33, nombre: 'REPÚBLICA FEDERATIVA DE BRASIL' },
  { clave: 34, nombre: 'BARBADOS' },
  { clave: 35, nombre: 'SULTANATO DE BRUNÉI' },
  { clave: 36, nombre: 'REINO DE BUTÁN' },
  { clave: 39, nombre: 'REPÚBLICA DE BOTSUANA' },
  { clave: 40, nombre: 'REPÚBLICA CENTROAFRICANA' },
  { clave: 41, nombre: 'CANADÁ' },
  { clave: 43, nombre: 'REPÚBLICA DE COSTA DE MARFIL' },
  { clave: 44, nombre: 'REPÚBLICA DE CAMERÚN' },
  { clave: 45, nombre: 'REPÚBLICA DEL CONGO' },
  { clave: 47, nombre: 'ISLAS COOK' },
  { clave: 48, nombre: 'REPÚBLICA DE COLOMBIA' },
  { clave: 49, nombre: 'UNIÓN DE LAS COMORAS' },
  { clave: 50, nombre: 'REPÚBLICA DE CABO VERDE' },
  { clave: 51, nombre: 'REPÚBLICA DE COSTA RICA' },
  { clave: 53, nombre: 'REPÚBLICA DE CUBA' },
  { clave: 55, nombre: 'ISLAS CAIMÁN*' },
  { clave: 56, nombre: 'REPÚBLICA DE CHIPRE' },
  { clave: 57, nombre: 'REPÚBLICA CHECA' },
  { clave: 58, nombre: 'CONFEDERACIÓN SUIZA' },
  { clave: 59, nombre: 'REPÚBLICA DE CHILE' },
  { clave: 60, nombre: 'REPÚBLICA POPULAR CHINA' },
  { clave: 61, nombre: 'REPÚBLICA FEDERAL DE ALEMANIA' },
  { clave: 62, nombre: 'REPÚBLICA DE YIBUTI' },
  { clave: 63, nombre: 'MANCOMUNIDAD DE DOMINICA' },
  { clave: 64, nombre: 'REINO DE DINAMARCA' },
  { clave: 65, nombre: 'REPÚBLICA DOMINICANA' },
  { clave: 66, nombre: 'REPÚBLICA ARGELINA DEMOCRÁTICA Y POPULAR' },
  { clave: 67, nombre: 'REPÚBLICA ÁRABE SAHARAUI DEMOCRÁTICA*' },
  { clave: 68, nombre: 'REINO DE ESPAÑA' },
  { clave: 69, nombre: 'REPÚBLICA DE ESTONIA' },
  { clave: 70, nombre: 'REPÚBLICA DEMOCRÁTICA FEDERAL DE ETIOPÍA' },
  { clave: 71, nombre: 'REPÚBLICA DE FINLANDIA' },
  { clave: 72, nombre: 'REPÚBLICA DE FIJI' },
  { clave: 73, nombre: 'ISLAS MALVINAS*' },
  { clave: 74, nombre: 'REPÚBLICA FRANCESA' },
  { clave: 75, nombre: 'ISLAS FEROE' },
  { clave: 76, nombre: 'ESTADOS FEDERADOS DE MICRONESIA' },
  { clave: 77, nombre: 'REPÚBLICA GABONESA' },
  { clave: 84, nombre: 'GEORGIA' },
  { clave: 85, nombre: 'REPÚBLICA DE GHANA' },
  { clave: 86, nombre: 'GIBRALTAR*' },
  { clave: 87, nombre: 'REPÚBLICA DE GUINEA' },
  { clave: 89, nombre: 'REPÚBLICA DE GAMBIA' },
  { clave: 90, nombre: 'REPÚBLICA DE GUINEA BISSAU' },
  { clave: 91, nombre: 'REPÚBLICA DE GUINEA ECUATORIAL' },
  { clave: 92, nombre: 'REPÚBLICA HELÉNICA' },
  { clave: 93, nombre: 'GRANADA' },
  { clave: 94, nombre: 'GROENLANDIA' },
  { clave: 95, nombre: 'REPÚBLICA DE GUATEMALA' },
  { clave: 97, nombre: 'GUAM*' },
  { clave: 98, nombre: 'REPÚBLICA COOPERATIVA DE GUYANA' },
  { clave: 101, nombre: 'REPÚBLICA DE HONDURAS' },
  { clave: 102, nombre: 'REPÚBLICA DE CROACIA' },
  { clave: 103, nombre: 'REPÚBLICA DE HAITÍ' },
  { clave: 104, nombre: 'HUNGRÍA' },
  { clave: 105, nombre: 'REPÚBLICA DE INDONESIA' },
  { clave: 106, nombre: 'REPÚBLICA DE LA INDIA' },
  { clave: 108, nombre: 'REPÚBLICA DE IRLANDA' },
  { clave: 109, nombre: 'REPÚBLICA ISLÁMICA DE IRÁN' },
  { clave: 110, nombre: 'REPÚBLICA DE IRAK' },
  { clave: 111, nombre: 'REPÚBLICA DE ISLANDIA' },
  { clave: 112, nombre: 'ESTADO DE ISRAEL' },
  { clave: 113, nombre: 'REPÚBLICA ITALIANA' },
  { clave: 114, nombre: 'JAMAICA' },
  { clave: 115, nombre: 'REINO HACHEMITA DE JORDANIA' },
  { clave: 116, nombre: 'JAPÓN' },
  { clave: 117, nombre: 'REPÚBLICA DE KAZAJSTÁN' },
  { clave: 118, nombre: 'REPÚBLICA DE KENIA' },
  { clave: 119, nombre: 'REPÚBLICA KIRGUISA' },
  { clave: 120, nombre: 'REINO DE CAMBOYA' },
  { clave: 121, nombre: 'REPÚBLICA DE KIRIBATI' },
  { clave: 122, nombre: 'FEDERACIÓN DE SAN CRISTÓBAL Y NIEVES' },
  { clave: 123, nombre: 'REPÚBLICA DE COREA' },
  { clave: 124, nombre: 'ESTADO DE KUWAIT' },
  { clave: 125, nombre: 'REPÚBLICA DEMOCRÁTICA POPULAR LAO' },
  { clave: 126, nombre: 'REPÚBLICA LIBANESA' },
  { clave: 127, nombre: 'REPÚBLICA DE LIBERIA' },
  { clave: 128, nombre: 'ESTADO DE LIBIA' },
  { clave: 129, nombre: 'SANTA LUCÍA' },
  { clave: 130, nombre: 'PRINCIPADO DE LIECHTENSTEIN' },
  { clave: 131, nombre: 'REPÚBLICA SOCIALISTA DEMOCRÁTICA DE SRI LANKA' },
  { clave: 132, nombre: 'REINO DE LESOTHO' },
  { clave: 133, nombre: 'REPÚBLICA DE LITUANIA' },
  { clave: 134, nombre: 'GRAN DUCADO DE LUXEMBURGO' },
  { clave: 135, nombre: 'REPÚBLICA DE LETONIA' },
  { clave: 137, nombre: 'REINO DE MARRUECOS' },
  { clave: 138, nombre: 'PRINCIPADO DE MÓNACO' },
  { clave: 139, nombre: 'REPÚBLICA DE MOLDAVIA' },
  { clave: 140, nombre: 'REPÚBLICA DE MADAGASCAR' },
  { clave: 141, nombre: 'REPÚBLICA DE MALDIVAS' },
  { clave: 142, nombre: 'MÉXICO' },
  { clave: 143, nombre: 'REPÚBLICA DE LAS ISLAS MARSHALL' },
  { clave: 144, nombre: 'ANTIGUA REPÚBLICA YUGOSLAVA DE MACEDONIA' },
  { clave: 145, nombre: 'REPÚBLICA DE MALÍ' },
  { clave: 146, nombre: 'REPÚBLICA DE MALTA' },
  { clave: 147, nombre: 'UNIÓN DE MYANMAR' },
  { clave: 148, nombre: 'MONGOLIA' },
  { clave: 149, nombre: 'MANCOMUNIDAD DE LAS ISLAS MARIANAS DEL NORTE' },
  { clave: 150, nombre: 'REPÚBLICA DE MOZAMBIQUE' },
  { clave: 151, nombre: 'REPÚBLICA ISLÁMICA DE MAURITANIA' },
  { clave: 152, nombre: 'MONTSERRAT*' },
  { clave: 154, nombre: 'REPÚBLICA DE MAURICIO' },
  { clave: 155, nombre: 'REPÚBLICA DE MALAUI' },
  { clave: 156, nombre: 'MALASIA' },
  { clave: 157, nombre: 'REPÚBLICA DE NAMIBIA' },
  { clave: 159, nombre: 'REPÚBLICA DEL NÍGER' },
  { clave: 161, nombre: 'REPÚBLICA FEDERAL DE NIGERIA' },
  { clave: 162, nombre: 'REPÚBLICA DE NICARAGUA' },
  { clave: 163, nombre: 'NIUE' },
  { clave: 164, nombre: 'REINO DE LOS PAÍSES BAJOS' },
  { clave: 165, nombre: 'REINO DE NORUEGA' },
  { clave: 166, nombre: 'REPÚBLICA FEDERAL DEMOCRÁTICA DE NEPAL' },
  { clave: 167, nombre: 'REPÚBLICA DE NAURU' },
  { clave: 169, nombre: 'NUEVA ZELANDIA' },
  { clave: 170, nombre: 'SULTANATO DE OMÁN' },
  { clave: 171, nombre: 'REPÚBLICA ISLÁMICA DE PAKISTÁN' },
  { clave: 172, nombre: 'REPÚBLICA DE PANAMÁ' },
  { clave: 173, nombre: 'ISLAS PITCAIRN, HENDERSON, DUCIE Y OENO*' },
  { clave: 174, nombre: 'REPÚBLICA DEL PERÚ' },
  { clave: 175, nombre: 'REPÚBLICA DE FILIPINAS' },
  { clave: 176, nombre: 'REPÚBLICA DE PALAOS' },
  { clave: 177, nombre: 'ESTADO INDEPENDIENTE DE PAPÚA NUEVA GUINEA' },
  { clave: 178, nombre: 'REPÚBLICA DE POLONIA' },
  { clave: 179, nombre: 'ESTADO LIBRE ASOCIADO DE PUERTO RICO' },
  { clave: 180, nombre: 'REPÚBLICA POPULAR DEMOCRÁTICA DE COREA' },
  { clave: 181, nombre: 'REPÚBLICA PORTUGUESA' },
  { clave: 182, nombre: 'REPÚBLICA DEL PARAGUAY' },
  { clave: 184, nombre: 'ESTADO DE QATAR' },
  { clave: 186, nombre: 'RUMANIA' },
  { clave: 187, nombre: 'FEDERACIÓN DE RUSIA' },
  { clave: 188, nombre: 'REPÚBLICA DE RUANDA' },
  { clave: 189, nombre: 'REINO DE ARABIA SAUDITA' },
  { clave: 190, nombre: 'REPÚBLICA DEL SUDÁN' },
  { clave: 191, nombre: 'REPÚBLICA DE SENEGAL' },
  { clave: 192, nombre: 'REPÚBLICA DE SINGAPUR' },
  { clave: 193, nombre: 'ISLA SANTA HELENA*' },
  { clave: 195, nombre: 'ISLAS SALOMÓN' },
  { clave: 196, nombre: 'REPÚBLICA DE SIERRA LEONA' },
  { clave: 197, nombre: 'REPÚBLICA DE EL SALVADOR' },
  { clave: 198, nombre: 'REPÚBLICA DE SAN MARINO' },
  { clave: 199, nombre: 'REPÚBLICA FEDERAL DE SOMALIA' },
  { clave: 201, nombre: 'REPÚBLICA DEMOCRÁTICA DE SANTO TOMÉ Y PRÍNCIPE' },
  { clave: 202, nombre: 'REPÚBLICA DE SURINAM' },
  { clave: 203, nombre: 'REPÚBLICA ESLOVACA' },
  { clave: 204, nombre: 'REPÚBLICA DE ESLOVENIA' },
  { clave: 205, nombre: 'REINO DE SUECIA' },
  { clave: 206, nombre: 'REINO DE SUAZILANDIA' },
  { clave: 207, nombre: 'REPÚBLICA DE LAS SEYCHELLES' },
  { clave: 208, nombre: 'REPÚBLICA ÁRABE SIRIA' },
  { clave: 209, nombre: 'ISLAS TURCAS Y CAICOS*' },
  { clave: 210, nombre: 'REPÚBLICA DEL CHAD' },
  { clave: 211, nombre: 'REPÚBLICA TOGOLESA' },
  { clave: 212, nombre: 'REINO DE TAILANDIA' },
  { clave: 213, nombre: 'REPÚBLICA DE TAYIKISTÁN' },
  { clave: 214, nombre: 'TOKELAU*' },
  { clave: 215, nombre: 'TURKMENISTÁN' },
  { clave: 216, nombre: 'REPÚBLICA DEMOCRÁTICA DE TIMOR ORIENTAL' },
  { clave: 217, nombre: 'REINO DE TONGA' },
  { clave: 218, nombre: 'REPÚBLICA DE TRINIDAD Y TOBAGO' },
  { clave: 219, nombre: 'REPÚBLICA TUNECINA' },
  { clave: 220, nombre: 'REPÚBLICA DE TURQUÍA' },
  { clave: 221, nombre: 'TUVALU' },
  { clave: 222, nombre: 'TAIWÁN' },
  { clave: 223, nombre: 'REPÚBLICA UNIDA DE TANZANIA' },
  { clave: 224, nombre: 'REPÚBLICA DE UGANDA' },
  { clave: 225, nombre: 'UCRANIA' },
  { clave: 227, nombre: 'REPÚBLICA ORIENTAL DEL URUGUAY' },
  { clave: 228, nombre: 'ESTADOS UNIDOS DE AMÉRICA' },
  { clave: 229, nombre: 'REPÚBLICA DE UZBEKISTÁN' },
  { clave: 230, nombre: 'ESTADO DE LA CIUDAD DEL VATICANO' },
  { clave: 231, nombre: 'SAN VICENTE Y LAS GRANADINAS' },
  { clave: 232, nombre: 'REPÚBLICA BOLIVARIANA DE VENEZUELA' },
  { clave: 233, nombre: 'ISLAS VÍRGENES BRITÁNICAS*' },
  { clave: 234, nombre: 'ISLAS VÍRGENES DE LOS ESTADOS UNIDOS*' },
  { clave: 235, nombre: 'REPÚBLICA SOCIALISTA DE VIETNAM' },
  { clave: 236, nombre: 'REPÚBLICA DE VANUATU' },
  { clave: 238, nombre: 'ESTADO INDEPENDIENTE DE SAMOA' },
  { clave: 240, nombre: 'REPÚBLICA DE YEMEN' },
  { clave: 242, nombre: 'REPÚBLICA DE SUDÁFRICA' },
  { clave: 243, nombre: 'REPÚBLICA DEMOCRÁTICA DEL CONGO' },
  { clave: 244, nombre: 'REPÚBLICA DE ZAMBIA' },
  { clave: 245, nombre: 'REPÚBLICA DE ZIMBABUE' },
  { clave: 246, nombre: 'OTRO' },
  { clave: 247, nombre: 'SE IGNORA' },
  { clave: 248, nombre: 'NO ESPECIFICADO' },
  { clave: 249, nombre: 'ESTADO DE ERITREA' },
  { clave: 250, nombre: 'REPÚBLICA DE SUDÁN DEL SUR' },
  { clave: 251, nombre: 'CURAZAO' },
  { clave: 252, nombre: 'ESTADO DE PALESTINA' },
  { clave: 253, nombre: 'ISLA DE MAN' },
  { clave: 254, nombre: 'ISLA DE SINT MAARTEN' },
  { clave: 255, nombre: 'ISLA WAKE' },
  { clave: 256, nombre: 'REINO UNIDO DE GRAN BRETAÑA E IRLANDA DEL NORTE' },
  { clave: 257, nombre: 'REPÚBLICA DE SERBIA' },
  { clave: 258, nombre: 'REPÚBLICA DE MONTENEGRO' },
] as const

export const ENTIDAD_FEDERATIVA: readonly { readonly clave: string; readonly nombre: string; readonly abreviatura: string }[] = [
  { clave: '00', nombre: 'NO ESPECIFICADO', abreviatura: 'NE' },
  { clave: '01', nombre: 'AGUASCALIENTES', abreviatura: 'AS' },
  { clave: '02', nombre: 'BAJA CALIFORNIA', abreviatura: 'BC' },
  { clave: '03', nombre: 'BAJA CALIFORNIA SUR', abreviatura: 'BS' },
  { clave: '04', nombre: 'CAMPECHE', abreviatura: 'CC' },
  { clave: '05', nombre: 'COAHUILA DE ZARAGOZA', abreviatura: 'CL' },
  { clave: '06', nombre: 'COLIMA', abreviatura: 'CM' },
  { clave: '07', nombre: 'CHIAPAS', abreviatura: 'CS' },
  { clave: '08', nombre: 'CHIHUAHUA', abreviatura: 'CH' },
  { clave: '09', nombre: 'CIUDAD DE MÉXICO', abreviatura: 'DF' },
  { clave: '10', nombre: 'DURANGO', abreviatura: 'DG' },
  { clave: '11', nombre: 'GUANAJUATO', abreviatura: 'GT' },
  { clave: '12', nombre: 'GUERRERO', abreviatura: 'GR' },
  { clave: '13', nombre: 'HIDALGO', abreviatura: 'HG' },
  { clave: '14', nombre: 'JALISCO', abreviatura: 'JC' },
  { clave: '15', nombre: 'MÉXICO', abreviatura: 'MC' },
  { clave: '16', nombre: 'MICHOACÁN DE OCAMPO', abreviatura: 'MN' },
  { clave: '17', nombre: 'MORELOS', abreviatura: 'MS' },
  { clave: '18', nombre: 'NAYARIT', abreviatura: 'NT' },
  { clave: '19', nombre: 'NUEVO LEÓN', abreviatura: 'NL' },
  { clave: '20', nombre: 'OAXACA', abreviatura: 'OC' },
  { clave: '21', nombre: 'PUEBLA', abreviatura: 'PL' },
  { clave: '22', nombre: 'QUERÉTARO', abreviatura: 'QT' },
  { clave: '23', nombre: 'QUINTANA ROO', abreviatura: 'QR' },
  { clave: '24', nombre: 'SAN LUIS POTOSÍ', abreviatura: 'SP' },
  { clave: '25', nombre: 'SINALOA', abreviatura: 'SL' },
  { clave: '26', nombre: 'SONORA', abreviatura: 'SR' },
  { clave: '27', nombre: 'TABASCO', abreviatura: 'TC' },
  { clave: '28', nombre: 'TAMAULIPAS', abreviatura: 'TS' },
  { clave: '29', nombre: 'TLAXCALA', abreviatura: 'TL' },
  { clave: '30', nombre: 'VERACRUZ DE IGNACIO DE LA LLAVE', abreviatura: 'VZ' },
  { clave: '31', nombre: 'YUCATÁN', abreviatura: 'YN' },
  { clave: '32', nombre: 'ZACATECAS', abreviatura: 'ZS' },
  { clave: '88', nombre: 'NO APLICA', abreviatura: '' },
  { clave: '99', nombre: 'SE IGNORA', abreviatura: 'SI' },
] as const

export function buscarPais(clave: number) {
  return PAIS.find((p) => p.clave === clave)
}

export function buscarEntidad(clave: string) {
  return ENTIDAD_FEDERATIVA.find((e) => e.clave === clave.padStart(2, '0'))
}

// ------------------------------------------------------------
// Catálogo TIPO PERSONAL–SIS (variable 7), tal como lo enumera la guía.
// (Pequeño y enumerado en el texto de la guía — no es un archivo aparte.)
// ------------------------------------------------------------
export const TIPO_PERSONAL = [
  { value: 12, label: 'PASANTE EN ODONTOLOGÍA' },
  { value: 13, label: 'ODONTÓLOGA (O)' },
  { value: 14, label: 'ODONTÓLOGA (O) ESPECIALISTA' },
  { value: 23, label: 'TÉCNICA(O) EN ODONTOLOGÍA' },
] as const

/** Catálogo AFILIACION (variable 23). Admite multivalor con "&". */
export const AFILIACION = [
  { value: 0, label: 'NO ESPECIFICADO' },
  { value: 1, label: 'NINGUNA' },
  { value: 2, label: 'IMSS' },
  { value: 3, label: 'ISSSTE' },
  { value: 4, label: 'PEMEX' },
  { value: 5, label: 'SEDENA' },
  { value: 6, label: 'SEMAR' },
  { value: 8, label: 'OTRA' },
  { value: 10, label: 'IMSS Bienestar' },
  { value: 11, label: 'ISSFAM' },
  { value: 14, label: 'OPD IMSS BIENESTAR' },
  { value: 99, label: 'SE IGNORA' },
] as const

/** Variable 20 (migrante). */
export const MIGRANTE = [
  { value: 0, label: 'NO' },
  { value: 1, label: 'NACIONAL' },
  { value: 2, label: 'INTERNACIONAL' },
  { value: 3, label: 'RETORNADO (Sólo nacional)' },
] as const

/** Variable 22 (identidad de género). */
export const GENERO = [
  { value: 0, label: 'NO ESPECIFICADO' },
  { value: 1, label: 'MASCULINO' },
  { value: 2, label: 'FEMENINO' },
  { value: 3, label: 'TRANSGÉNERO' },
  { value: 4, label: 'TRANSEXUAL' },
  { value: 5, label: 'TRAVESTI' },
  { value: 6, label: 'INTERSEXUAL' },
  { value: 88, label: 'OTRO' },
] as const

/** Variable 76 (estudios valorados a distancia). Admite multivalor con "&". */
export const ESTUDIOS_TELECONSULTA = [
  { value: 1, label: 'USG' },
  { value: 2, label: 'ECG' },
  { value: 3, label: 'RAYOS X' },
  { value: 4, label: 'TOMOGRAFÍA' },
  { value: 5, label: 'RESONANCIA MAGNETICA' },
  { value: 6, label: 'MASTOGRAFÍA' },
  { value: 7, label: 'OTROS' },
] as const

/**
 * Deriva el sexo (variable 16, sexoCURP) a partir de la posición 11 de
 * una CURP real (no genérica), tal como indica la regla de validación
 * de la variable: M→2, H→1, X→3.
 */
export function sexoDesdeCurp(curp: string): 1 | 2 | 3 | null {
  const c = (curp ?? '').toUpperCase()
  const letra = c[10]
  if (letra === 'H') return 1
  if (letra === 'M') return 2
  if (letra === 'X') return 3
  return null
}

// ------------------------------------------------------------
// DIAGNOSTICO_SIS — carga diferida (archivo JSON aparte, ~940 KB).
// ------------------------------------------------------------

export interface EntradaDiagnosticoSis {
  /** CATALOG_KEY: código de 4 caracteres (ej. "K021", "R69X"). */
  codigo: string
  descripcion: string
  /** Restricción por sexo: 1=Hombre, 2=Mujer, null=sin restricción. */
  sexo: 1 | 2 | null
  /** Edad mínima/máxima permitida, en AÑOS (ya convertidas desde LINF/LSUP). */
  edadMin: number | null
  edadMax: number | null
}

interface FilaDiagnosticoCompacta {
  c: string
  n: string
  s: 1 | 2 | null
  ei: number | null
  es: number | null
}

let cacheDiagnosticos: Map<string, EntradaDiagnosticoSis> | null = null

/**
 * Carga el catálogo DIAGNOSTICO_SIS (9,076 códigos vigentes) desde el
 * JSON separado. Se cachea en memoria tras la primera carga. Al ser un
 * import() dinámico, Vite lo separa en su propio chunk — no se agrega
 * al bundle principal de la app, solo se descarga cuando de verdad se
 * usa el módulo de interoperabilidad SIS.
 */
export async function cargarCatalogoDiagnosticos(): Promise<Map<string, EntradaDiagnosticoSis>> {
  if (cacheDiagnosticos) return cacheDiagnosticos
  const modulo = await import('./data/diagnosticos-sis.json')
  const filas = modulo.default as FilaDiagnosticoCompacta[]
  const mapa = new Map<string, EntradaDiagnosticoSis>()
  for (const f of filas) {
    mapa.set(f.c, { codigo: f.c, descripcion: f.n, sexo: f.s, edadMin: f.ei, edadMax: f.es })
  }
  cacheDiagnosticos = mapa
  return mapa
}

export interface EntradaEstablecimientoSis {
  clues: string
  institucion: string // p. ej. "SSA", "IMB" — usado por programaSMyMG
  entidad: string // 2 caracteres, para la nomenclatura del archivo
  enOperacion: boolean
}

/**
 * Los catálogos se cargan en tiempo de ejecución y se pasan aquí ya
 * resueltos. `diagnosticos` viene de cargarCatalogoDiagnosticos().
 * `establecimientos` NO es el catálogo nacional completo (64,006
 * filas) — es un mapa con, típicamente, una sola entrada: la CLUES de
 * la propia clínica, resuelta con una consulta puntual a Supabase
 * (ver migración 032 y cargarEstablecimientoPorClues en el backend).
 */
export interface CatalogosSis {
  diagnosticos?: Map<string, EntradaDiagnosticoSis>
  establecimientos?: Map<string, EntradaEstablecimientoSis>
}

export function crearCatalogosVacios(): CatalogosSis {
  return {}
}

export function buscarDiagnostico(catalogos: CatalogosSis, codigo: string) {
  return catalogos.diagnosticos?.get(codigo.toUpperCase())
}

export function buscarEstablecimiento(catalogos: CatalogosSis, clues: string) {
  return catalogos.establecimientos?.get(clues.toUpperCase())
}
