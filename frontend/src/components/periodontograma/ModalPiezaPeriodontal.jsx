import { useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { obtenerHistorialPeriodontal } from '../../services/periodontograma'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

const NOMBRE_SITIO = {
  mesial_v: 'Mesial vestibular', medio_v: 'Medio vestibular', distal_v: 'Distal vestibular',
  mesial_l: 'Mesial palatino/lingual', medio_l: 'Medio palatino/lingual', distal_l: 'Distal palatino/lingual'
}

const NOMBRE_CAMPO = {
  movilidad: 'Movilidad', furcacion: 'Furcación', profundidad_sondaje: 'Sondaje',
  recesion: 'Recesión', sangrado: 'Sangrado', placa: 'Placa', calculo: 'Cálculo'
}

const GRADOS = [
  { value: 0, label: 'Grado 0' },
  { value: 1, label: 'Grado I' },
  { value: 2, label: 'Grado II' },
  { value: 3, label: 'Grado III' }
]

export function ModalPiezaPeriodontal({ pieza, onCerrar, onGuardarPieza, onGuardarSitio }) {
  const perfil = useAuthStore((s) => s.perfil)
  const [sitios, setSitios] = useState(() =>
    Object.fromEntries((pieza.sitios ?? []).map((s) => [s.sitio, { ...s }]))
  )
  const [movilidad, setMovilidad] = useState(pieza.movilidad)
  const [furcacion, setFurcacion] = useState(pieza.furcacion)
  const [guardando, setGuardando] = useState(false)
  const [historial, setHistorial] = useState(null)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)

  const handleVerHistorial = async () => {
    setCargandoHistorial(true)
    const data = await obtenerHistorialPeriodontal(pieza.id)
    setHistorial(data)
    setCargandoHistorial(false)
  }

  const handleCambiarSitio = (sitio, campo, valor) => {
    setSitios((actual) => ({ ...actual, [sitio]: { ...actual[sitio], [campo]: valor } }))
  }

  const handleGuardar = async () => {
    setGuardando(true)
    try {
      await Promise.all([
        onGuardarPieza(pieza.id, { movilidad: Number(movilidad), furcacion: Number(furcacion), usuarioId: perfil.id }),
        ...Object.values(sitios).map((s) =>
          onGuardarSitio(s.id, {
            profundidad_sondaje: Number(s.profundidad_sondaje),
            recesion: Number(s.recesion),
            sangrado: s.sangrado,
            placa: s.placa,
            calculo: s.calculo,
            usuarioId: perfil.id
          })
        )
      ])
      toastExito(`Periodontograma de la pieza ${pieza.numero_pieza} actualizado.`)
      onCerrar()
    } catch (err) {
      toastError('No se pudo guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Pieza ${pieza.numero_pieza} — Periodontograma`} ancho="grande">
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="pb-2 pr-2">Sitio</th>
                <th className="pb-2 pr-2">Sondaje (mm)</th>
                <th className="pb-2 pr-2">Recesión (mm)</th>
                <th className="pb-2 pr-2">Nivel inserción</th>
                <th className="pb-2 pr-2">Sangrado</th>
                <th className="pb-2 pr-2">Placa</th>
                <th className="pb-2">Cálculo</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(NOMBRE_SITIO).map(([clave, nombre]) => {
                const s = sitios[clave]
                if (!s) return null
                const nivelInsercion = Number(s.profundidad_sondaje) + Number(s.recesion)
                return (
                  <tr key={clave} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2 text-slate-600">{nombre}</td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number" min="0" max="20" value={s.profundidad_sondaje}
                        onChange={(e) => handleCambiarSitio(clave, 'profundidad_sondaje', e.target.value)}
                        className="w-16 rounded border border-slate-300 px-1.5 py-1"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number" min="-10" max="15" value={s.recesion}
                        onChange={(e) => handleCambiarSitio(clave, 'recesion', e.target.value)}
                        className="w-16 rounded border border-slate-300 px-1.5 py-1"
                      />
                    </td>
                    <td className="py-1.5 pr-2 font-medium text-slate-700">{nivelInsercion} mm</td>
                    <td className="py-1.5 pr-2">
                      <input type="checkbox" checked={s.sangrado} onChange={(e) => handleCambiarSitio(clave, 'sangrado', e.target.checked)} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input type="checkbox" checked={s.placa} onChange={(e) => handleCambiarSitio(clave, 'placa', e.target.checked)} />
                    </td>
                    <td className="py-1.5">
                      <input type="checkbox" checked={s.calculo} onChange={(e) => handleCambiarSitio(clave, 'calculo', e.target.checked)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Movilidad</span>
            <select value={movilidad} onChange={(e) => setMovilidad(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {GRADOS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Furcación</span>
            <select value={furcacion} onChange={(e) => setFurcacion(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {GRADOS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </label>
        </div>

        <Button onClick={handleGuardar} disabled={guardando} className="w-full">
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>

        <div className="border-t border-slate-100 pt-3">
          {historial === null ? (
            <button
              onClick={handleVerHistorial}
              disabled={cargandoHistorial}
              className="text-xs font-medium text-clinico-azul hover:underline"
            >
              {cargandoHistorial ? 'Cargando historial…' : 'Ver historial de esta pieza'}
            </button>
          ) : (
            <div className="max-h-48 space-y-1.5 overflow-y-auto">
              <p className="mb-1 text-xs font-medium text-slate-500">Historial</p>
              {historial.length === 0 && <p className="text-xs text-slate-400">Sin cambios previos.</p>}
              {historial.map((h) => (
                <div key={h.id} className="text-xs text-slate-600">
                  <span className="text-slate-400">{new Date(h.creado_en).toLocaleString('es-MX')}</span>
                  {' — '}
                  {h.sitio && `[${NOMBRE_SITIO[h.sitio] ?? h.sitio}] `}
                  {NOMBRE_CAMPO[h.campo] ?? h.campo}: {h.valor_anterior ?? 'sin registro'} → {h.valor_nuevo}
                  {h.usuario?.nombre && ` (${h.usuario.nombre})`}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
