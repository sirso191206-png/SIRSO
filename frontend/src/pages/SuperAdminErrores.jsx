import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/useAuthStore'

// Errores de la aplicación (migración 116): del navegador y de las Edge Functions de cobro. Solo superadmin.
// Los críticos (p. ej. el webhook de Stripe) además llegan por correo a CORREO_SOPORTE.
export function SuperAdminErrores() {
  const perfil = useAuthStore((s) => s.perfil)
  const [errores, setErrores] = useState(null)
  const [fallo, setFallo] = useState('')
  const [filtro, setFiltro] = useState('todos')

  useEffect(() => {
    if (!perfil?.es_super_admin) return
    supabase.rpc('sa_errores_app', { p_limite: 300 }).then(({ data, error }) => {
      if (error) setFallo(error.message)
      else setErrores(data ?? [])
    })
  }, [perfil?.es_super_admin])

  if (!perfil?.es_super_admin) return <p className="text-slate-400">No autorizado.</p>
  const lista = (errores ?? []).filter((e) => filtro === 'todos' || e.origen === filtro || (filtro === 'critico' && e.gravedad === 'critico'))

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-slate-800">Errores de la aplicación</h1>
      <p className="mb-4 text-sm text-slate-500">
        Últimos 300 (se conservan 90 días). Sin datos de pacientes: solo la pantalla o función, el mensaje y el detalle técnico.
      </p>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {[['todos', 'Todos'], ['critico', 'Críticos'], ['edge', 'Funciones'], ['frontend', 'Navegador']].map(([v, t]) => (
          <button key={v} type="button" onClick={() => setFiltro(v)}
            className={`rounded-lg border px-3 py-1 ${filtro === v ? 'border-clinico-azul bg-clinico-azul text-white' : 'border-slate-200 text-slate-600'}`}>{t}</button>
        ))}
      </div>
      {fallo && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{fallo}</p>}
      {!errores && !fallo && <p className="text-sm text-slate-400">Cargando…</p>}
      {errores && lista.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Sin errores registrados. 🎉</p>}
      {lista.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr><th className="px-3 py-2">Fecha</th><th>Origen</th><th>Pantalla / función</th><th>Clínica</th><th>Mensaje</th></tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap px-3 py-2">{new Date(e.creado_en).toLocaleString('es-MX')}</td>
                  <td className={e.gravedad === 'critico' ? 'font-medium text-red-700' : 'text-slate-600'}>{e.origen === 'edge' ? 'Función' : 'Navegador'}{e.gravedad === 'critico' ? ' · crítico' : ''}</td>
                  <td className="font-mono text-xs">{e.ruta}</td>
                  <td>{e.clinica_nombre ?? '—'}</td>
                  <td>
                    <div>{e.mensaje}</div>
                    {e.detalle && <details className="mt-1 text-xs text-slate-500"><summary className="cursor-pointer">Detalle</summary><pre className="whitespace-pre-wrap">{e.detalle}</pre></details>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
