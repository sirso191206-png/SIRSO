import { useState } from 'react'
import { useOdontograma } from '../../hooks/useOdontograma'
import { useTratamientos } from '../../hooks/useTratamientos'
import { obtenerHistorialCompletoOdontograma } from '../../services/odontograma'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { ESTADOS_CARA, COLOR_PIEZA, nombreCara, caraDe, calcularEstadoInicial } from './constantesOdontograma'
import { OdontogramaSvg } from './OdontogramaSvg'
import { ModalCara } from './ModalCara'
import { ModalPiezaGeneral } from './ModalPiezaGeneral'

export function Odontograma2D({ pacienteId }) {
  const { piezas, cargando, cambiarEstadoPieza, cambiarEstadoCara } = useOdontograma(pacienteId)
  const { tratamientos } = useTratamientos(pacienteId)
  const perfil = useAuthStore((s) => s.perfil)
  const [piezaModalGeneral, setPiezaModalGeneral] = useState(null)
  const [caraModal, setCaraModal] = useState(null) // { pieza, cara } — solo si no hay condición activa
  const [condicionActiva, setCondicionActiva] = useState(null)
  const [comparando, setComparando] = useState(false)
  const [piezasIniciales, setPiezasIniciales] = useState(null)
  const [cargandoComparacion, setCargandoComparacion] = useState(false)

  const handleToggleComparar = async () => {
    if (comparando) {
      setComparando(false)
      return
    }
    setCargandoComparacion(true)
    try {
      const historial = await obtenerHistorialCompletoOdontograma(pacienteId)
      setPiezasIniciales(calcularEstadoInicial(piezas, historial))
      setComparando(true)
    } catch (err) {
      toastError('No se pudo cargar la comparación: ' + err.message)
    } finally {
      setCargandoComparacion(false)
    }
  }

  const handleClickCara = async (pieza, cara) => {
    if (condicionActiva) {
      const info = caraDe(pieza, cara)
      if (!info || info.estado === condicionActiva) return
      try {
        await cambiarEstadoCara(info.id, { estado: condicionActiva, usuarioId: perfil.id })
        toastExito(`Pieza ${pieza.numero_pieza} — ${nombreCara(pieza.numero_pieza, cara)}: ${ESTADOS_CARA.find((e) => e.value === condicionActiva)?.label.toLowerCase()}.`)
      } catch (err) {
        toastError('No se pudo guardar: ' + err.message)
      }
      return
    }
    setCaraModal({ pieza, cara })
  }

  if (cargando) return <p className="text-slate-400">Cargando odontograma…</p>

  const porNumero = Object.fromEntries(piezas.map((p) => [p.numero_pieza, p]))
  const porNumeroInicial = piezasIniciales ? Object.fromEntries(piezasIniciales.map((p) => [p.numero_pieza, p])) : null

  return (
    <div className="space-y-4">
      {/* Selector de condición activa: modo "pintar" */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500">Condición activa</span>
          <button
            onClick={handleToggleComparar}
            disabled={cargandoComparacion}
            className="text-xs font-medium text-clinico-azul hover:underline disabled:opacity-50"
          >
            {cargandoComparacion ? 'Cargando…' : comparando ? 'Ocultar comparación' : 'Comparar inicial vs actual'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {ESTADOS_CARA.map((e) => (
            <button
              key={e.value}
              onClick={() => setCondicionActiva(condicionActiva === e.value ? null : e.value)}
              className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition"
              style={{
                borderColor: condicionActiva === e.value ? e.borde : '#E2E8F0',
                backgroundColor: condicionActiva === e.value ? e.color : 'white',
                color: condicionActiva === e.value ? '#1E293B' : '#64748B'
              }}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-sm border" style={{ backgroundColor: e.color, borderColor: e.borde }} />
              {e.label}
            </button>
          ))}
        </div>
        {condicionActiva && (
          <p className="mt-2 text-xs text-clinico-azul">
            Modo pintar activo: da clic en cualquier cara para marcarla como "{ESTADOS_CARA.find((e) => e.value === condicionActiva)?.label}". Vuelve a dar clic en el botón para desactivar.
          </p>
        )}
      </div>

      {comparando && piezasIniciales ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-center text-xs font-semibold text-slate-500">Inicial</p>
            <OdontogramaSvg porNumero={porNumeroInicial} soloLectura />
          </div>
          <div>
            <p className="mb-2 text-center text-xs font-semibold text-slate-500">Actual</p>
            <OdontogramaSvg porNumero={porNumero} soloLectura />
          </div>
        </div>
      ) : (
        <OdontogramaSvg
          porNumero={porNumero}
          onClickCara={handleClickCara}
          onClickDiente={setPiezaModalGeneral}
        />
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-3">
          {ESTADOS_CARA.map((e) => (
            <div key={e.value} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="inline-block h-3 w-3 rounded-sm border" style={{ backgroundColor: e.color, borderColor: e.borde }} />
              {e.label}
            </div>
          ))}
        </div>
        <span className="text-slate-300">|</span>
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          <span>✕ Ausente</span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm border" style={{ backgroundColor: COLOR_PIEZA.corona.color, borderColor: COLOR_PIEZA.corona.borde }} /> Corona
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm border" style={{ backgroundColor: COLOR_PIEZA.implante.color, borderColor: COLOR_PIEZA.implante.borde }} /> Implante
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Sin condición activa: clic en una cara abre su detalle. Con una condición activa seleccionada arriba: clic pinta esa cara directamente. Clic en el número de la pieza: condiciones generales, diagnóstico, tratamiento e historial.
      </p>

      {caraModal && (
        <ModalCara
          pieza={caraModal.pieza}
          cara={caraModal.cara}
          onCerrar={() => setCaraModal(null)}
          onGuardar={cambiarEstadoCara}
        />
      )}

      {piezaModalGeneral && (
        <ModalPiezaGeneral
          pieza={piezaModalGeneral}
          tratamientos={tratamientos}
          onCerrar={() => setPiezaModalGeneral(null)}
          onGuardar={cambiarEstadoPieza}
        />
      )}
    </div>
  )
}
