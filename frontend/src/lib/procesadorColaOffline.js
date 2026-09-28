import { supabase } from './supabase'
import { crearNotaClinica } from '../services/expedientes'
import { crearReceta } from '../services/recetas'
import { actualizarPiezaOdontograma } from '../services/odontograma'
import { actualizarPiezaPeriodontal, actualizarSitioPeriodontal } from '../services/periodontograma'
import { actualizarCita, crearCita } from '../services/citas'
import { listarOperacionesPendientes, quitarOperacion, marcarIntentoFallido, marcarSincronizando } from './colaOffline'
import { guardarMetadato, leerMetadato } from './cacheLectura'
import { toastExito, toastError } from '../store/useToastStore'

const CLAVE_ULTIMA_SINCRONIZACION_COLA = 'ultima_sincronizacion_cola'

export async function obtenerUltimaSincronizacionCola() {
  return leerMetadato(CLAVE_ULTIMA_SINCRONIZACION_COLA)
}

// Registro de qué hacer por cada "tipo" de operación encolada.
// - crear_nota_clinica: la más segura — es un insert nuevo, con id
//   generado en el navegador, nunca sobrescribe nada existente.
// - actualizar_pieza_odontograma: un UPDATE — sí puede chocar con un
//   cambio de otra persona; por eso actualizarPiezaOdontograma exige
//   actualizadoEnEsperado (candado de concurrencia, migración 072) —
//   si alguien más ya tocó esa pieza, esto falla con
//   CONFLICTO_CONCURRENCIA en vez de sobrescribir en silencio.
// Periodontograma y pagos se agregan aquí cuando se decida encolarlos
// también — cada uno necesita su propio análisis de qué tan seguro es
// reintentarlo.
const EJECUTORES = {
  crear_nota_clinica: (payload) => crearNotaClinica(payload),
  // Misma seguridad que crear_nota_clinica: insert nuevo, id generado
  // en el navegador, upsert del lado del servicio — reintentar nunca
  // duplica una receta.
  crear_receta: (payload) => crearReceta(payload),
  actualizar_pieza_odontograma: (payload) => actualizarPiezaOdontograma(payload.piezaId, payload.cambios),
  actualizar_pieza_periodontal: (payload) => actualizarPiezaPeriodontal(payload.piezaId, payload.cambios),
  actualizar_sitio_periodontal: (payload) => actualizarSitioPeriodontal(payload.sitioId, payload.cambios),

  // "Finalizar consulta" no son piezas sueltas como las de arriba —
  // es una secuencia con orden y dependencia real (motivo → nota →
  // completar cita → seguimiento opcional), igual que ya hacía
  // handleFinalizar en línea. Si el primer paso choca por
  // concurrencia, NINGÚN paso siguiente se ejecuta — no queda una nota
  // huérfana de una consulta que nunca se marcó completada.
  finalizar_consulta: async (payload) => {
    const { citaId, motivo, notaClinica, seguimientoPayload, actualizadoEnEsperado } = payload
    const citaTrasMotivo = await actualizarCita(citaId, { motivo_consulta: motivo || null }, actualizadoEnEsperado)
    await crearNotaClinica(notaClinica)
    await actualizarCita(citaId, { estado: 'completada' }, citaTrasMotivo.actualizado_en)
    if (seguimientoPayload) {
      await crearCita(seguimientoPayload)
    }
  }
}

let procesando = false

export async function procesarColaOffline() {
  // Evita que dos reconexiones casi simultáneas (p. ej. el evento
  // 'online' disparándose dos veces) intenten subir la cola dos veces
  // a la vez.
  if (procesando) return
  procesando = true

  try {
    const pendientes = await listarOperacionesPendientes()
    if (pendientes.length === 0) return

    // Antes de intentar subir nada, confirma que la sesión sigue viva.
    // Si estuvo offline mucho tiempo, el access token pudo expirar —
    // reintentar contra una sesión muerta solo generaría más errores
    // confusos; mejor avisar directo que hace falta iniciar sesión de
    // nuevo antes de poder subir lo pendiente.
    const { data: { session }, error: errorSesion } = await supabase.auth.refreshSession()
    if (errorSesion || !session) {
      toastError(`Tienes ${pendientes.length} cambio(s) sin subir y tu sesión expiró mientras no había conexión. Inicia sesión de nuevo para subirlos.`)
      return
    }

    // Se guarda aquí, no al final: significa "la última vez que se
    // confirmó de verdad que se podía hablar con el servidor para
    // subir la cola" — independiente de si cada operación individual
    // tuvo éxito o no.
    await guardarMetadato(CLAVE_ULTIMA_SINCRONIZACION_COLA, { fecha: new Date().toISOString() })

    let subidas = 0
    let fallidasTransitorias = 0
    let perdidasPorConflicto = 0

    for (const operacion of pendientes) {
      const ejecutor = EJECUTORES[operacion.tipo]
      if (!ejecutor) {
        // Un tipo de operación que este código ya no reconoce (versión
        // vieja de la app guardó algo que esta versión no sabe subir)
        // — se deja en la cola en vez de perderla en silencio.
        fallidasTransitorias++
        continue
      }
      try {
        await marcarSincronizando(operacion.id)
        await ejecutor(operacion.payload)
        await quitarOperacion(operacion.id)
        subidas++
      } catch (err) {
        if (err.message === 'CONFLICTO_CONCURRENCIA') {
          // Reintentar esto para siempre nunca funcionaría — alguien
          // más ya cambió el mismo registro. Se saca de la cola (no
          // tiene caso dejarlo ahí) y se avisa que ESE cambio en
          // particular se perdió, para que la persona lo revise y lo
          // vuelva a hacer sobre los datos actuales si sigue aplicando.
          await quitarOperacion(operacion.id)
          perdidasPorConflicto++
        } else {
          await marcarIntentoFallido(operacion, err.message)
          fallidasTransitorias++
        }
      }
    }

    if (subidas > 0) toastExito(`${subidas} cambio(s) pendiente(s) de cuando no había conexión ya se subieron.`)
    if (perdidasPorConflicto > 0) {
      toastError(`${perdidasPorConflicto} cambio(s) sin conexión no se pudieron subir porque otra persona ya modificó lo mismo mientras tanto. Revisa esos registros y vuelve a hacer el cambio si todavía aplica.`)
    }
    if (fallidasTransitorias > 0) toastError(`${fallidasTransitorias} cambio(s) no se pudieron subir todavía — se reintentará más tarde.`)
  } finally {
    procesando = false
  }
}
