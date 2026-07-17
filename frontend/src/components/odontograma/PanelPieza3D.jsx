import { useState } from 'react'
import { obtenerHistorialPieza } from '../../services/odontograma'
import {
  TIPOS_DIENTES, NOMBRES_TIPO, ESTADOS_PIEZA, esArcadaSuperior, nombreCara
} from './constantesOdontograma'
import { Button } from '../ui/Button'

export function PanelPieza3D({ pieza, tratamientos, onCerrar, onVerEnExpediente, onIrAPlan }) {
  const [historial, setHistorial] = useState(null)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)

  if (!pieza) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
        Da clic en cualquier diente para ver su información clínica.
      </div>
    )
  }

  const tipo = TIPOS_DIENTES[Number(pieza.numero_pieza)] ?? 'molar'
  const arcada = esArcadaSuperior(pieza.numero_pieza) ? 'Superior' : 'Inferior'
  const estadoGeneral = ESTADOS_PIEZA.find((e) => e.value === pieza.estado)?.label ?? pieza.estado
  const carasAfectadas = (pieza.caras ?? []).filter((c) => c.estado !== 'sano')
  const tratamientoVinculado = tratamientos?.find((t) => t.id === pieza.tratamiento_id)

  // Sin nada que reportar: en vez de mostrar campos vacíos, un solo
  // mensaje claro (tal como se pidió: "no mostrar campos vacíos
  // innecesarios").
  const sinCondiciones = pieza.estado === 'sano' && carasAfectadas.length === 0 && !pieza.diagnostico && !tratamientoVinculado && !pieza.notas

  const handleVerHistorial = async () => {
    setCargandoHistorial(true)
    const data = await obtenerHistorialPieza(pieza.id)
    setHistorial(data)
    setCargandoHistorial(false)
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Pieza {pieza.numero_pieza}</h3>
          <p className="text-xs text-slate-500">{NOMBRES_TIPO[tipo]} · Arcada {arcada}</p>
        </div>
        <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar panel">✕</button>
      </div>

      {sinCondiciones ? (
        <p className="text-sm text-slate-400">Sin condiciones registradas.</p>
      ) : (
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs font-medium text-slate-400">Estado clínico</dt>
            <dd className="text-slate-700">{estadoGeneral}</dd>
          </div>

          {carasAfectadas.length > 0 && (
            <div>
              <dt className="text-xs font-medium text-slate-400">Caras afectadas</dt>
              <dd className="space-y-0.5 text-slate-700">
                {carasAfectadas.map((c) => (
                  <div key={c.cara}>{nombreCara(pieza.numero_pieza, c.cara)}: {c.estado}</div>
                ))}
              </dd>
            </div>
          )}

          {pieza.diagnostico && (
            <div>
              <dt className="text-xs font-medium text-slate-400">Diagnóstico</dt>
              <dd className="text-slate-700">{pieza.diagnostico}</dd>
            </div>
          )}

          {tratamientoVinculado && (
            <div>
              <dt className="text-xs font-medium text-slate-400">Tratamiento</dt>
              <dd className="text-slate-700">
                {tratamientoVinculado.descripcion}
                <span className="ml-1 text-xs text-slate-400">
                  ({tratamientoVinculado.estado === 'completado' ? 'realizado' : 'planeado'})
                </span>
              </dd>
            </div>
          )}

          {pieza.notas && (
            <div>
              <dt className="text-xs font-medium text-slate-400">Observaciones</dt>
              <dd className="text-slate-700">{pieza.notas}</dd>
            </div>
          )}

          {pieza.actualizado_en && (
            <div>
              <dt className="text-xs font-medium text-slate-400">Última actualización</dt>
              <dd className="text-slate-700">{new Date(pieza.actualizado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
            </div>
          )}
        </dl>
      )}

      <div className="mt-4 space-y-2">
        <Button variante="secundario" onClick={onVerEnExpediente} className="w-full">
          Ver expediente de la pieza
        </Button>
        {onIrAPlan && (
          <Button variante="secundario" onClick={onIrAPlan} className="w-full">
            Ir al plan de tratamiento
          </Button>
        )}
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        {historial === null ? (
          <button
            onClick={handleVerHistorial}
            disabled={cargandoHistorial}
            className="text-xs font-medium text-clinico-azul hover:underline"
          >
            {cargandoHistorial ? 'Cargando historial…' : 'Ver historial de esta pieza'}
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Historial</p>
            {historial.length === 0 && <p className="text-xs text-slate-400">Sin cambios previos.</p>}
            {historial.map((h) => (
              <div key={h.id} className="text-xs text-slate-600">
                <span className="text-slate-400">{new Date(h.creado_en).toLocaleDateString('es-MX')}</span>
                {' — '}
                {h.cara ? `[${nombreCara(pieza.numero_pieza, h.cara)}] ` : '[general] '}
                {h.estado_anterior ?? 'sin registro'} → {h.estado_nuevo}
                {h.usuario?.nombre && ` (${h.usuario.nombre})`}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
