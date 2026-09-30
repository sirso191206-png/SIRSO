// Orden de ejecución de la cola cuando unas operaciones dependen de
// otras — hoy, el único caso real es "esto necesita que el paciente
// offline del que depende ya se haya creado en el servidor". Es lógica
// PURA (sin IndexedDB ni red) a propósito: así se puede probar sin
// simular nada, y procesadorColaOffline.js solo la usa, no la
// reimplementa.
//
// operacion.dependeDe: array de ids de OTRAS operaciones de esta misma
// cola. Vacío o ausente = sin dependencias, como hasta ahora.

// Orden topológico (Kahn) de las operaciones pendientes, respetando
// `dependeDe`. Una dependencia que NO está en `operaciones` (porque ya
// se subió y se quitó de la cola en una corrida anterior) se considera
// ya satisfecha — nunca bloquea por algo que ya no existe.
//
// Devuelve { orden, enCiclo }: `orden` son las operaciones ejecutables
// en el orden correcto; `enCiclo` son las que forman un ciclo de
// dependencias entre sí (A depende de B que depende de A) — nunca
// podrían ejecutarse y no se incluyen en `orden`. Un ciclo no debería
// ocurrir con el único tipo de dependencia que existe hoy (paciente →
// entidad clínica, nunca al revés), pero la función no lo asume: si
// pasara, prefiere señalarlo en vez de colgarse en un bucle infinito.
export function ordenarPorDependencias(operaciones) {
  const idsEnLote = new Set(operaciones.map((op) => op.id))
  const pendientesDe = new Map(operaciones.map((op) => [op.id, new Set((op.dependeDe ?? []).filter((d) => idsEnLote.has(d)))]))
  const porId = new Map(operaciones.map((op) => [op.id, op]))

  const orden = []
  const listas = operaciones.filter((op) => pendientesDe.get(op.id).size === 0).map((op) => op.id)

  const resueltas = new Set()
  while (listas.length > 0) {
    const id = listas.shift()
    if (resueltas.has(id)) continue
    resueltas.add(id)
    orden.push(porId.get(id))
    for (const op of operaciones) {
      const deps = pendientesDe.get(op.id)
      if (deps.has(id)) {
        deps.delete(id)
        if (deps.size === 0 && !resueltas.has(op.id)) listas.push(op.id)
      }
    }
  }

  const enCiclo = operaciones.filter((op) => !resueltas.has(op.id))
  return { orden, enCiclo }
}

// ¿Puede ejecutarse `operacion` en esta corrida, dado lo que ya pasó
// con sus dependencias? Tres resultados:
// - 'lista'    — sin dependencias pendientes en este lote, o todas ya
//                resueltas con éxito antes en esta misma corrida.
// - 'esperar'  — depende de algo que sigue pendiente (falló transitorio
//                o no le tocó turno aún) — se reintenta en la próxima
//                corrida, no se toca ahora.
// - 'bloqueada'— depende de algo que se perdió DEFINITIVAMENTE en esta
//                corrida (conflicto de concurrencia, o el ejecutor no
//                se reconoce) — nunca podría completarse: no tiene
//                caso dejarla reintentando para siempre.
export function estadoDeDependencias(operacion, { exitosas, perdidasDefinitivas }) {
  const deps = operacion.dependeDe ?? []
  if (deps.length === 0) return 'lista'
  if (deps.some((d) => perdidasDefinitivas.has(d))) return 'bloqueada'
  if (deps.every((d) => exitosas.has(d))) return 'lista'
  return 'esperar'
}
