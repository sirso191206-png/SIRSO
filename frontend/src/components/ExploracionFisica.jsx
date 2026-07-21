import { useState } from 'react'
import {
  OPCIONES_ESTADO_CONCIENCIA, OPCIONES_ORIENTACION, OPCIONES_HIDRATACION,
  OPCIONES_MARCHA, OPCIONES_FACIES, OPCIONES_CONSTITUCION, SISTEMAS_EXPLORACION
} from '../lib/exploracionFisica'

function Select({ etiqueta, valor, opciones, onCambiar }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium text-slate-600">{etiqueta}</span>
      <select
        value={valor ?? ''}
        onChange={(e) => onCambiar(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
      >
        <option value="">Sin registrar</option>
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

export function ExploracionFisica({ valor, onCambiar }) {
  const [expandido, setExpandido] = useState(false)
  const general = valor.general ?? {}
  const sistemas = valor.sistemas ?? {}

  const cambiarGeneral = (campo, val) => onCambiar({ ...valor, general: { ...general, [campo]: val } })
  const cambiarSistema = (clave, texto) => onCambiar({ ...valor, sistemas: { ...sistemas, [clave]: texto } })

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
      >
        <span className="font-medium text-slate-700">Exploración general y por sistemas</span>
        <span className="text-xs text-clinico-azul">{expandido ? 'Ocultar' : 'Registrar'}</span>
      </button>

      {expandido && (
        <div className="mt-3 space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-500">Exploración general</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Select etiqueta="Estado de conciencia" valor={general.estado_conciencia} opciones={OPCIONES_ESTADO_CONCIENCIA} onCambiar={(v) => cambiarGeneral('estado_conciencia', v)} />
              <Select etiqueta="Orientación" valor={general.orientacion} opciones={OPCIONES_ORIENTACION} onCambiar={(v) => cambiarGeneral('orientacion', v)} />
              <Select etiqueta="Hidratación" valor={general.hidratacion} opciones={OPCIONES_HIDRATACION} onCambiar={(v) => cambiarGeneral('hidratacion', v)} />
              <Select etiqueta="Marcha" valor={general.marcha} opciones={OPCIONES_MARCHA} onCambiar={(v) => cambiarGeneral('marcha', v)} />
              <Select etiqueta="Facies" valor={general.facies} opciones={OPCIONES_FACIES} onCambiar={(v) => cambiarGeneral('facies', v)} />
              <Select etiqueta="Constitución física" valor={general.constitucion_fisica} opciones={OPCIONES_CONSTITUCION} onCambiar={(v) => cambiarGeneral('constitucion_fisica', v)} />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-slate-500">Exploración por sistemas</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SISTEMAS_EXPLORACION.map((s) => (
                <div key={s.clave}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">{s.nombre}</span>
                    <button
                      type="button"
                      onClick={() => cambiarSistema(s.clave, 'Sin alteraciones')}
                      className="text-[11px] text-clinico-azul hover:underline"
                    >
                      Sin alteraciones
                    </button>
                  </div>
                  <input
                    value={sistemas[s.clave] ?? ''}
                    onChange={(e) => cambiarSistema(s.clave, e.target.value)}
                    placeholder="Hallazgos…"
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
