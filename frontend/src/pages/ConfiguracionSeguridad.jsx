import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { toastExito, toastError } from '../store/useToastStore'
import { listarMisSesiones, marcarSesionFinalizada, cerrarTodasLasSesiones, obtenerMiLimiteSesiones } from '../services/sesiones'
import { Button } from '../components/ui/Button'

export function ConfiguracionSeguridad() {
  const perfil = useAuthStore((s) => s.perfil)
  const sesionActualId = useAuthStore((s) => s.sesionActualId)
  const [sesiones, setSesiones] = useState([])
  const [limite, setLimite] = useState(undefined) // undefined = aún no se consultó
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)

  const recargar = async () => {
    setCargando(true)
    try {
      const [listaSesiones, limiteActual] = await Promise.all([
        listarMisSesiones(),
        obtenerMiLimiteSesiones()
      ])
      setSesiones(listaSesiones)
      setLimite(limiteActual)
    } catch (err) {
      toastError(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { recargar() }, [])

  const handleOcultar = async (id) => {
    try {
      await marcarSesionFinalizada(id)
      await recargar()
    } catch (err) {
      toastError(err.message)
    }
  }

  const handleCerrarTodas = async () => {
    setProcesando(true)
    try {
      await cerrarTodasLasSesiones(perfil.id)
      toastExito('Se cerraron todas tus sesiones. Vuelve a iniciar sesión.')
    } catch (err) {
      toastError(err.message)
      setProcesando(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-semibold text-slate-800">Seguridad — sesiones activas</h1>
      <p className="mb-6 text-sm text-slate-500">
        Dispositivos donde has iniciado sesión en SIRO, según nuestro propio registro.
      </p>

      {limite !== undefined && limite !== null && (
        <p className="mb-4 text-xs text-slate-400">
          Tu plan permite hasta <strong>{limite}</strong> {limite === 1 ? 'sesión simultánea' : 'sesiones simultáneas'}. Si
          inicias sesión en un dispositivo nuevo después de llegar al límite, el dispositivo que usaste hace más
          tiempo se cierra automáticamente.
        </p>
      )}

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : sesiones.length === 0 ? (
        <p className="text-sm text-slate-400">Sin sesiones registradas.</p>
      ) : (
        <div className="mb-6 space-y-2">
          {sesiones.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  {s.dispositivo ?? 'Dispositivo desconocido'}
                  {s.id === sesionActualId && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Este dispositivo</span>
                  )}
                </div>
                <div className="text-xs text-slate-400">
                  Iniciada el {new Date(s.iniciada_en).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              {s.id !== sesionActualId && (
                <button onClick={() => handleOcultar(s.id)} className="text-xs text-slate-400 hover:text-clinico-rojo hover:underline">
                  Quitar del listado
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
        Por una limitación técnica actual, SIRO no puede cerrar una sesión específica en otro dispositivo de forma
        remota. Lo que sí puedes hacer es cerrar <strong>todas</strong> tus sesiones a la vez — eso sí invalida el
        acceso en cualquier dispositivo donde hayas iniciado sesión, incluido este.
      </div>

      <Button variante="peligro" onClick={handleCerrarTodas} disabled={procesando} className="mt-4">
        {procesando ? 'Cerrando…' : 'Cerrar todas mis sesiones'}
      </Button>
    </div>
  )
}
