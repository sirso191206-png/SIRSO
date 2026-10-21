import { invocarFuncionAutenticada, supabase } from '../lib/supabase'
import { guardarMetadato, leerMetadato } from '../lib/cacheLectura'
import { esErrorDeRed } from '../lib/errorDeRed'
import { claveCacheSuscripcion, identidadSuscripcion } from '../lib/planes'
import { useAuthStore } from '../store/useAuthStore'

// Todas las funciones sa_* exigen ser superadmin EN LA BASE DE DATOS (cada una
// se autoverifica, migración 075): que aquí se llamen solo desde pantallas de
// superadmin es comodidad de interfaz, no seguridad.

async function rpc(nombre, parametros) {
  const { data, error } = await supabase.rpc(nombre, parametros)
  if (error) throw error
  return data
}

// ---------- Planes ----------
export const listarPlanes = () => rpc('sa_listar_planes')
export const funcionalidadesDePlan = (plan) => rpc('sa_funcionalidades_de_plan', { p_plan: plan })
export const clinicasDePlan = (plan) => rpc('sa_clinicas_de_plan', { p_plan: plan })
export const guardarPlan = (plan) => rpc('sa_guardar_plan', { p: plan })
export const activarPlan = (plan, activo) => rpc('sa_activar_plan', { p_plan: plan, p_activo: activo })
export const duplicarPlan = (origen, nuevo, nombre) =>
  rpc('sa_duplicar_plan', { p_origen: origen, p_nuevo: nuevo, p_nombre: nombre })

// mapa { codigo: true|false }
export const guardarFuncionalidadesDePlan = (plan, mapa) =>
  rpc('sa_set_plan_funcionalidades', { p_plan: plan, p_funcionalidades: mapa })

// Crear/editar una funcionalidad del catálogo. `planes` (opcional): códigos de
// plan donde se habilita; `aplicarASuscripciones`: decisión EXPLÍCITA de dársela
// también a las clínicas ya contratadas de esos planes.
export const guardarFuncionalidad = (funcionalidad, planes = null, aplicarASuscripciones = false) =>
  rpc('sa_guardar_funcionalidad', { p: funcionalidad, p_planes: planes, p_aplicar_a_suscripciones: aplicarASuscripciones })

export const historialPlanes = (limite = 100) => rpc('sa_historial_planes', { p_limite: limite })

// ---------- Suscripción de una clínica ----------
export const suscripcionDeClinica = (clinicaId) => rpc('sa_suscripcion_de_clinica', { p_clinica: clinicaId })

// Asigna o CAMBIA el plan: crea una suscripción nueva con su snapshot y deja la
// anterior como historial. Con el mismo plan = "aplicar las condiciones actuales".
// Devuelve { suscripcion_id, origen, excesos } — `excesos` avisa si la clínica ya
// supera algún límite del nuevo plan (nunca se borra nada).
export const asignarPlanClinica = ({ clinicaId, plan, modalidad, precio = null, fechaInicio = null, fechaFin = null, autoRenovacion = true }) =>
  rpc('sa_asignar_plan_clinica', {
    p_clinica: clinicaId, p_plan: plan, p_modalidad: modalidad, p_precio: precio,
    p_fecha_inicio: fechaInicio, p_fecha_fin: fechaFin, p_auto_renovacion: autoRenovacion
  })

// limites: { max_pacientes, max_usuarios, max_sucursales, max_sesiones, max_almacenamiento_mb }
// (null = ilimitado; omitir una llave = no tocarla). funcionalidades: { codigo: bool }.
export const ajustarCondicionesClinica = (clinicaId, limites = null, funcionalidades = null) =>
  rpc('sa_ajustar_condiciones_clinica', { p_clinica: clinicaId, p_limites: limites, p_funcionalidades: funcionalidades })

export const suspenderSuscripcion = (clinicaId, motivo = null) =>
  rpc('sa_suspender_suscripcion', { p_clinica: clinicaId, p_motivo: motivo })
export const reactivarSuscripcion = (clinicaId) => rpc('sa_reactivar_suscripcion', { p_clinica: clinicaId })

// ---------- Lo que ve la propia clínica ----------
// Suscripción de la clínica de la SESIÓN ACTUAL (rpc mi_suscripcion). La fuente de
// verdad es siempre Supabase; la caché local solo sirve para que menús y panel
// funcionen sin conexión.
//
// Caché: una clave POR USUARIO Y CLÍNICA (`siro:mi-suscripcion:<user>:<clinica>`),
// nunca una global — la suscripción de una cuenta no puede aparecerle a otra en el
// mismo navegador. Se vacía al cerrar sesión o cambiar de cuenta (cacheLectura).
//
// Cae a la caché SOLO si falló la RED. Cualquier otra respuesta del servidor
// (no autorizado, sesión vencida…) se propaga SIN modificar: un rechazo no se
// tapa con un plan viejo — que podría ser más permisivo que el actual.
// Devuelve { suscripcion, deCache, guardadoEn }.
export async function obtenerMiSuscripcion() {
  const perfil = useAuthStore.getState().perfil
  const clave = identidadSuscripcion(perfil) ? claveCacheSuscripcion(perfil.id, perfil.clinica_id) : null
  try {
    const suscripcion = await rpc('mi_suscripcion')
    const guardadoEn = Date.now()
    if (clave) guardarMetadato(clave, { suscripcion, guardadoEn }).catch(() => {})
    return { suscripcion, deCache: false, guardadoEn }
  } catch (err) {
    if (!clave || !esErrorDeRed(err)) throw err
    const guardado = await leerMetadato(clave).catch(() => null)
    if (guardado && guardado.suscripcion !== undefined) {
      return { suscripcion: guardado.suscripcion, deCache: true, guardadoEn: guardado.guardadoEn ?? null }
    }
    throw err
  }
}

// ---------- Pago en línea con Stripe (migración 114) ----------
// Solo el owner. La base decide qué planes se pueden pagar y con qué precio; aquí solo se elige.
export const obtenerMiCobro = () => rpc('mi_cobro')

// Devuelve la URL de Stripe Checkout; la pantalla redirige ahí. El plan se aplica cuando Stripe confirma el pago (webhook).
export async function iniciarPagoEnLinea(plan, modalidad) {
  const data = await invocarFuncionAutenticada('stripe-checkout', { body: { plan, modalidad } })
  if (typeof data?.url !== 'string' || !data.url.startsWith('https://checkout.stripe.com/')) throw new Error('Stripe no devolvió una página de pago válida.')
  return data.url
}

// Portal de Stripe: tarjeta, cambio de plan, cancelación y recibos.
export async function abrirPortalDePago() {
  const data = await invocarFuncionAutenticada('stripe-portal', { body: {} })
  if (typeof data?.url !== 'string' || !data.url.startsWith('https://billing.stripe.com/')) throw new Error('Stripe no devolvió el portal de pago.')
  return data.url
}

// Superadmin: asocia un plan con sus precios de Stripe (null = ese plan/modalidad no se paga en línea).
export const configurarStripePlan = (plan, priceMensual, priceAnual) =>
  rpc('sa_configurar_stripe_plan', { p_plan: plan, p_price_mensual: priceMensual, p_price_anual: priceAnual })
