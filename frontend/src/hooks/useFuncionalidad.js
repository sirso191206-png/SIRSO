import { usePlanStore } from '../store/usePlanStore'
import { useAuthStore } from '../store/useAuthStore'
import { alMenosUnaDisponible, evaluarAlta, identidadSuscripcion, puedeVerSucursales } from '../lib/planes'

// La suscripción SOLO si pertenece a la identidad (usuario + clínica) de la sesión
// actual. Aunque algo olvidara limpiar el store, nunca se usa la de otra cuenta.
function useSuscripcionVigente() {
  const suscripcion = usePlanStore((s) => s.suscripcion)
  const clave = usePlanStore((s) => s.claveSuscripcion)
  const identidad = useAuthStore((s) => identidadSuscripcion(s.perfil))
  return clave && clave === identidad ? suscripcion : null
}

// Plan actual para mostrar en pantalla (nombre, si son datos guardados, cuándo).
export function usePlanActual() {
  const suscripcion = useSuscripcionVigente()
  const esOffline = usePlanStore((s) => s.esOffline)
  const ultimaActualizacion = usePlanStore((s) => s.ultimaActualizacion)
  const cargada = usePlanStore((s) => s.cargada)
  return { suscripcion, esOffline: suscripcion ? esOffline : false, ultimaActualizacion, cargada }
}

// ¿Mostrar esta funcionalidad (o, con una lista, al menos una de ellas)? Solo oculta
// interfaz: la base de datos (RLS/triggers) es quien realmente la bloquea. El
// personal de plataforma (superadmin) la ve siempre, igual que en la base.
export function useFuncionalidad(codigo) {
  const suscripcion = useSuscripcionVigente()
  const esSuperAdmin = useAuthStore((s) => s.perfil?.es_super_admin)
  return esSuperAdmin ? true : alMenosUnaDisponible(suscripcion, codigo)
}

// ¿Mostrar el módulo Sucursales? (ver puedeVerSucursales). El superadmin siempre lo ve.
export function usePuedeVerSucursales() {
  const suscripcion = useSuscripcionVigente()
  const esSuperAdmin = useAuthStore((s) => s.perfil?.es_super_admin)
  return esSuperAdmin ? true : puedeVerSucursales(suscripcion)
}

// ¿Se puede agregar uno más de `tipo` ('usuarios' | 'sucursales')? → { puede, motivo, usado, limite }.
// Solo oculta el botón: la base de datos rechaza el alta de más (PT402/PT403). El personal de
// plataforma (superadmin) siempre puede.
export function usePuedeAgregar(tipo) {
  const suscripcion = useSuscripcionVigente()
  const esSuperAdmin = useAuthStore((s) => s.perfil?.es_super_admin)
  return esSuperAdmin ? { puede: true, motivo: 'ok', usado: null, limite: null } : evaluarAlta(suscripcion, tipo)
}

// Versión para listas (menús, pestañas): devuelve codigo|codigos → boolean.
export function useDisponibilidad() {
  const suscripcion = useSuscripcionVigente()
  const esSuperAdmin = useAuthStore((s) => s.perfil?.es_super_admin)
  return (codigo) => (esSuperAdmin ? true : alMenosUnaDisponible(suscripcion, codigo))
}
