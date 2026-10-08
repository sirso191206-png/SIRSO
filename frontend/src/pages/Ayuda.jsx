import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { useDisponibilidad } from '../hooks/useFuncionalidad'
import { CATEGORIAS_AYUDA, GUIAS_AYUDA, buscarGuias, guiasVisibles } from '../lib/ayuda'

// Centro de ayuda: guías cortas de lo que SIRO hace hoy. Solo se muestran las que corresponden al rol de la persona y
// a lo que incluye el plan de su clínica.
export function Ayuda() {
  const perfil = useAuthStore((s) => s.perfil)
  const disponible = useDisponibilidad()
  const [texto, setTexto] = useState('')
  const visibles = buscarGuias(guiasVisibles(GUIAS_AYUDA, { rol: perfil?.rol, esSuperAdmin: !!perfil?.es_super_admin, disponible }), texto)

  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-semibold text-slate-800">Centro de ayuda</h1>
      <p className="mb-5 text-sm text-slate-500">Guías cortas para usar SIRO. Solo ves las que corresponden a tu rol y al plan de tu clínica.</p>
      <label className="mb-6 block text-xs text-slate-500">Buscar en la ayuda
        <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej. receta, pago, sin conexión…"
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
      </label>

      {visibles.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No encontramos guías con esa búsqueda.</p>}

      {CATEGORIAS_AYUDA.map((cat) => {
        const guias = visibles.filter((g) => g.categoria === cat)
        if (guias.length === 0) return null
        return (
          <section key={cat} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">{cat}</h2>
            <div className="space-y-2">
              {guias.map((g) => (
                <details key={g.id} className="rounded-xl border border-slate-200 bg-white p-4" open={texto.trim() !== ''}>
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">
                    {g.titulo} <span className="ml-1 font-normal text-slate-400">— {g.resumen}</span>
                  </summary>
                  <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
                    {g.pasos.map((p) => <li key={p}>{p}</li>)}
                  </ol>
                </details>
              ))}
            </div>
          </section>
        )
      })}

      <p className="mt-8 text-sm text-slate-500">¿No encontraste lo que buscas? <Link to="/contacto" className="text-clinico-azul hover:underline">Contacta a SIRO</Link>.</p>
    </div>
  )
}
