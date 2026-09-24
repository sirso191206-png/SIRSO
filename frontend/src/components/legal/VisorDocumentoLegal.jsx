import { useEffect, useState } from 'react'
import { obtenerDocumentoActivo } from '../../services/legal'
import { obtenerMiClinica } from '../../services/clinicas'
import { construirVariablesDocumento, sustituirVariables } from '../../lib/plantillaLegal'
import { useAuthStore } from '../../store/useAuthStore'

// Muestra el documento ACTIVO de un tipo dado. Si hay sesión iniciada,
// usa la clínica del usuario (su propia versión si la publicó, o la de
// SIRO si no); sin sesión, siempre muestra la versión de plataforma —
// no hay forma de saber a qué clínica pertenece un visitante anónimo.
export function VisorDocumentoLegal({ tipo }) {
  const perfil = useAuthStore((s) => s.perfil)
  const [documento, setDocumento] = useState(null)
  const [clinica, setClinica] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let activo = true
    async function cargar() {
      setCargando(true)
      setError(null)
      try {
        const doc = await obtenerDocumentoActivo(tipo, perfil?.clinica_id ?? null)
        if (!activo) return
        setDocumento(doc)
        if (doc && perfil?.clinica_id) {
          const c = await obtenerMiClinica(perfil.clinica_id)
          if (activo) setClinica(c)
        } else {
          setClinica(null)
        }
      } catch (err) {
        if (activo) setError(err.message)
      } finally {
        if (activo) setCargando(false)
      }
    }
    cargar()
    return () => { activo = false }
  }, [tipo, perfil?.clinica_id])

  if (cargando) return <p className="text-slate-400">Cargando…</p>
  if (error) return <p className="text-clinico-rojo">{error}</p>

  if (!documento) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
        Todavía no hay una versión publicada de este documento.
      </div>
    )
  }

  const variables = construirVariablesDocumento({ clinica, documento })
  const textoFinal = sustituirVariables(documento.contenido, variables)

  return (
    <article>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
        <span>Versión {documento.version}</span>
        {documento.publicado_en && (
          <span>Actualizado el {new Date(documento.publicado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        )}
      </div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{textoFinal}</div>
    </article>
  )
}
