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
