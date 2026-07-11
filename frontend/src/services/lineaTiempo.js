import { supabase } from '../lib/supabase'

// La línea del tiempo NO usa la tabla `auditoria` (esa es de solo lectura
// para el owner, pensada para seguridad del sistema completo). Aquí se
// arma un feed clínico por paciente combinando eventos de las tablas que
// ya existen — visible para owner y dentista, igual que el resto del
// expediente.

export async function obtenerLineaTiempo(pacienteId) {
  const LIMITE_POR_FUENTE = 50 // techo razonable por tabla; evita traer años de historial de golpe

  const { data: expediente, error: errorExpediente } = await supabase
    .from('expedientes')
    .select('id')
    .eq('paciente_id', pacienteId)
    .single()
  if (errorExpediente) throw errorExpediente

  const [paciente, citas, pagos, tratamientos, fotos, notas, documentos] = await Promise.all([
    supabase.from('pacientes').select('nombre_completo, creado_en').eq('id', pacienteId).single(),
    supabase.from('citas').select('id, inicio, estado').eq('paciente_id', pacienteId).order('inicio', { ascending: false }).limit(LIMITE_POR_FUENTE),
    supabase.from('pagos').select('id, monto, tipo, creado_en').eq('paciente_id', pacienteId).order('creado_en', { ascending: false }).limit(LIMITE_POR_FUENTE),
    supabase.from('tratamientos').select('id, descripcion, estado, completado_en, creado_en').eq('paciente_id', pacienteId).order('creado_en', { ascending: false }).limit(LIMITE_POR_FUENTE),
    supabase.from('fotografias').select('id, etiqueta, fecha_captura').eq('paciente_id', pacienteId).order('fecha_captura', { ascending: false }).limit(LIMITE_POR_FUENTE),
    supabase.from('notas_clinicas').select('id, contenido, creado_en').eq('expediente_id', expediente.id).is('version_anterior_id', null).order('creado_en', { ascending: false }).limit(LIMITE_POR_FUENTE),
    supabase.from('documentos_clinicos').select('id, nombre, tipo, creado_en').eq('paciente_id', pacienteId).order('creado_en', { ascending: false }).limit(LIMITE_POR_FUENTE)
  ])

  for (const r of [paciente, citas, pagos, tratamientos, fotos, notas, documentos]) {
    if (r.error) throw r.error
  }

  const eventos = []

  eventos.push({
    id: `paciente-${pacienteId}`,
    fecha: paciente.data.creado_en,
    texto: 'Paciente registrado',
    tipo: 'paciente'
  })

  for (const c of citas.data) {
    eventos.push({
      id: `cita-${c.id}`,
      fecha: c.inicio,
      texto: `Cita ${etiquetaEstadoCita(c.estado)}`,
      tipo: 'cita'
    })
  }

  for (const p of pagos.data) {
    eventos.push({
      id: `pago-${p.id}`,
      fecha: p.creado_en,
      texto: `Pago registrado — $${Number(p.monto).toFixed(2)} (${p.tipo})`,
      tipo: 'pago'
    })
  }

  for (const t of tratamientos.data) {
    eventos.push({
      id: `tratamiento-creado-${t.id}`,
      fecha: t.creado_en,
      texto: `Tratamiento agregado: ${t.descripcion}`,
      tipo: 'tratamiento'
    })
    if (t.completado_en) {
      eventos.push({
        id: `tratamiento-completado-${t.id}`,
        fecha: t.completado_en,
        texto: `Tratamiento completado: ${t.descripcion}`,
        tipo: 'tratamiento'
      })
    }
  }

  for (const f of fotos.data) {
    eventos.push({
      id: `foto-${f.id}`,
      fecha: f.fecha_captura,
      texto: `Fotografía agregada (${f.etiqueta})`,
      tipo: 'foto'
    })
  }

  for (const n of notas.data) {
    eventos.push({
      id: `nota-${n.id}`,
      fecha: n.creado_en,
      texto: `Nota clínica: ${n.contenido.slice(0, 60)}${n.contenido.length > 60 ? '…' : ''}`,
      tipo: 'nota'
    })
  }

  for (const d of documentos.data) {
    eventos.push({
      id: `documento-${d.id}`,
      fecha: d.creado_en,
      texto: `Documento agregado: ${d.nombre} (${d.tipo})`,
      tipo: 'documento'
    })
  }

  return eventos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
}

function etiquetaEstadoCita(estado) {
  const mapa = {
    pendiente_confirmar: 'agendada (pendiente de confirmar)',
    agendada: 'agendada',
    confirmada: 'confirmada',
    en_espera: 'en espera',
    en_consulta: 'en consulta',
    completada: 'completada',
    cancelada: 'cancelada',
    no_asistio: 'marcada como no asistió'
  }
  return mapa[estado] ?? estado
}
