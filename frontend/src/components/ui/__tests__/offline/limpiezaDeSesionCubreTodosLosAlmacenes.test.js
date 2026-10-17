// Guardia de arquitectura (fase 8): todo almacén local de datos (una base de IndexedDB) debe borrarse al cerrar sesión y al cambiar de usuario.
// Riesgo que evita: añadir un módulo con su propia base de IndexedDB (p. ej. una réplica nueva) sin añadirlo a la limpieza dejaría datos clínicos de una
// persona en el equipo de la siguiente — sin conexión no aplica RLS, así que esa limpieza es la ÚNICA barrera.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const LIB = join(fileURLToPath(new URL('../../../../lib/', import.meta.url)))
// Se conservan A PROPÓSITO al cerrar sesión: la cola guarda cambios clínicos sin subir (perderlos los destruiría).
const EXENTOS_AL_CERRAR = ['colaOffline']
// Al CAMBIAR de usuario se conservan además la caché de autenticación (la sobrescribe el nuevo inicio de sesión) y el PIN (se revoca al cerrar sesión).
const EXENTOS_AL_CAMBIAR_USUARIO = ['colaOffline', 'cacheAuth', 'pinOffline']

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const cuerpoDe = (texto, nombre) => { const i = texto.indexOf(`function ${nombre}`); if (i < 0) return ''; const j = texto.indexOf('\n}\n', i); return texto.slice(i, j < 0 ? undefined : j) }

// Función pura: dados los módulos de lib/ (nombre → texto) y el texto de cierreSesion.js, devuelve los problemas.
export function auditarLimpieza(modulos, cierre) {
  const problemas = []
  const c = sinComentarios(cierre)
  const alCerrar = cuerpoDe(c, 'limpiarDatosLocalesDeSesion'), alCambiar = cuerpoDe(c, 'asegurarCacheDeEsteUsuario')
  for (const [nombre, crudo] of Object.entries(modulos)) {
    const texto = sinComentarios(crudo)
    if (!/openDB\(|indexedDB\.open\(/.test(texto)) continue                        // este módulo no guarda nada en IndexedDB
    const limpieza = [...texto.matchAll(/export\s+(?:async\s+)?function\s+((?:vaciar|revocar|borrar|limpiar)\w*)/g)].map((m) => m[1])
    if (!EXENTOS_AL_CERRAR.includes(nombre)) {
      if (!limpieza.length) { problemas.push(`${nombre}: abre IndexedDB pero no exporta ninguna función vaciar*/revocar*`); continue }
      for (const f of limpieza) if (!new RegExp(`\\b${f}\\(`).test(alCerrar)) problemas.push(`${nombre}: ${f}() no se llama en limpiarDatosLocalesDeSesion (cerrar sesión)`)
    }
    if (!EXENTOS_AL_CAMBIAR_USUARIO.includes(nombre) && limpieza.length) for (const f of limpieza) if (!new RegExp(`\\b${f}\\(`).test(alCambiar)) problemas.push(`${nombre}: ${f}() no se llama en asegurarCacheDeEsteUsuario (cambio de usuario)`)
  }
  return problemas
}

describe('la limpieza de sesión cubre TODOS los almacenes locales', () => {
  const modulos = Object.fromEntries(readdirSync(LIB).filter((n) => n.endsWith('.js')).map((n) => [n.replace(/\.js$/, ''), readFileSync(join(LIB, n), 'utf8')]))
  const cierre = readFileSync(join(LIB, 'cierreSesion.js'), 'utf8')
  it('la guardia revisa de verdad: encuentra los 10 módulos que abren IndexedDB', () => {
    const conDB = Object.entries(modulos).filter(([, t]) => /openDB\(|indexedDB\.open\(/.test(sinComentarios(t))).map(([n]) => n).sort()
    expect(conDB).toEqual(['cacheAuth', 'cacheLectura', 'citasReplica', 'colaOffline', 'expedientesReplica', 'indicePacientesOffline', 'mapeoIdsOffline', 'pacientesOffline', 'pacientesReplica', 'pinOffline'])
  })
  it('hoy NO hay ningún almacén sin limpiar (ni al cerrar sesión ni al cambiar de usuario)', () => { expect(auditarLimpieza(modulos, cierre)).toEqual([]) })
  it('la cola de operaciones sigue EXENTA a propósito: nunca se borra al cerrar sesión (cambios clínicos sin subir)', () => {
    const c = sinComentarios(cierre); expect(cuerpoDe(c, 'limpiarDatosLocalesDeSesion')).not.toMatch(/colaOffline|vaciarCola|Operaciones\(/i)
  })
  it('CASO NEGATIVO: un módulo NUEVO con su propia base de IndexedDB y sin limpieza se detecta', () => {
    const nuevo = { ...modulos, recetasReplica: "const DB_NOMBRE = 'siro-recetas'\nexport async function leerRecetas() { return openDB(DB_NOMBRE, 1) }" }
    const p = auditarLimpieza(nuevo, cierre); expect(p.length).toBe(1); expect(p[0]).toMatch(/recetasReplica.*no exporta ninguna función vaciar/)
  })
  it('CASO NEGATIVO: un módulo con su función de limpieza que NO se llama en el cierre de sesión se detecta (en ambos flujos)', () => {
    const nuevo = { ...modulos, recetasReplica: "export async function vaciarReplicaRecetas() {}\nexport function abrir() { return openDB('x', 1) }" }
    const p = auditarLimpieza(nuevo, cierre); expect(p).toEqual(expect.arrayContaining([expect.stringMatching(/vaciarReplicaRecetas.*limpiarDatosLocalesDeSesion/), expect.stringMatching(/vaciarReplicaRecetas.*asegurarCacheDeEsteUsuario/)]))
  })
  it('CASO NEGATIVO: quitar una limpieza existente del cierre de sesión se detecta', () => {
    const roto = cierre.replace(/\n\s*vaciarReplicaCitas\(\),/, '\n')
    expect(roto).not.toBe(cierre); expect(auditarLimpieza(modulos, roto).some((x) => /vaciarReplicaCitas/.test(x))).toBe(true)
  })
})
