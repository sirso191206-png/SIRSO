import { useEffect, useState } from 'react'
import { useEstadoConexion } from '../../hooks/useEstadoConexion'
import { obtenerUltimaSincronizacionCola } from '../../lib/procesadorColaOffline'
import { Icon } from '../ui/Icon'
import { Button } from '../ui/Button'

const CONFIG_ESTADO = {
  OFFLINE: { texto: 'Sin conexión', color: 'bg-clinico-ambar', icono: 'alertTriangle' },
  RECONNECTING: { texto: 'Reconectando…', color: 'bg-slate-500', icono: 'refresh' },
  SYNC_ERROR: { texto: 'Hay cambios que requieren atención', color: 'bg-red-600', icono: 'alertTriangle' },
  SYNCING: { texto: 'Sincronizando…', color: 'bg-clinico-azul', icono: 'refresh' },
  SYNC_PENDING: { texto: null, color: 'bg-clinico-azul', icono: 'refresh' }
}

function formatearFechaHora(iso) {
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

export function BannerSinConexion() {
  const info = useEstadoConexion()
  const [expandido, setExpandido] = useState(false)
  const [ultimaSubida, setUltimaSubida] = useState(null)

  useEffect(() => {
    if (expandido) obtenerUltimaSincronizacionCola().then(setUltimaSubida)
  }, [expandido])

  if (info.estado === 'ONLINE') return null

  const config = CONFIG_ESTADO[info.estado]
  const IconoBoton = Icon[config.icono]
  const texto = info.estado === 'SYNC_PENDING'
    ? `${info.totalPendientes} cambio${info.totalPendientes > 1 ? 's' : ''} pendiente${info.totalPendientes > 1 ? 's' : ''}`
    : config.texto

  return (
    <div className="fixed inset-x-0 top-0 z-[200]">
      <button
        onClick={() => setExpandido((v) => !v)}
        className={`flex w-full items-center justify-center gap-2 ${config.color} px-4 py-2 text-center text-sm font-medium text-white`}
      >
        <IconoBoton /> {texto}
      </button>

      {expandido && (
        <div className="border-b border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          <div className="mx-auto max-w-md space-y-2">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Última sincronización</span>
              <span>{ultimaSubida?.fecha ? formatearFechaHora(ultimaSubida.fecha) : 'Nunca en este dispositivo'}</span>
            </div>
            <div className="flex justify-between">
              <span>Cambios pendientes</span>
              <span className="font-medium">{info.pendientes}</span>
            </div>
            {info.errores.length > 0 && (
              <div>
                <div className="mb-1 font-medium text-red-700">{info.errores.length} con error:</div>
                <ul className="space-y-1 text-xs text-red-600">
                  {info.errores.map((e) => (
                    <li key={e.id}>{e.entidad ?? e.tipo}: {e.ultimoError ?? 'error desconocido'}</li>
                  ))}
                </ul>
              </div>
            )}
            <Button
              variante="secundario"
              onClick={() => info.sincronizarAhora({ manual: true })}
              disabled={info.sincronizando || info.estado === 'OFFLINE'}
              className="inline-flex w-full items-center justify-center gap-1.5"
            >
              <Icon.refresh /> {info.sincronizando ? 'Sincronizando…' : 'Reintentar sincronización'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
