import { supabase } from '../lib/supabase'

export const TAMANO_PAGINA = 50

// Auditoría de LA clínica del usuario. El aislamiento NO depende de este código: la política de la base
// (migración 081) solo devuelve las filas de su clínica; el superadmin ve todas. Los filtros solo acotan.
// `tipo`: 'crear' | 'editar' | 'eliminar' | 'otros' (todo lo que no es de esos tres).
export async function listarAuditoria({ desde, hasta, usuarioId, entidad, tipo, pagina = 0 } = {}) {
  let q = supabase
    .from('auditoria')
    .select('id, creado_en, accion, entidad, entidad_id, usuario_id, usuario:usuarios(nombre)', { count: 'exact' })
    .order('creado_en', { ascending: false })
    .range(pagina * TAMANO_PAGINA, pagina * TAMANO_PAGINA + TAMANO_PAGINA - 1)
  if (desde) q = q.gte('creado_en', desde)
  if (hasta) q = q.lte('creado_en', hasta)
  if (usuarioId) q = q.eq('usuario_id', usuarioId)
  if (entidad) q = q.eq('entidad', entidad)
  if (tipo === 'crear' || tipo === 'editar' || tipo === 'eliminar') q = q.like('accion', `${tipo}\\_%`)
  if (tipo === 'otros') q = q.not('accion', 'like', 'crear\\_%').not('accion', 'like', 'editar\\_%').not('accion', 'like', 'eliminar\\_%')
  const { data, error, count } = await q
  if (error) throw error
  return { filas: data ?? [], total: count ?? 0 }
}

// Usuarios de la clínica para el filtro (la política de `usuarios` ya los limita a la propia clínica).
export async function listarUsuariosParaFiltro() {
  const { data, error } = await supabase.from('usuarios').select('id, nombre').order('nombre')
  if (error) throw error
  return data ?? []
}

// Deja constancia de que alguien EXPORTÓ información (acción crítica que debe quedar registrada). La clínica
// la fija el servidor; aquí solo se manda quién, qué y cuántas filas.
export async function registrarExportacion({ usuarioId, entidad, filas, filtros }) {
  const { error } = await supabase.from('auditoria').insert({
    usuario_id: usuarioId,
    accion: 'exportar',
    entidad,
    detalle: { filas, filtros: filtros ?? {} }
  })
  if (error) throw error
}
