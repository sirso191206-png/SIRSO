import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { supabase } from '../lib/supabase'

const CHECKLIST = [
  { item: 'Aviso de privacidad simplificado', estado: 'COMPLETO', nota: 'Versión 1.0 publicada (migración 106) con la identidad del titular de SIRO. Aprobado para su uso por la dirección de SIRO (30/10/2026).' },
  { item: 'Aviso de privacidad integral', estado: 'COMPLETO', nota: 'Versión 1.0 publicada (migración 106); cita artículos de la Ley vigente (texto oficial, reforma DOF 14-11-2025). Aprobado para su uso por la dirección de SIRO (30/10/2026).' },
  { item: 'Términos y condiciones', estado: 'COMPLETO', nota: 'Versión 1.0 publicada (migración 106). Aprobado para su uso por la dirección de SIRO (30/10/2026).' },
  { item: 'Cookies / tecnologías de almacenamiento', estado: 'COMPLETO', nota: 'Inventario real verificado contra el código — sin cookies de rastreo.' },
  { item: 'Consentimientos (legales)', estado: 'COMPLETO', nota: 'legal_acceptances: evidencia inmutable; desde la migración 106 la versión y la fecha las fija el servidor y la aplicación solicita la aceptación al iniciar sesión.' },
  { item: 'Consentimientos (clínicos)', estado: 'CERRADO', nota: 'Creación, firma en la clínica, revocación y cancelación. La firma remota queda fuera del alcance de esta versión.' },
  { item: 'ARCO', estado: 'CERRADO', nota: 'Límite anti-spam (3/correo/24h, a nivel de base de datos) + honeypot implementados. La base de datos exige marcar "identidad verificada" antes de aprobar/atender una solicitud — pero esa verificación la sigue haciendo un humano por su cuenta (teléfono, en persona); SIRO no verifica identidad de forma automática.' },
  { item: 'Auditoría', estado: 'CERRADO', nota: 'Registro de cambios importantes y de accesos (migraciones 100 y 120), visible para el propietario. La auditoría de cada lectura de pantalla queda fuera del alcance de esta versión.' },
  { item: 'Seguridad', estado: 'COMPLETO', nota: 'Versión 1.0 publicada (migración 106): solo medidas reales (panel de sesiones, cambio obligatorio de contraseña temporal, aislamiento por RLS, auditoría).' },
  { item: 'Retención', estado: 'COMPLETO', nota: 'Versión 1.0 publicada (migración 106) conforme a la política implementada (migraciones 087–104); sin plazos inventados. El bloqueo se aplica de forma administrativa (no hay estado técnico).' },
  { item: 'Acuerdo de tratamiento de datos', estado: 'COMPLETO', nota: 'Versión 1.0 publicada (migración 106): SIRO como encargado de los datos de pacientes y responsable de los datos de cuenta. La aceptan los propietarios al iniciar sesión.' },
  { item: 'Proveedores', estado: 'COMPLETO', nota: 'Inventario real: Supabase, Vercel, Resend — verificado contra el código.' },
  { item: 'RLS', estado: 'COMPLETO', nota: 'Auditado extensamente en rondas anteriores; todo lo nuevo de este módulo sigue el mismo patrón.' },
  { item: 'Storage', estado: 'COMPLETO', nota: 'Buckets privados, revisados en auditoría previa del proyecto.' },
  { item: 'Exportación', estado: 'CERRADO', nota: 'JSON implementado y auditado; PDF mediante la impresión del expediente. CSV queda fuera del alcance de esta versión.' },
  { item: 'Incidentes', estado: 'COMPLETO', nota: 'Registro estructurado, visible solo para owner/super_admin.' },
  { item: 'Contabilidad y facturación', estado: 'CERRADO', nota: 'Cerrado por la dirección (30/10/2026): SIRO emite recibos de pago (no sustituyen una factura fiscal); la facturación (CFDI) queda fuera del alcance de esta versión.' },
  { item: 'Versionado de documentos legales', estado: 'COMPLETO', nota: 'legal_documents — nunca se sobrescribe, siempre nueva versión.' }
]

const COLOR_ESTADO = {
  COMPLETO: 'bg-green-100 text-green-800',
  CERRADO: 'bg-sky-100 text-sky-800',
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
