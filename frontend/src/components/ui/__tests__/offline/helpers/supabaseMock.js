// Simulador mínimo de la API encadenable de supabase-js, para probar
// servicios sin red. Cada llamada encadenada (.from().update().eq()...)
// se REGISTRA, así una prueba puede verificar QUÉ se le pidió a la base
// (por ejemplo, que el UPDATE lleve la condición de concurrencia), no
// solo qué devolvió.
//
// `responder(tabla, operaciones)` decide qué devuelve cada consulta:
// { data, error, count }. `operaciones` es la lista de
// [metodo, argumentos] encadenados hasta ese momento.

export function crearQueryMock(tabla, responder, registro) {
  const operaciones = []
  const proxy = new Proxy({}, {
    get(_, prop) {
      if (typeof prop === 'symbol') return undefined
      if (prop === 'then') {
        // Hace que `await query` resuelva con la respuesta simulada,
        // igual que una consulta real de supabase-js.
        return (resolver, rechazar) => {
          try { resolver(responder(tabla, operaciones)) } catch (e) { rechazar(e) }
        }
      }
      return (...args) => { operaciones.push([prop, args]); return proxy }
    }
  })
  registro.push({ tabla, operaciones })
  return proxy
}

// Atajos de respuesta
export const ok = (data, extra = {}) => ({ data, error: null, ...extra })
export const fallo = (mensaje, code) => ({ data: null, error: { message: mensaje, code } })
export const sinRed = () => fallo('TypeError: Failed to fetch')

// Busca en las operaciones registradas una llamada por nombre.
export function llamada(operaciones, metodo) {
  return operaciones.find(([m]) => m === metodo)
}
