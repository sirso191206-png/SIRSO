import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { supabase } from '../lib/supabase'

const CHECKLIST = [
  { item: 'Aviso de privacidad simplificado', estado: 'PARCIAL', nota: 'Estructura y contenido en borrador — pendiente de revisión legal profesional.' },
  { item: 'Aviso de privacidad integral', estado: 'PARCIAL', nota: 'Igual — borrador con secciones [TODO LEGAL] donde corresponde.' },
  { item: 'Términos y condiciones', estado: 'PARCIAL', nota: 'Borrador — jurisdicción, modelo de pagos y límites de responsabilidad marcados [TODO LEGAL].' },
  { item: 'Cookies / tecnologías de almacenamiento', estado: 'COMPLETO', nota: 'Inventario real verificado contra el código — sin cookies de rastreo.' },
  { item: 'Consentimientos (legales)', estado: 'COMPLETO', nota: 'legal_acceptances — evidencia inmutable por diseño.' },
  { item: 'Consentimientos (clínicos)', estado: 'PARCIAL', nota: 'Creación/revocación/cancelación listos. Firma remota (borrador/pendiente) no construida.' },
  { item: 'ARCO', estado: 'PARCIAL', nota: 'Límite anti-spam (3/correo/24h, a nivel de base de datos) + honeypot implementados. La base de datos exige marcar "identidad verificada" antes de aprobar/atender una solicitud — pero esa verificación la sigue haciendo un humano por su cuenta (teléfono, en persona); SIRO no verifica identidad de forma automática.' },
  { item: 'Auditoría', estado: 'PARCIAL', nota: 'Cimiento listo (tabla + evento de lectura). Falta instrumentar cada pantalla (LOGIN, PATIENT_VIEWED, XRAY_VIEWED…).' },
  { item: 'Seguridad', estado: 'PARCIAL', nota: 'Documento describe medidas reales. Control de sesiones por dispositivo específico no es técnicamente posible sin una Edge Function adicional.' },
  { item: 'Retención', estado: 'REQUIERE REVISIÓN JURÍDICA', nota: 'Plazos marcados "Definir con asesoría jurídica" a propósito — ningún plazo fue inventado.' },
  { item: 'Acuerdo de tratamiento de datos', estado: 'PARCIAL', nota: 'Borrador — calificación jurídica responsable/encargado no afirmada de forma absoluta.' },
  { item: 'Proveedores', estado: 'COMPLETO', nota: 'Inventario real: Supabase, Vercel, Resend — verificado contra el código.' },
  { item: 'RLS', estado: 'COMPLETO', nota: 'Auditado extensamente en rondas anteriores; todo lo nuevo de este módulo sigue el mismo patrón.' },
  { item: 'Storage', estado: 'COMPLETO', nota: 'Buckets privados, revisados en auditoría previa del proyecto.' },
  { item: 'Exportación', estado: 'PARCIAL', nota: 'JSON implementado y auditado. PDF reutiliza la impresión de expediente ya existente. CSV no se construyó.' },
  { item: 'Incidentes', estado: 'COMPLETO', nota: 'Registro estructurado, visible solo para owner/super_admin.' },
  { item: 'Versionado de documentos legales', estado: 'COMPLETO', nota: 'legal_documents — nunca se sobrescribe, siempre nueva versión.' }
]

const COLOR_ESTADO = {
  COMPLETO: 'bg-green-100 text-green-800',
  PARCIAL: 'bg-amber-100 text-amber-800',
  PENDIENTE: 'bg-slate-100 text-slate-600',
  'REQUIERE REVISIÓN JURÍDICA': 'bg-red-100 text-red-800'
}

export function AdminLegal() {
  const perfil = useAuthStore((s) => s.perfil)
  const [conteos, setConteos] = useState(null)

  useEffect(() => {
    async function cargar() {
      const [documentos, arco, incidentes] = await Promise.all([
        supabase.from('legal_documents').select('id', { count: 'exact', head: true }).eq('activo', true),
        supabase.from('arco_solicitudes').select('id', { count: 'exact', head: true }).not('estado', 'in', '(atendida,cerrada,rechazada)'),
        supabase.from('incidentes_seguridad').select('id', { count: 'exact', head: true }).not('estado', 'in', '(resuelto,cerrado)')
      ])
      setConteos({
        documentosActivos: documentos.count ?? 0,
        arcoAbiertas: arco.count ?? 0,
        incidentesAbiertos: incidentes.count ?? 0
      })
    }
    if (perfil?.es_super_admin) cargar()
  }, [perfil?.es_super_admin])

  if (!perfil?.es_super_admin) {
    return <p className="text-slate-400">Esta sección solo está disponible para el super administrador de SIRO.</p>
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-800">Panel legal — SIRO</h1>

      {conteos && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-400">Documentos legales activos</div>
            <div className="text-2xl font-bold text-slate-800">{conteos.documentosActivos}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-400">Solicitudes ARCO abiertas</div>
            <div className="text-2xl font-bold text-clinico-ambar">{conteos.arcoAbiertas}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-400">Incidentes abiertos</div>
            <div className="text-2xl font-bold text-clinico-rojo">{conteos.incidentesAbiertos}</div>
          </div>
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold text-slate-800">Checklist de preparación legal</h2>
      <div className="space-y-2">
        {CHECKLIST.map((c) => (
          <div key={c.item} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">{c.item}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR_ESTADO[c.estado]}`}>{c.estado}</span>
            </div>
            <p className="text-xs text-slate-400">{c.nota}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
