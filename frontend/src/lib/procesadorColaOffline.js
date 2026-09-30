import { supabase } from './supabase'
import { crearNotaClinica, obtenerExpediente } from '../services/expedientes'
import { crearReceta } from '../services/recetas'
import { crearTratamiento } from '../services/tratamientos'
import { agregarSignosVitales } from '../services/signosVitales'
import { actualizarPiezaOdontograma, obtenerPiezaPorNumero } from '../services/odontograma'
import {
  actualizarPiezaPeriodontal,
  actualizarSitioPeriodontal,
  obtenerPiezaPeriodontalPorNumero,
  obtenerSitioPeriodontalPorNombre
} from '../services/periodontograma'
import { actualizarCita, crearCita } from '../services/citas'
import { crearPacienteEnServidor } from '../services/pacientes'
import { listarOperacionesPendientes, quitarOperacion, marcarIntentoFallido, marcarSincronizando, operacionEsDe } from './colaOffline'
import { ordenarPorDependencias, estadoDeDependencias } from './dependenciasCola'
import { esIdOffline, resolverId, guardarMapeoId } from './mapeoIdsOffline'
import { marcarPacienteOfflineSincronizado } from './pacientesOffline'
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
  // El padre de toda la cadena: un paciente creado sin conexión. No
  // tiene dependencias propias — cualquier otra operación que dependa
  // de él lo referencia por su id local (offline-...) en `dependeDe`.
  crear_paciente: (payload) => crearPacienteEnServidor(payload),
  crear_nota_clinica: (payload) => crearNotaClinica(payload),
  crear_tratamiento: (payload) => crearTratamiento(payload),
  crear_signos_vitales: (payload) => agregarSignosVitales(payload),
  // Misma seguridad que crear_nota_clinica: insert nuevo, id generado
  // en el navegador, upsert del lado del servicio — reintentar nunca
  // duplica una receta.
  crear_receta: (payload) => crearReceta(payload),
  // Cita agendada suelta (no la de seguimiento de finalizar_consulta,
  // que va aparte más abajo) — mismo patrón de upsert idempotente,
  // paciente_id se resuelve genérico igual que en recetas/tratamientos.
  crear_cita: (payload) => crearCita(payload),
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

