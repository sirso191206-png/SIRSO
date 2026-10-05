// Descartar una operación de la cola que ya falló demasiadas veces para
// seguir bloqueando el cierre de sesión — ver GUIA_OFFLINE.md §8 #4.
//
// Reglas deliberadas:
// - Solo aplica a operaciones en estado 'error' con varios intentos
//   fallidos (UMBRAL_INTENTOS_PARA_DESCARTAR): una que nunca se intentó,
//   o que falló una vez por una red intermitente, puede resolverse sola
//   con un reintento normal — descartarla sería perder trabajo real por
//   un error transitorio.
// - Exige conexión: a diferencia de un evento de auditoría normal
//   (registrarEvento, que nunca lanza), este SÍ propaga el error si no
//   se pudo registrar. Borrar un cambio clínico sin dejar rastro en el
//   servidor sería peor que no borrarlo.
// - Nunca decide en automático — solo se llama desde una acción explícita
//   de la persona, después de confirmar y, idealmente, de exportar copia.

import { supabase } from './supabase'
import { quitarOperacion } from './colaOffline'

export const UMBRAL_INTENTOS_PARA_DESCARTAR = 3

export function operacionEsDescartable(operacion) {
  // Un conflicto (p. ej. CURP ya registrado) no se arregla reintentando
  // — se puede descartar de inmediato, sin esperar a los intentos.
  if (operacion.estado === 'conflicto') return true
  return operacion.estado === 'error' && (operacion.intentos ?? 0) >= UMBRAL_INTENTOS_PARA_DESCARTAR
}

// Copia legible del contenido completo, para que la persona pueda
// guardar/imprimir lo que se va a perder antes de confirmar. Se
// construye aparte de la exportación en archivo para poder mostrarla
// también en pantalla si hiciera falta.
export function resumenOperacion(operacion) {
  return {
    id: operacion.id,
    tipo: operacion.tipo,
    entidad: operacion.entidad ?? null,
    entidadId: operacion.entidadId ?? null,
    creado_en: operacion.creado_en,
    intentos: operacion.intentos,
    ultimoError: operacion.ultimoError,
    payload: operacion.payload
  }
}

// Descarga un .json con el contenido completo de la operación — código
// de navegador (Blob + enlace temporal), no una llamada al servidor.
// Es la única copia que va a quedar de este cambio si se descarta.
export function exportarOperacionComoArchivo(operacion) {
  const contenido = JSON.stringify(resumenOperacion(operacion), null, 2)
  const blob = new Blob([contenido], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = `cambio-descartado-${operacion.entidad ?? operacion.tipo}-${operacion.id}.json`
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  URL.revokeObjectURL(url)
}

// Registra el descarte en la auditoría del servidor (usuario_id lo pone
// la base vía auth.uid(), nunca se manda aquí) y solo entonces borra la
// operación de la cola local. Si el insert falla — incluida la falta de
// conexión — no se toca la cola: es preferible seguir bloqueado que
// perder el rastro de qué se descartó y por qué.
export async function descartarOperacionPermanente(operacion) {
  if (!navigator.onLine) {
    throw new Error('Se requiere conexión a internet para descartar un cambio (queda registrado en la auditoría).')
  }
  const { error } = await supabase.from('auditoria').insert({
    accion: 'cola_offline_descartada',
    entidad: operacion.entidad ?? operacion.tipo,
    entidad_id: operacion.entidadId ?? null,
    clinica_id: operacion.clinicaId ?? null,
    detalle: {
      tipo: operacion.tipo,
      intentos: operacion.intentos,
      ultimoError: operacion.ultimoError,
      creado_en: operacion.creado_en
    }
  })
  if (error) throw error
  await quitarOperacion(operacion.id)
}
