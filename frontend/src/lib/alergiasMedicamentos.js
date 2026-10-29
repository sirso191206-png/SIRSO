// Cruce entre las alergias registradas del paciente y lo que se va a recetar. No sustituye el juicio clínico: es un aviso
// para que el odontólogo no recete, por descuido, un medicamento al que el paciente es alérgico (p. ej. amoxicilina a un
// alérgico a la penicilina). Busca el nombre de la sustancia en el medicamento y, para las familias más comunes en
// odontología, los medicamentos de esa familia, incluidas marcas comerciales comunes en México (Augmentin, Advil…).

const FAMILIAS = [
  { claves: ['penicilina', 'betalactamico', 'betalactamicos'], miembros: ['penicilina', 'amoxicilina', 'amoxi', 'ampicilina', 'dicloxacilina', 'bencilpenicilina', 'clavulan', 'piperacilina', 'augmentin', 'amoxil', 'clavulin', 'pentrexyl', 'penprocilina', 'benzetacil'] },
  { claves: ['cefalosporina', 'cefalosporinas'], miembros: ['cefalexina', 'cefadroxilo', 'cefuroxima', 'ceftriaxona', 'cefixima', 'cefaclor', 'cefazolina', 'keflex', 'ceporex', 'rocephin'] },
  { claves: ['sulfa', 'sulfas', 'sulfonamida', 'sulfonamidas'], miembros: ['sulfametoxazol', 'trimetoprima', 'trimetoprim', 'sulfadiazina', 'bactrim', 'septrin'] },
  { claves: ['macrolido', 'macrolidos'], miembros: ['azitromicina', 'claritromicina', 'eritromicina', 'zithromax', 'azitrocin', 'klaricid'] },
  { claves: ['aine', 'aines', 'antiinflamatorio', 'antiinflamatorios', 'aspirina', 'acido acetilsalicilico'], miembros: ['ibuprofeno', 'naproxeno', 'ketorolaco', 'diclofenaco', 'aspirina', 'acetilsalicilico', 'ketoprofeno', 'meloxicam', 'piroxicam', 'nimesulida', 'celecoxib', 'indometacina', 'advil', 'motrin', 'flanax', 'voltaren', 'dolac', 'supradol', 'mobicox'] },
  { claves: ['metamizol', 'dipirona'], miembros: ['metamizol', 'dipirona', 'neo-melubrina', 'neomelubrina', 'novalgina'] },
  { claves: ['anestesico local', 'anestesicos locales', 'amida', 'amidas'], miembros: ['lidocaina', 'mepivacaina', 'articaina', 'prilocaina', 'bupivacaina'] },
  { claves: ['clindamicina', 'lincosamida'], miembros: ['clindamicina', 'lincomicina', 'dalacin'] },
  { claves: ['quinolona', 'quinolonas', 'fluoroquinolona'], miembros: ['ciprofloxacino', 'levofloxacino', 'moxifloxacino', 'ciproxina'] },
  { claves: ['tetraciclina', 'tetraciclinas'], miembros: ['tetraciclina', 'doxiciclina', 'minociclina'] }
]

export function normalizar(texto) {
  return String(texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

// Términos que, si aparecen en el nombre del medicamento, chocan con esta alergia.
function terminosDeAlergia(sustancia) {
  const s = normalizar(sustancia)
  if (!s) return []
  const terminos = new Set([s])
  // También cada palabra significativa («Penicilina G» → «penicilina»).
  for (const palabra of s.split(/[\s,/()]+/)) if (palabra.length >= 5) terminos.add(palabra)
  for (const familia of FAMILIAS) {
    const coincide = familia.claves.some((c) => s.includes(c)) || familia.miembros.some((m) => s.includes(m))
    if (coincide) for (const m of familia.miembros) terminos.add(m)
  }
  return [...terminos]
}

// Devuelve [{ medicamento, alergia }] por cada medicamento que choca con alguna alergia registrada.
export function conflictosDeAlergia(medicamentos, alergias) {
  const conflictos = []
  for (const alergia of alergias ?? []) {
    const terminos = terminosDeAlergia(alergia?.sustancia)
    if (terminos.length === 0) continue
    for (const m of medicamentos ?? []) {
      const nombre = normalizar(`${m?.medicamento ?? ''} ${m?.presentacion ?? ''}`)
      if (nombre && terminos.some((t) => nombre.includes(t))) {
        conflictos.push({ medicamento: m.medicamento, alergia: alergia.sustancia, severidad: alergia.severidad ?? null })
      }
    }
  }
  return conflictos
}