// Antes de ejecutar una operación que depende de un paciente creado
// offline, cambia las referencias al id local por el id real —
// distinto según qué necesite cada tipo de operación:
// - `paciente_id` directo (recetas, y cualquier futura entidad que
//   inserte apuntando al paciente sin pasar por un expediente): se
//   reemplaza el id tal cual, vía el mapeo.
// - `pacienteIdOffline` (notas clínicas: la tabla no tiene paciente_id,
//   tiene expediente_id — y el expediente de un paciente recién creado
//   no existía en el navegador, lo crea un trigger en el servidor).
//   Aquí SÍ hace falta una consulta real (ya hay conexión, se está
//   sincronizando) para averiguar qué expediente le tocó.
// Si el paciente del que depende TODAVÍA no se sincronizó, esto no
// debería llamarse — estadoDeDependencias() ya habría detenido la
// operación antes. Si pasara de todos modos, falla explícito en vez
// de mandar un id a medio resolver.
async function resolverReferenciasOffline(operacion) {
  const payload = { ...operacion.payload }

  if (typeof payload.paciente_id === 'string' && esIdOffline(payload.paciente_id)) {
    const resuelto = await resolverId(payload.paciente_id)
    if (esIdOffline(resuelto)) throw new Error('El paciente del que depende este cambio todavía no se ha sincronizado.')
    payload.paciente_id = resuelto
  }

  if (typeof payload.pacienteIdOffline === 'string') {
    const serverId = await resolverId(payload.pacienteIdOffline)
    if (esIdOffline(serverId)) throw new Error('El paciente del que depende este cambio todavía no se ha sincronizado.')

    if (operacion.tipo === 'actualizar_pieza_odontograma') {
      // El trigger del servidor ya creó las 32 piezas en cuanto el
      // paciente se subió — solo falta encontrar cuál id real le tocó a
      // ESTE número de pieza para poder actualizarla.
      const pieza = await obtenerPiezaPorNumero(serverId, payload.numeroPieza)
      payload.piezaId = pieza.id
      delete payload.numeroPieza
    } else if (operacion.tipo === 'actualizar_pieza_periodontal') {
      const pieza = await obtenerPiezaPeriodontalPorNumero(serverId, payload.numeroPieza)
      payload.piezaId = pieza.id
      delete payload.numeroPieza
    } else if (operacion.tipo === 'actualizar_sitio_periodontal') {
      // Dos búsquedas encadenadas: primero la pieza por número, luego
      // el sitio de ESA pieza por nombre (mesial_v, medio_l, etc.) — el
      // sitio nunca depende de que la operación hermana de la pieza
      // (actualizar_pieza_periodontal) haya corrido antes; ambas solo
      // dependen de que el paciente ya se haya sincronizado.
      const pieza = await obtenerPiezaPeriodontalPorNumero(serverId, payload.numeroPieza)
      const sitio = await obtenerSitioPeriodontalPorNombre(pieza.id, payload.sitio)
      payload.sitioId = sitio.id
      delete payload.numeroPieza
      delete payload.sitio
    } else {
      // crear_nota_clinica: la tabla no tiene paciente_id, tiene
      // expediente_id — y el expediente lo crea otro trigger aparte.
      const expediente = await obtenerExpediente(serverId)
      payload.expediente_id = expediente.id
    }

    delete payload.pacienteIdOffline
  }

  return payload
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

    // Solo se suben las operaciones de la persona que tiene la sesión
    // abierta. Las de otra cuenta se dejan intactas: subirlas con esta
    // sesión las registraría como hechas por quien no las hizo.
    const userId = session.user?.id
    const propias = pendientes.filter((op) => operacionEsDe(op, userId))
    const ajenas = pendientes.length - propias.length
    if (ajenas > 0) {
      toastError(`Hay ${ajenas} cambio(s) de otra cuenta en este equipo. No se subirán con esta sesión; inicia sesión con esa cuenta para subirlos.`)
    }

    let subidas = 0
    let fallidasTransitorias = 0
    let perdidasPorConflicto = 0

    // Un paciente creado offline se sube ANTES que la nota/receta que
    // depende de él — ver lib/dependenciasCola.js. `exitosas` y
    // `perdidasDefinitivas` se van llenando en esta misma corrida: así
    // un hijo cuyo padre se acaba de subir un segundo antes puede
    // ejecutarse en la MISMA pasada, sin esperar a la siguiente.
    const { orden, enCiclo } = ordenarPorDependencias(propias)
    const exitosas = new Set()
    const perdidasDefinitivas = new Set()

    for (const operacion of orden) {
      const estadoDeps = estadoDeDependencias(operacion, { exitosas, perdidasDefinitivas })
      if (estadoDeps === 'esperar') {
        // El padre sigue pendiente (todavía no le tocó turno, o falló
        // transitorio) — se reintenta en la próxima corrida junto con él.
        fallidasTransitorias++
        continue
      }
      if (estadoDeps === 'bloqueada') {
        // El padre del que dependía se perdió para siempre en esta
        // misma corrida (conflicto) — este cambio nunca podría
        // completarse solo. Se cuenta igual que un conflicto directo.
        await quitarOperacion(operacion.id)
        perdidasDefinitivas.add(operacion.id)
        perdidasPorConflicto++
        continue
      }

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
        const payloadResuelto = await resolverReferenciasOffline(operacion)
        const resultado = await ejecutor(payloadResuelto)
        if (operacion.tipo === 'crear_paciente') {
          await guardarMapeoId(operacion.id, resultado.id)
          await marcarPacienteOfflineSincronizado(operacion.id, resultado.id)
        }
        await quitarOperacion(operacion.id)
        exitosas.add(operacion.id)
        subidas++
      } catch (err) {
        if (err.message === 'CONFLICTO_CONCURRENCIA') {
          // Reintentar esto para siempre nunca funcionaría — alguien
          // más ya cambió el mismo registro. Se saca de la cola (no
          // tiene caso dejarlo ahí) y se avisa que ESE cambio en
          // particular se perdió, para que la persona lo revise y lo
          // vuelva a hacer sobre los datos actuales si sigue aplicando.
          await quitarOperacion(operacion.id)
          perdidasDefinitivas.add(operacion.id)
          perdidasPorConflicto++
        } else {
          await marcarIntentoFallido(operacion, err.message)
          fallidasTransitorias++
        }
      }
    }

    // No debería ocurrir con el único tipo de dependencia real de hoy
    // (paciente → entidad clínica, nunca al revés) — si pasara, se deja
    // intacta en la cola: no hay forma segura de decidir sola cuál de
    // las dos "gana".
    fallidasTransitorias += enCiclo.length

    if (subidas > 0) toastExito(`${subidas} cambio(s) pendiente(s) de cuando no había conexión ya se subieron.`)
    if (perdidasPorConflicto > 0) {
      toastError(`${perdidasPorConflicto} cambio(s) sin conexión no se pudieron subir porque otra persona ya modificó lo mismo mientras tanto. Revisa esos registros y vuelve a hacer el cambio si todavía aplica.`)
    }
    if (fallidasTransitorias > 0) toastError(`${fallidasTransitorias} cambio(s) no se pudieron subir todavía — se reintentará más tarde.`)
  } finally {
    procesando = false
  }
}
