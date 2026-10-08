import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { useFuncionalidad } from '../hooks/useFuncionalidad'
import { toastExito, toastError } from '../store/useToastStore'
import { listarSesionesReales, cerrarSesionRemota, describirDispositivo, cerrarTodasLasSesiones, obtenerMiLimiteSesiones } from '../services/sesiones'
import { Button } from '../components/ui/Button'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { SeccionPinOffline } from '../components/seguridad/SeccionPinOffline'
import { useCierreSesionSeguro } from '../hooks/useCierreSesionSeguro'
import { limpiarDatosLocalesDeSesion } from '../lib/cierreSesion'

export function ConfiguracionSeguridad() {
  const perfil = useAuthStore((s) => s.perfil)
  const offlineIncluido = useFuncionalidad('offline') // PIN para trabajar sin conexión
  const evaluarCierreSesion = useAuthStore((s) => s.evaluarCierreSesion)
  const { solicitarCierre, modalCierre } = useCierreSesionSeguro()
  const [sesiones, setSesiones] = useState([])
  const [limite, setLimite] = useState(undefined) // undefined = aún no se consultó
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [aCerrar, setACerrar] = useState(null) // sesión de otro dispositivo pendiente de confirmar
  const [cerrando, setCerrando] = useState(false)

  const recargar = async () => {
    setCargando(true)
    try {
      const [listaSesiones, limiteActual] = await Promise.all([
        listarSesionesReales(),
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

  // Cierra DE VERDAD la sesión de otro dispositivo (auth.sessions, migración 078).
  const handleCerrarSesion = async () => {
    setCerrando(true)
    try {
      await cerrarSesionRemota(aCerrar.id)
      toastExito('Se cerró esa sesión.')
      setACerrar(null)
      await recargar()
    } catch (err) {
      toastError(err.message)
    } finally {
      setCerrando(false)
    }
  }

  const handleCerrarTodas = async () => {
    setProcesando(true)
    try {
      // También cierra ESTE equipo, así que pasa por la misma regla que
      // "Cerrar sesión": no con cambios sin subir, ni sin conexión.
      await solicitarCierre(async () => {
        const evaluacion = await evaluarCierreSesion()
        if (!evaluacion.permitido) return { ok: false, evaluacion }
        await cerrarTodasLasSesiones(perfil.id)
        await limpiarDatosLocalesDeSesion()
        toastExito('Se cerraron todas tus sesiones. Vuelve a iniciar sesión.')
        return { ok: true }
      })
    } catch (err) {
      toastError(err.message)
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-semibold text-slate-800">Seguridad — sesiones activas</h1>
      <p className="mb-6 text-sm text-slate-500">
        Dispositivos donde has iniciado sesión en SIRO ahora mismo.
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
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-700">
                  {describirDispositivo(s.user_agent)}
                  {s.es_actual && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Este dispositivo</span>
                  )}
                  {s.vigente === false && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Excede el límite de tu plan</span>
                  )}
                </div>
                <div className="text-xs text-slate-400">
                  Iniciada el {new Date(s.creada_en).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {s.ultima_actividad && ` · Última actividad ${new Date(s.ultima_actividad).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                </div>
              </div>
              {!s.es_actual && (
                <button onClick={() => setACerrar(s)} className="text-xs text-slate-500 hover:text-clinico-rojo hover:underline">
                  Cerrar esta sesión
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        Cerrar una sesión de otro dispositivo la <strong>invalida de verdad</strong>: ese dispositivo deja de poder trabajar.
        Si estaba sin conexión, se cierra en cuanto vuelva a conectarse y sus cambios sin subir se conservan. Para cerrar
        todas, incluida esta, usa el botón de abajo.
      </div>

      <Button variante="peligro" onClick={handleCerrarTodas} disabled={procesando} className="mt-4">
        {procesando ? 'Cerrando…' : 'Cerrar todas mis sesiones'}
      </Button>

      {offlineIncluido && <SeccionPinOffline />}
      {modalCierre}
      <ConfirmModal
        abierto={!!aCerrar}
        onCerrar={() => setACerrar(null)}
        onConfirmar={handleCerrarSesion}
        confirmando={cerrando}
        titulo="Cerrar esa sesión"
        mensaje={aCerrar ? `¿Cerrar la sesión de ${describirDispositivo(aCerrar.user_agent)}? Ese dispositivo tendrá que volver a iniciar sesión.` : ''}
        textoConfirmar="Cerrar sesión"
      />
    </div>
  )
}
