import { useEffect, useState } from 'react'
import { obtenerDocumentoActivo, obtenerMisAceptaciones, registrarAceptacion } from '../../services/legal'
import { useAuthStore } from '../../store/useAuthStore'
import { NOMBRES_DOCUMENTO, calcularPendientes, construirAceptacion, tiposRequeridos } from '../../lib/aceptacionLegal'

// Pide aceptar los documentos legales vigentes de SIRO cuando una persona no ha aceptado la versión activa (primer acceso o versión nueva).
// - NO bloquea el trabajo sin conexión: sin internet no se pregunta y se pedirá al volver a conectarse.
// - Un error al consultar (red, servidor) tampoco bloquea el trabajo clínico: solo se bloquea cuando se SABE que hay documentos pendientes.
// - La aceptación la registra el servidor con la versión vigente y la fecha real (disparador de la migración 106); aquí solo se solicita.
export function AceptacionLegalObligatoria({ perfil, sinConexion = false, children }) {
  const logout = useAuthStore((s) => s.logout)
  const [pendientes, setPendientes] = useState([])
  const [marcado, setMarcado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!perfil?.id || sinConexion) return undefined
    let activo = true
    ;(async () => {
      try {
        const documentos = (await Promise.all(tiposRequeridos({ id: perfil?.id, rol: perfil?.rol, es_super_admin: perfil?.es_super_admin }).map((t) => obtenerDocumentoActivo(t, null)))).filter(Boolean)
        const mias = await obtenerMisAceptaciones()
        if (activo) setPendientes(calcularPendientes(documentos, mias))
      } catch {
        /* una consulta fallida NO bloquea el trabajo clínico */
      }
    })()
    return () => { activo = false }
  }, [perfil?.id, perfil?.rol, perfil?.es_super_admin, sinConexion])

  if (pendientes.length === 0) return children

  const aceptar = async () => {
    if (guardando || !marcado) return
    setGuardando(true); setError('')
    try {
      for (const documento of pendientes) await registrarAceptacion(construirAceptacion({ perfil, documento, agenteUsuario: typeof navigator !== 'undefined' ? navigator.userAgent : null }))
      setPendientes([])
    } catch {
      setError('No se pudo registrar tu aceptación. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 p-6" data-testid="aceptacion-legal-obligatoria">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-slate-800">Documentos legales de SIRO</h1>
        <p className="mb-4 text-sm text-slate-500">
          Para continuar, lee y acepta {pendientes.length === 1 ? 'el siguiente documento vigente' : 'los siguientes documentos vigentes'}. Se abren en una pestaña nueva.
        </p>
        <ul className="mb-4 space-y-2">
          {pendientes.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <a href={NOMBRES_DOCUMENTO[d.tipo]?.ruta ?? '/legal'} target="_blank" rel="noreferrer" className="font-medium text-clinico-azul hover:underline">{NOMBRES_DOCUMENTO[d.tipo]?.titulo ?? d.titulo}</a>
              <span className="text-xs text-slate-400">versión {d.version}</span>
            </li>
          ))}
        </ul>
        <label className="mb-4 flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={marcado} onChange={(e) => setMarcado(e.target.checked)} disabled={guardando} className="mt-1" />
          <span>He leído y acepto {pendientes.length === 1 ? 'este documento' : 'estos documentos'}{perfil?.rol === 'owner' && pendientes.some((d) => d.tipo === 'data_processing_agreement') ? ', y el Acuerdo de Tratamiento de Datos en nombre de mi clínica' : ''}.</span>
        </label>
        {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={logout} disabled={guardando} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cerrar sesión</button>
          <button type="button" onClick={aceptar} disabled={guardando || !marcado} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60">{guardando ? 'Guardando…' : 'Aceptar y continuar'}</button>
        </div>
      </div>
    </div>
  )
}
