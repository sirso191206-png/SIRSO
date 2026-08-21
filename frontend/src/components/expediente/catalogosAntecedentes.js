// Sugerencias comunes para acelerar la captura de antecedentes — NO
// son catálogos cerrados. El campo siempre acepta texto libre además
// de estas sugerencias (ver CampoAutocompletar.jsx, usa <datalist>
// nativo del navegador: autocompleta pero nunca bloquea otro valor).

export const SUGERENCIAS_ALERGIAS = [
  'Penicilina', 'Amoxicilina', 'Sulfas', 'Aspirina', 'Ibuprofeno',
  'Lidocaína', 'Anestesia local', 'Látex', 'Yodo', 'Níquel (metales)',
  'Mariscos', 'Frutos secos',
]

export const SUGERENCIAS_ENFERMEDADES = [
  'Diabetes tipo 1', 'Diabetes tipo 2', 'Hipertensión arterial', 'Hipotensión',
  'Hipotiroidismo', 'Hipertiroidismo', 'Asma', 'Epilepsia', 'Cardiopatía',
  'Enfermedad renal crónica', 'Enfermedad hepática', 'VIH', 'Hepatitis',
  'Artritis reumatoide', 'Anemia', 'Trastorno de coagulación', 'Obesidad',
  'Osteoporosis', 'Trastorno de ansiedad', 'Depresión',
]

export const SUGERENCIAS_MEDICAMENTOS = [
  'Paracetamol', 'Ibuprofeno', 'Metformina', 'Losartán', 'Enalapril',
  'Levotiroxina', 'Warfarina', 'Aspirina (antiagregante)', 'Anticonceptivos orales',
  'Omeprazol', 'Insulina', 'Atorvastatina', 'Sertralina',
]

export const SUGERENCIAS_CIRUGIAS = [
  'Apendicectomía', 'Cesárea', 'Amigdalectomía', 'Colecistectomía',
  'Cirugía de rodilla', 'Cirugía cardiaca', 'Cirugía maxilofacial',
  'Extracción de terceros molares', 'Hernioplastia',
]

export const SUGERENCIAS_HOSPITALIZACIONES = [
  'Neumonía', 'Apendicitis', 'Parto/cesárea', 'Accidente automovilístico',
  'Fractura', 'COVID-19', 'Deshidratación severa',
]

/** true/false → texto ya usado en algunas partes; unificado aquí. */
export const OPCIONES_CONTROLADA = [
  { value: '', label: 'Sin especificar' },
  { value: 'controlada', label: 'Controlada' },
  { value: 'no_controlada', label: 'No controlada' },
]
