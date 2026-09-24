import { supabase } from '../lib/supabase'

const ESTADOS_ARCO = [
  'recibida', 'en_revision', 'requiere_informacion', 'aprobada', 'rechazada', 'atendida', 'cerrada'
]

export { ESTADOS_ARCO }

// Público — cualquiera puede levantar una solicitud, con o sin sesión.
export async function crearSolicitudArco(solicitud) {
  const { data, error } = await supabase
    .from('arco_solicitudes')
    .insert(solicitud)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listarSolicitudesDeClinica() {
  const { data, error } = await supabase
    .from('arco_solicitudes')
    .select('*, responsable:usuarios!arco_solicitudes_responsable_id_fkey(nombre)')
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export async function actualizarSolicitudArco(id, cambios) {
  const { data, error } = await supabase
    .from('arco_solicitudes')
    .update(cambios)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Registra que un humano (el owner) confirmó por su cuenta — teléfono,
// en persona, u otro medio — que quien pidió esto es quien dice ser.
// La base de datos exige que esto se haya hecho antes de permitir
// marcar la solicitud como aprobada o atendida (ver migración 059).
export async function marcarIdentidadVerificada(id, { usuarioId, metodo }) {
  const { data, error } = await supabase
    .from('arco_solicitudes')
    .update({
      identidad_verificada: true,
      identidad_verificada_por: usuarioId,
      identidad_verificada_en: new Date().toISOString(),
      metodo_verificacion: metodo || null
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
