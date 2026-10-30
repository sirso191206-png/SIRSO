// Tailwind's `capitalize` pone mayúscula a CADA palabra ("Julio De 2026").
// Esto capitaliza solo la primera letra del texto completo ("Julio de 2026").
export function capitalizarPrimeraLetra(texto) {
  if (!texto) return texto
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

// Los filtros .or() de Supabase/PostgREST usan coma, paréntesis y punto
// como caracteres de control de su propio mini-lenguaje. Si el texto que
// escribe el usuario en un buscador se interpola tal cual, podría alterar
// el filtro (no hay fuga entre clínicas porque RLS sigue aplicando de
// todas formas, pero es una capa extra de defensa: nunca confiar en el
// texto del navegador tal cual llega).
export function sanitizarTerminoBusqueda(texto) {
  if (!texto) return ''
  return texto.replace(/[,()%*]/g, ' ').trim()
}

// Cómo saludar a alguien por su nombre: «Dra. Laura Méndez» → «Dra. Laura» (antes salía solo «Dra.»).
export function nombreParaSaludo(nombre) {
  const partes = String(nombre ?? '').trim().split(/\s+/).filter(Boolean)
  const titulo = []
  while (partes.length > 1 && /\.$/.test(partes[0])) titulo.push(partes.shift())
  return [...titulo, partes[0] ?? ''].join(' ').trim()
}

// La estatura se captura en centímetros en el expediente, pero la consulta la capturaba en metros: un valor menor a 3 se
// toma como metros. Siempre devuelve centímetros (o null).
export function estaturaEnCm(valor) {
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) return null
  return n < 3 ? Math.round(n * 100) : Math.round(n)
}

// Minúsculas y sin acentos, igual que la columna pacientes.busqueda (fn_sin_acentos, migración 122): «José» y «jose» buscan
// lo mismo. Solo para COMPARAR; nunca se usa para guardar.
export function sinAcentos(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
