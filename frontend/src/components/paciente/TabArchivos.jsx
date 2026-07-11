import { useState } from 'react'
import { useFotografias } from '../../hooks/useFotografias'
import { useDocumentosClinicos } from '../../hooks/useDocumentosClinicos'
import { useTratamientos } from '../../hooks/useTratamientos'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { Button } from '../ui/Button'

const ETIQUETAS_FOTO = {
  intraoral: 'Intraoral', extraoral: 'Extraoral', antes: 'Antes', despues: 'Después', radiografia: 'Radiografía'
}
const TIPOS_DOCUMENTO = {
  consentimiento: 'Consentimiento', documento: 'Documento', estudio: 'Estudio', adjunto: 'Adjunto'
}

const FILTROS = [
  { value: 'todos', label: 'Todos' },
  { value: 'fotografias', label: 'Fotografías' },
  { value: 'radiografia', label: 'Radiografías' },
  { value: 'documentos', label: 'Documentos' },
  { value: 'consentimiento', label: 'Consentimientos' }
]

export function TabArchivos({ pacienteId }) {
  const { fotos, hayMas: hayMasFotos, cargando: cargandoFotos, cargandoMas: cargandoMasFotos, cargarMas: cargarMasFotos, subir: subirFoto } = useFotografias(pacienteId)
  const { documentos, hayMas: hayMasDocs, cargando: cargandoDocs, cargandoMas: cargandoMasDocs, cargarMas: cargarMasDocs, subir: subirDocumento } = useDocumentosClinicos(pacienteId)
  const { tratamientos } = useTratamientos(pacienteId)
  const perfil = useAuthStore((s) => s.perfil)

  const [filtro, setFiltro] = useState('todos')
  const [ampliado, setAmpliado] = useState(null)
  const [modoSubida, setModoSubida] = useState('foto') // foto | documento

  if (cargandoFotos || cargandoDocs) return <p className="text-slate-400">Cargando…</p>

  const items = [
    ...fotos.map((f) => ({ tipo: 'foto', categoria: f.etiqueta, url: f.url_firmada, fecha: f.fecha_captura, etiquetaVisible: ETIQUETAS_FOTO[f.etiqueta] ?? f.etiqueta, id: `foto-${f.id}` })),
    ...documentos.map((d) => ({ tipo: 'documento', categoria: d.tipo, url: d.url_firmada, fecha: d.creado_en, etiquetaVisible: d.nombre, id: `doc-${d.id}`, esImagen: false }))
  ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

  const itemsFiltrados = items.filter((it) => {
    if (filtro === 'todos') return true
    if (filtro === 'fotografias') return it.tipo === 'foto' && it.categoria !== 'radiografia'
    if (filtro === 'radiografia') return it.categoria === 'radiografia'
    if (filtro === 'documentos') return it.tipo === 'documento' && it.categoria !== 'consentimiento'
    if (filtro === 'consentimiento') return it.categoria === 'consentimiento'
    return true
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFiltro(f.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filtro === f.value ? 'bg-clinico-azul text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex gap-2 text-xs">
          <button onClick={() => setModoSubida('foto')} className={`rounded-lg px-2 py-1 font-medium ${modoSubida === 'foto' ? 'bg-clinico-azulClaro text-clinico-azul' : 'text-slate-500'}`}>
            Subir fotografía/radiografía
          </button>
          <button onClick={() => setModoSubida('documento')} className={`rounded-lg px-2 py-1 font-medium ${modoSubida === 'documento' ? 'bg-clinico-azulClaro text-clinico-azul' : 'text-slate-500'}`}>
            Subir documento
          </button>
        </div>
        {modoSubida === 'foto' ? (
          <FormularioFoto tratamientos={tratamientos} perfil={perfil} onSubir={subirFoto} />
        ) : (
          <FormularioDocumento perfil={perfil} onSubir={subirDocumento} />
        )}
      </div>

      {itemsFiltrados.length === 0 ? (
        <p className="text-slate-400">Sin archivos en esta categoría.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {itemsFiltrados.map((it) => (
            <ArchivoMiniatura key={it.id} item={it} onAmpliar={() => setAmpliado(it)} />
          ))}
        </div>
      )}

      {(hayMasFotos || hayMasDocs) && (
        <div className="flex justify-center gap-2">
          {hayMasFotos && (
            <button onClick={cargarMasFotos} disabled={cargandoMasFotos} className="text-sm font-medium text-clinico-azul hover:underline disabled:opacity-50">
              {cargandoMasFotos ? 'Cargando…' : 'Cargar más fotos/radiografías'}
            </button>
          )}
          {hayMasDocs && (
            <button onClick={cargarMasDocs} disabled={cargandoMasDocs} className="text-sm font-medium text-clinico-azul hover:underline disabled:opacity-50">
              {cargandoMasDocs ? 'Cargando…' : 'Cargar más documentos'}
            </button>
          )}
        </div>
      )}

      {ampliado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setAmpliado(null)}>
          <div className="max-h-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            {ampliado.tipo === 'foto' ? (
              <img src={ampliado.url} alt={ampliado.etiquetaVisible} className="max-h-[80vh] rounded-lg" />
            ) : (
              <div className="rounded-lg bg-white p-6 text-center">
                <p className="mb-3 text-sm text-slate-600">{ampliado.etiquetaVisible}</p>
                <a href={ampliado.url} target="_blank" rel="noreferrer" className="text-sm text-clinico-azul hover:underline">
                  Abrir documento →
                </a>
              </div>
            )}
            <p className="mt-2 text-center text-sm text-white">{new Date(ampliado.fecha).toLocaleString('es-MX')}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function ArchivoMiniatura({ item, onAmpliar }) {
  return (
    <button onClick={onAmpliar} className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      {item.tipo === 'foto' && item.url ? (
        <img src={item.url} alt={item.etiquetaVisible} className="aspect-square w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 text-slate-400">
          <span className="text-2xl">📄</span>
          <span className="px-2 text-center text-[10px]">{item.etiquetaVisible}</span>
        </div>
      )}
      <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
        {item.tipo === 'foto' ? (ETIQUETAS_FOTO[item.categoria] ?? item.categoria) : (TIPOS_DOCUMENTO[item.categoria] ?? item.categoria)}
      </span>
    </button>
  )
}

function FormularioFoto({ tratamientos, perfil, onSubir }) {
  const [archivo, setArchivo] = useState(null)
  const [etiqueta, setEtiqueta] = useState('intraoral')
  const [tratamientoId, setTratamientoId] = useState('')
  const [subiendo, setSubiendo] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!archivo) return
    setSubiendo(true)
    try {
      await onSubir({ archivo, etiqueta, tratamientoId: tratamientoId || null, usuarioId: perfil.id })
      setArchivo(null)
      e.target.reset()
      toastExito('Fotografía subida.')
    } catch (err) {
      toastError('No se pudo subir: ' + err.message)
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <label className="text-sm">
        <span className="mb-1 block font-medium text-slate-700">Archivo</span>
        <input type="file" accept="image/*" required onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="text-sm" />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium text-slate-700">Tipo</span>
        <select value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
          {Object.entries(ETIQUETAS_FOTO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      {tratamientos.length > 0 && (
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Tratamiento (opcional)</span>
          <select value={tratamientoId} onChange={(e) => setTratamientoId(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
            <option value="">Sin asociar</option>
            {tratamientos.map((t) => <option key={t.id} value={t.id}>{t.descripcion}</option>)}
          </select>
        </label>
      )}
      <Button type="submit" disabled={subiendo || !archivo}>{subiendo ? 'Subiendo…' : 'Subir'}</Button>
    </form>
  )
}

function FormularioDocumento({ perfil, onSubir }) {
  const [archivo, setArchivo] = useState(null)
  const [tipo, setTipo] = useState('documento')
  const [nombre, setNombre] = useState('')
  const [subiendo, setSubiendo] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!archivo) return
    setSubiendo(true)
    try {
      await onSubir({ archivo, tipo, nombre, usuarioId: perfil.id })
      setArchivo(null)
      setNombre('')
      e.target.reset()
      toastExito('Documento subido.')
    } catch (err) {
      toastError('No se pudo subir: ' + err.message)
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <label className="text-sm">
        <span className="mb-1 block font-medium text-slate-700">Archivo</span>
        <input type="file" required onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="text-sm" />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium text-slate-700">Tipo</span>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
          {Object.entries(TIPOS_DOCUMENTO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium text-slate-700">Nombre (opcional)</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm" />
      </label>
      <Button type="submit" disabled={subiendo || !archivo}>{subiendo ? 'Subiendo…' : 'Subir'}</Button>
    </form>
  )
}
