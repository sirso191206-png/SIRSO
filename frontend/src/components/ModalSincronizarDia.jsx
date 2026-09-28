import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { sincronizarMiDia, obtenerUltimaSincronizacion } from '../services/sincronizacionDia'
import { toastError } from '../store/useToastStore'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Icon } from './ui/Icon'

function formatearFechaHora(iso) {
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

export function ModalSincronizarDia({ abierto, onCerrar }) {
  const perfil = useAuthStore((s) => s.perfil)
  const [sincronizando, setSincronizando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [ultima, setUltima] = useState(null)

  useEffect(() => {
    if (abierto) {
      obtenerUltimaSincronizacion().then(setUltima)
      setResultado(null)
    }
  }, [abierto])

  const handleSincronizar = async () => {
    setSincronizando(true)
    try {
      // Un dentista prepara su propio día; owner/recepción preparan el
      // de toda la clínica, ya que suelen necesitar ver a todos los
      // pacientes del día, no solo los de un dentista en particular.
      const dentistaId = perfil?.rol === 'dentista' ? perfil.id : undefined
      const datos = await sincronizarMiDia({ dentistaId })
      setResultado(datos)
      setUltima(datos)
    } catch (err) {
      toastError('No se pudo sincronizar: ' + err.message)
    } finally {
      setSincronizando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Sincronizar mi día">
      <p className="mb-4 text-sm text-slate-500">
        Descarga por adelantado lo que necesitas para atender a los pacientes de hoy — así, si pierdes la
        conexión durante la jornada, puedes seguir trabajando con lo que ya se guardó.
      </p>

      {resultado ? (
        <div className="mb-4 space-y-1.5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm">
          <div className="mb-2 font-medium text-green-800">Sincronización completada</div>
          <div className="flex items-center gap-1.5 text-green-800"><Icon.check /> {resultado.citas} citas</div>
          <div className="flex items-center gap-1.5 text-green-800"><Icon.check /> {resultado.pacientes} pacientes</div>
          <div className="flex items-center gap-1.5 text-green-800"><Icon.check /> {resultado.expedientes} expedientes</div>
          <div className="flex items-center gap-1.5 text-green-800"><Icon.check /> {resultado.odontogramas} odontogramas</div>
          <div className="flex items-center gap-1.5 text-green-800"><Icon.check /> {resultado.periodontogramas} periodontogramas</div>
        </div>
      ) : ultima ? (
        <p className="mb-4 text-xs text-slate-400">
          Última sincronización: {formatearFechaHora(ultima.sincronizadoEn)}
        </p>
      ) : (
        <p className="mb-4 text-xs text-slate-400">Todavía no se ha sincronizado el día en este dispositivo.</p>
      )}

      <Button onClick={handleSincronizar} disabled={sincronizando} className="inline-flex w-full items-center justify-center gap-1.5">
        <Icon.refresh /> {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
      </Button>
    </Modal>
  )
}
