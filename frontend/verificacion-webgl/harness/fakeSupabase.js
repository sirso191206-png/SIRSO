// Supabase simulado SOLO para el banco de pruebas: sirve 32 piezas por paciente, con latencia y fallos inyectables.
import { piezasOfflineIniciales } from '../../src/lib/odontogramaOffline.js'
const estado = (window.__fake = { latencia: 25, fallar: false, llamadas: [], fallosRestantes: 0 })
const piezasDe = (pacienteId) => piezasOfflineIniciales().map((p) => ({ ...p, id: `${pacienteId}-${p.numero_pieza}`, paciente_id: pacienteId,
  estado: ['11', '21', '36'].includes(p.numero_pieza) ? 'caries' : 'sano', caras: ['oclusal', 'vestibular', 'lingual', 'mesial', 'distal'].map((c) => ({ id: `${pacienteId}-${p.numero_pieza}-${c}`, cara: c, estado: 'sano' })) }))
function consulta(tabla) {
  const ops = []
  const proxy = new Proxy({}, { get(_, prop) {
    if (typeof prop === 'symbol') return undefined
    if (prop === 'then') return (ok, ko) => {
      estado.llamadas.push({ tabla, ops: ops.map(([m, a]) => `${m}(${a.map(String).join(',')})`).join('.') })
      setTimeout(() => {
        if (estado.fallar || estado.fallosRestantes > 0) { if (estado.fallosRestantes > 0) estado.fallosRestantes--; return ok({ data: null, error: { message: 'Service Unavailable', code: '503' } }) }
        const eqPac = ops.find(([m, a]) => m === 'eq' && a[0] === 'paciente_id')
        if (tabla === 'odontograma_piezas') return ok({ data: piezasDe(eqPac?.[1][1] ?? 'p?'), error: null })
        return ok({ data: ops.some(([m]) => m === 'single' || m === 'maybeSingle') ? null : [], error: null })
      }, estado.latencia)
    }
    return (...a) => { ops.push([prop, a]); return proxy }
  } })
  return proxy
}
const canal = () => { const c = { on: () => c, subscribe: () => c, unsubscribe() {} }; return c }
export const supabase = {
  from: consulta, rpc: () => consulta('rpc'), channel: canal, removeChannel() {},
  auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: { session: null } }) },
  storage: { from: () => ({}) }, functions: { invoke: async () => ({ data: null, error: null }) }
}
export const invocarFuncionAutenticada = async () => null
