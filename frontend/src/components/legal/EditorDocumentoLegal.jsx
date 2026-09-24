import { useEffect, useState } from 'react'
import {
  listarHistorialVersiones, crearVersionDocumento, activarVersionDocumento
} from '../../services/legal'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

const TITULOS_TIPO = {
  privacy_simplified: 'Aviso de Privacidad Simplificado',
  privacy_integral: 'Aviso de Privacidad Integral',
  terms: 'Términos y Condiciones',
  cookies: 'Política de Cookies',
  security: 'Seguridad',
  retention: 'Política de Conservación de Información',
  data_processing_agreement: 'Acuerdo de Tratamiento de Datos'
}

export function EditorDocumentoLegal({ tipo }) {
  const perfil = useAuthStore((s) => s.perfil)
  const [abierto, setAbierto] = useState(false)
  const [historial, setHistorial] = useState([])
  const [cargando, setCargando] = useState(true)
  const [version, setVersion] = useState('')
  const [contenido, setContenido] = useState('')
  const [guardando, setGuardando] = useState(false)

  const recargar = async () => {
    setCargando(true)
    try {
      setHistorial(await listarHistorialVersiones(tipo, perfil.clinica_id))
    } catch (err) {
      toastError(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    if (abierto) recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  if (perfil?.rol !== 'owner') return null

  const handlePublicar = async (e) => {
    e.preventDefault()
    if (!version.trim() || !contenido.trim()) {
      toastError('Falta la versión o el contenido.')
      return
    }
    setGuardando(true)
    try {
      const nuevo = await crearVersionDocumento({
        clinica_id: perfil.clinica_id,
        tipo,
        version: version.trim(),
        titulo: TITULOS_TIPO[tipo] ?? tipo,
        contenido: contenido.trim(),
        creado_por: perfil.id
      })
      await activarVersionDocumento(nuevo.id, tipo, perfil.clinica_id)
      toastExito(`Versión ${version} publicada.`)
      setVersion('')
      setContenido('')
      await recargar()
    } catch (err) {
      toastError('No se pudo publicar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <button onClick={() => setAbierto((a) => !a)} className="text-sm font-medium text-clinico-azul">
        {abierto ? '▾' : '▸'} Administrar esta versión (solo owner)
      </button>

      {abierto && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-slate-500">
            Usa <code>{'{{RESPONSABLE}}'}</code>, <code>{'{{DOMICILIO}}'}</code>, <code>{'{{CORREO_PRIVACIDAD}}'}</code>,{' '}
            <code>{'{{TELEFONO}}'}</code>, <code>{'{{RFC}}'}</code>, <code>{'{{FECHA_ACTUALIZACION}}'}</code>,{' '}
            <code>{'{{VERSION}}'}</code> — se sustituyen solas con los datos de Configuración de la clínica.
          </p>

          <form onSubmit={handlePublicar} className="space-y-3">
            <Input label="Nueva versión (ej. 1.1)" value={version} onChange={(e) => setVersion(e.target.value)} />
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Contenido</span>
              <textarea
                value={contenido}
                onChange={(e) => setContenido(e.target.value)}
                rows={10}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Texto completo del documento…"
              />
            </label>
            <Button type="submit" disabled={guardando}>{guardando ? 'Publicando…' : 'Publicar nueva versión'}</Button>
          </form>

          <div>
            <div className="mb-2 text-xs font-semibold text-slate-500">Historial de versiones</div>
            {cargando ? (
              <p className="text-xs text-slate-400">Cargando…</p>
            ) : historial.length === 0 ? (
              <p className="text-xs text-slate-400">Sin versiones todavía.</p>
            ) : (
              <div className="space-y-1">
                {historial.map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-xs">
                    <span>v{v.version} — {new Date(v.creado_en).toLocaleDateString('es-MX')}</span>
                    {v.activo ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-800">Activa</span>
                    ) : (
                      <span className="text-slate-400">Inactiva</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
