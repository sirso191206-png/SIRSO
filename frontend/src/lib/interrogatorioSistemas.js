// Interrogatorio por aparatos y sistemas — catálogo tomado directo del
// listado NOM-004. Cada sistema es un grupo de síntomas marcables.

export const SISTEMAS_INTERROGATORIO = [
  { clave: 'general', nombre: 'General', sintomas: ['Fiebre', 'Pérdida de peso', 'Fatiga'] },
  { clave: 'piel', nombre: 'Piel', sintomas: ['Lesiones', 'Erupciones'] },
  { clave: 'cabeza', nombre: 'Cabeza', sintomas: ['Cefalea', 'Mareo'] },
  { clave: 'ojos', nombre: 'Ojos', sintomas: ['Visión', 'Dolor ocular'] },
  { clave: 'oidos', nombre: 'Oídos', sintomas: ['Dolor', 'Audición'] },
  { clave: 'nariz', nombre: 'Nariz', sintomas: ['Congestión', 'Sangrado'] },
  { clave: 'boca', nombre: 'Boca', sintomas: ['Dolor', 'Úlceras', 'Sangrado'] },
  { clave: 'cuello', nombre: 'Cuello', sintomas: ['Adenopatías', 'Dolor'] },
  { clave: 'respiratorio', nombre: 'Respiratorio', sintomas: ['Tos', 'Disnea'] },
  { clave: 'cardiovascular', nombre: 'Cardiovascular', sintomas: ['Dolor torácico', 'Palpitaciones'] },
  { clave: 'digestivo', nombre: 'Digestivo', sintomas: ['Náusea', 'Vómito', 'Diarrea', 'Estreñimiento'] },
  { clave: 'urinario', nombre: 'Urinario', sintomas: ['Disuria', 'Hematuria'] },
  { clave: 'musculoesqueletico', nombre: 'Musculoesquelético', sintomas: ['Dolor', 'Rigidez'] },
  { clave: 'neurologico', nombre: 'Neurológico', sintomas: ['Convulsiones', 'Parestesias'] },
  { clave: 'endocrino', nombre: 'Endocrino', sintomas: ['Sed', 'Hambre'] },
  { clave: 'psiquiatrico', nombre: 'Psiquiátrico', sintomas: ['Ansiedad', 'Depresión'] }
]
