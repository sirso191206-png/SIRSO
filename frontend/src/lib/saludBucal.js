// Catálogo de acciones de la sección "SALUD BUCAL" que se registran
// en cada consulta — procedimientos y hallazgos preventivos/curativos
// realizados durante la atención odontológica. Se captura como un
// objeto jsonb en notas_clinicas.accion_salud_bucal, con esta forma:
//
//   {
//     placaBacteriana: boolean, cepillado: boolean, hiloDental: boolean,
//     limpiezaDental: boolean, protesis: boolean, tejidosBucales: boolean,
//     autoExamen: boolean, fluor: boolean, raspadoAlisadoPeriodontal: boolean,
//     barnizFluor: boolean, cirugiaBucal: boolean, farmacoTerapia: boolean,
//     orientacionSaludBucal: boolean, tratamientoIntegral: boolean,
//     fosetasFisuras: number, amalgamas: number, resinas: number,
//     ionomeroVidrio: number, alcasite: number, obturacionTemporal: number,
//     dienteTemp: number, dientePerm: number, pulpar: number,
//     otrasAtenciones: number, radiografias: number
//   }
//
// Se espera que AL MENOS una acción tenga valor distinto de "vacío/0/
// false" para considerar la consulta como clínicamente documentada.

// Acciones de sí/no (checkbox).
export const ACCIONES_BOOLEANAS = [
  { clave: 'placaBacteriana', etiqueta: 'Se detectó placa bacteriana' },
  { clave: 'cepillado', etiqueta: 'Instrucción en técnica de cepillado' },
  { clave: 'hiloDental', etiqueta: 'Instrucción del uso de hilo dental' },
  { clave: 'limpiezaDental', etiqueta: 'Limpieza dental' },
  { clave: 'protesis', etiqueta: 'Revisión e higiene de prótesis bucales' },
  { clave: 'tejidosBucales', etiqueta: 'Examen de tejidos bucales' },
  { clave: 'autoExamen', etiqueta: 'Autoexamen de cavidad bucal' },
  { clave: 'fluor', etiqueta: 'Aplicación tópica de flúor' },
  { clave: 'raspadoAlisadoPeriodontal', etiqueta: 'Raspado y alisado periodontal' },
  { clave: 'barnizFluor', etiqueta: 'Aplicación de barniz de flúor' },
  { clave: 'cirugiaBucal', etiqueta: 'Actividad quirúrgica menor' },
  { clave: 'farmacoTerapia', etiqueta: 'Fármacos prescritos por receta' },
  { clave: 'orientacionSaludBucal', etiqueta: 'Orientación de salud bucal' },
  { clave: 'tratamientoIntegral', etiqueta: 'Tratamiento concluido de forma integral' },
]

// Acciones con conteo (número de piezas/eventos). Rango real 1-32
// (número de piezas dentales); 0 = no aplica/no se hizo.
export const ACCIONES_NUMERICAS = [
  { clave: 'fosetasFisuras', etiqueta: 'Fosetas y fisuras selladas' },
  { clave: 'amalgamas', etiqueta: 'Obturaciones con amalgama' },
  { clave: 'resinas', etiqueta: 'Obturaciones con resina' },
  { clave: 'ionomeroVidrio', etiqueta: 'Obturaciones con ionómero de vidrio' },
  { clave: 'alcasite', etiqueta: 'Obturaciones con alcasite' },
  { clave: 'obturacionTemporal', etiqueta: 'Obturaciones temporales' },
  { clave: 'dienteTemp', etiqueta: 'Extracciones de dientes temporales' },
  { clave: 'dientePerm', etiqueta: 'Extracciones de dientes permanentes' },
  { clave: 'pulpar', etiqueta: 'Piezas con terapia pulpar' },
  { clave: 'otrasAtenciones', etiqueta: 'Otras atenciones no listadas' },
  { clave: 'radiografias', etiqueta: 'Radiografías dentales tomadas' },
]

/** true si al menos una acción tiene valor distinto de "vacío/0/false". */
export function tieneAlMenosUnaAccion(valor) {
  if (!valor) return false
  const algunaBooleana = ACCIONES_BOOLEANAS.some((a) => valor[a.clave])
  const algunaNumerica = ACCIONES_NUMERICAS.some((a) => Number(valor[a.clave]) > 0)
  return algunaBooleana || algunaNumerica
}
