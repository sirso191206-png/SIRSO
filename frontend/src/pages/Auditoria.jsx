import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { useFuncionalidad } from '../hooks/useFuncionalidad'
import { toastError, toastExito } from '../store/useToastStore'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { listarAuditoria, listarUsuariosParaFiltro, registrarExportacion, TAMANO_PAGINA } from '../services/auditoria'
import { MODULOS_AUDITABLES, TIPOS_ACCION, etiquetaAccion, etiquetaModulo, formatearFechaHora, rangoDeFechas, registroCorto } from '../lib/auditoria'
import { aCsv, descargarCsv } from '../lib/csv'

const COLUMNAS_CSV = [
  { titulo: 'Fecha y hora', valor: (f) => formatearFechaHora(f.creado_en) },
  { titulo: 'Usuario', valor: (f) => f.usuario?.nombre ?? 'Usuario eliminado' },
  { titulo: 'Acción', valor: (f) => etiquetaAccion(f.accion) },
  { titulo: 'Módulo', valor: (f) => etiquetaModulo(f.entidad) },
  { titulo: 'Registro afectado', valor: (f) => f.entidad_id ?? '' }
]
const LIMITE_EXPORTACION = 5000

// Bitácora de la clínica: quién hizo qué y cuándo. Solo el owner (y el superadmin). Lo que se ve lo limita la
// base de datos (política de `auditoria`, migración 081): aunque se manipularan los filtros, no devuelve otra clínica.
export function Auditoria() {
  const perfil = useAuthStore((s) => s.perfil)
  const puedeExportar = useFuncionalidad('reportes')
  const [filtros, setFiltros] = useState({ desde: '', hasta: '', usuarioId: '', entidad: '', tipo: '' })
  const [aplicados, setAplicados] = useState(filtros)
  const [usuarios, setUsuarios] = useState([])
  const [filas, setFilas] = useState([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [exportando, setExportando] = useState(false)

  const consulta = useCallback((f, p) => {
    const { desde, hasta } = rangoDeFechas(f.desde, f.hasta)
    return { desde, hasta, usuarioId: f.usuarioId || undefined, entidad: f.entidad || undefined, tipo: f.tipo || undefined, pagina: p }
  }, [])

  useEffect(() => {
    listarUsuariosParaFiltro().then(setUsuarios).catch(() => setUsuarios([]))
  }, [])

  useEffect(() => {
    let activo = true
    setCargando(true)
    listarAuditoria(consulta(aplicados, pagina))
      .then(({ filas: f, total: t }) => { if (activo) { setFilas(f); setTotal(t) } })
      .catch((err) => { if (activo) { toastError('No se pudo cargar la auditoría. Revisa tu conexión e intenta de nuevo.'); console.error(err) } })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [aplicados, pagina, consulta])

  if (perfil?.rol !== 'owner' && !perfil?.es_super_admin) {
    return <p className="text-slate-400">Esta sección solo está disponible para el propietario de la clínica.</p>
  }

  const cambiar = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }))
  const buscar = () => { setPagina(0); setAplicados(filtros) }
  const limpiar = () => { const vacio = { desde: '', hasta: '', usuarioId: '', entidad: '', tipo: '' }; setFiltros(vacio); setPagina(0); setAplicados(vacio) }
  const paginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA))

  const exportar = async () => {
    setExportando(true)
    try {
      const todas = []
      for (let p = 0; todas.length < Math.min(total, LIMITE_EXPORTACION); p++) {
        const { filas: lote } = await listarAuditoria(consulta(aplicados, p))
        if (lote.length === 0) break
        todas.push(...lote)
      }
      // Primero se deja constancia: la exportación de información es una acción que debe quedar registrada.
      await registrarExportacion({ usuarioId: perfil.id, entidad: 'auditoria', filas: todas.length, filtros: aplicados })
      descargarCsv(aCsv(COLUMNAS_CSV, todas), `auditoria-${new Date().toISOString().slice(0, 10)}`)
      toastExito(`Se exportaron ${todas.length} registros.`)
    } catch (err) {
      toastError('No se pudo exportar. Intenta de nuevo.')
      console.error(err)
    } finally {
      setExportando(false)
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-800">Auditoría</h1>
        {puedeExportar && (
          <Button variante="secundario" onClick={exportar} disabled={exportando || total === 0} className="inline-flex items-center gap-1.5">
            <Icon.download /> {exportando ? 'Exportando…' : 'Exportar CSV'}
          </Button>
        )}
      </div>
      <p className="mb-6 text-sm text-slate-400">
        Registro de lo que pasa en tu clínica: quién hizo qué y cuándo. Solo muestra acciones que se completaron.
      </p>

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs text-slate-500">Desde
          <input type="date" value={filtros.desde} onChange={cambiar('desde')} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-slate-500">Hasta
          <input type="date" value={filtros.hasta} onChange={cambiar('hasta')} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-slate-500">Usuario
          <select value={filtros.usuarioId} onChange={cambiar('usuarioId')} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">Módulo
          <select value={filtros.entidad} onChange={cambiar('entidad')} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            {MODULOS_AUDITABLES.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">Tipo de acción
          <select value={filtros.tipo} onChange={cambiar('tipo')} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {TIPOS_ACCION.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
          </select>
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
          <Button onClick={buscar} disabled={cargando}>Buscar</Button>
          <Button variante="secundario" onClick={limpiar} disabled={cargando}>Limpiar filtros</Button>
        </div>
      </div>

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No hay registros con esos filtros.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2">Fecha y hora</th>
                  <th className="px-4 py-2">Usuario</th>
                  <th className="px-4 py-2">Acción</th>
                  <th className="px-4 py-2">Módulo</th>
                  <th className="px-4 py-2">Registro</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-4 py-2 text-slate-500">{formatearFechaHora(f.creado_en)}</td>
                    <td className="px-4 py-2 font-medium text-slate-700">{f.usuario?.nombre ?? 'Usuario eliminado'}</td>
                    <td className="px-4 py-2 text-slate-700">{etiquetaAccion(f.accion)}</td>
                    <td className="px-4 py-2 text-slate-500">{etiquetaModulo(f.entidad)}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-400" title={f.entidad_id ?? ''}>{registroCorto(f.entidad_id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>{total.toLocaleString('es-MX')} registros</span>
            <span className="flex items-center gap-2">
              <button disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">Anterior</button>
              Página {pagina + 1} de {paginas}
              <button disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">Siguiente</button>
            </span>
          </div>
        </>
      )}
    </div>
  )
}
