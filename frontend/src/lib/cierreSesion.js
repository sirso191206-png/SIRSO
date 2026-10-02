import { listarOperacionesPendientes, operacionEsDe } from './colaOffline'
import { vaciarCacheLectura, guardarMetadato, leerMetadato } from './cacheLectura'
import { vaciarCacheAuth } from './cacheAuth'
import { revocarPin } from './pinOffline'
import { vaciarPacientesOffline } from './pacientesOffline'
import { vaciarIndicePacientesOffline } from './indicePacientesOffline'
import { vaciarMapeoIdsOffline } from './mapeoIdsOffline'
import { vaciarReplicaPacientes } from './pacientesReplica'
import { vaciarReplicaCitas } from './citasReplica'
import { vaciarReplicaExpedientes } from './expedientesReplica'

// ══ Cerrar sesión con cambios sin subir ══
// Regla: mientras haya cambios pendientes de ESTA persona, no se puede
// cerrar sesión. Cerrarla borra la caché local y el PIN; si además se
// perdiera la cola, esos cambios clínicos —hechos sin conexión— no
// existirían en ningún otro lugar.
//
// Sin conexión, cerrar sesión también se bloquea, aunque la cola esté
// vacía: signOut() sin red borra la sesión de este equipo pero NO puede
// revocar el token en el servidor, y la sesión seguiría "abierta" allá
// (verificado en el código de auth-js). Poner esto en `true` permite ese
// cierre solo-local cuando no hay nada pendiente.
export const PERMITIR_CIERRE_LOCAL_SIN_CONEXION = false

// Función pura: dada la cola, decide. Toda la lógica de la regla vive
// aquí para poder probarla sin tocar IndexedDB.
export function evaluarOperaciones({ operaciones, userId, conectado }) {
  const propias = operaciones.filter((op) => operacionEsDe(op, userId))
  const porEntidad = {}
  for (const op of propias) {
    const clave = op.entidad ?? op.tipo
    porEntidad[clave] = (porEntidad[clave] ?? 0) + 1
  }
  const base = {
    pendientes: propias.length,
    errores: propias.filter((op) => op.estado === 'error').length,
    porEntidad,
    conectado
  }
  if (propias.length > 0) return { ...base, permitido: false, motivo: 'PENDIENTES' }
  if (!conectado && !PERMITIR_CIERRE_LOCAL_SIN_CONEXION) return { ...base, permitido: false, motivo: 'SIN_CONEXION' }
  return { ...base, permitido: true, motivo: null }
}

export async function evaluarCierreDeSesion({ userId, conectado }) {
  let operaciones
  try {
    operaciones = await listarOperacionesPendientes()
  } catch {
    // Si no se puede leer la cola no se puede PROBAR que esté vacía: se
    // bloquea, en vez de arriesgar cambios clínicos sin subir.
    return { permitido: false, motivo: 'COLA_ILEGIBLE', pendientes: 0, errores: 0, porEntidad: {}, conectado }
  }
  return evaluarOperaciones({ operaciones, userId, conectado })
}

// ══ Limpieza local ══
// Borra lo que identifica y expone a la persona que sale: lecturas
// clínicas, perfil (con cédula y firma) y PIN. NUNCA toca la cola de
// operaciones pendientes: si un cierre forzado (sesión revocada desde
// otro dispositivo) ocurre con cambios sin subir, esos cambios se
// conservan para subirse la próxima vez que esa misma cuenta inicie
// sesión.
export async function limpiarDatosLocalesDeSesion() {
  await Promise.allSettled([
    vaciarCacheLectura(),
    vaciarCacheAuth(),
    revocarPin(),
    vaciarPacientesOffline(),
    vaciarIndicePacientesOffline(),
    vaciarMapeoIdsOffline(),
    vaciarReplicaPacientes(),
    vaciarReplicaCitas(),
    vaciarReplicaExpedientes()
  ])
}

// ══ Un equipo, varias personas ══
// La caché de lectura no distingue usuarios en sus claves. Al iniciar
// sesión con internet se comprueba de quién es lo guardado: si es de
// otra persona (o de un dueño desconocido, anterior a esta protección),
// se vacía antes de usarla. Sin esto, alguien que iniciara sesión en un
// equipo donde la sesión anterior murió sin cerrarse, y se quedara sin
// red, podría ver datos clínicos ajenos — offline no aplica RLS.
const CLAVE_DUENO_CACHE = 'usuario_dueno_de_la_cache'

export async function asegurarCacheDeEsteUsuario(userId) {
  try {
    const dueno = await leerMetadato(CLAVE_DUENO_CACHE)
    if (dueno === userId) return
    // No solo la caché de lectura: el índice de búsqueda de pacientes
    // y los pacientes creados offline son datos clínicos de la cuenta
    // ANTERIOR (de otra clínica, probablemente) — RLS no aplica sin
    // conexión, así que esto es la única barrera. La cola de
    // operaciones (siro-cola-offline) nunca se toca aquí: si la cuenta
    // anterior tenía algo sin subir, sigue intacto para cuando vuelva
    // a iniciar sesión.
    await Promise.allSettled([
      vaciarCacheLectura(),
      vaciarPacientesOffline(),
      vaciarIndicePacientesOffline(),
      vaciarMapeoIdsOffline(),
      vaciarReplicaPacientes(),
      vaciarReplicaCitas(),
      vaciarReplicaExpedientes()
    ])
    await guardarMetadato(CLAVE_DUENO_CACHE, userId)
  } catch {
    // Si IndexedDB falla no hay caché que proteger ni que ensuciar.
  }
}
