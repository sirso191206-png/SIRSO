import { useEffect, useState } from 'react'
import { FILA_SUPERIOR, FILA_INFERIOR } from './constantesOdontograma'
import {
  obtenerOdontogramaCompleto,
  obtenerHistorialCompletoOdontograma,
  calcularEstadoInicial,
} from '../../services/odontograma'

const ETIQUETA_ESTADO = {
  sano: 'Sano', ausente: 'Ausente', corona: 'Corona', implante: 'Implante',
  endodoncia: 'Endodoncia', en_tratamiento: 'En tratamiento',
}

// Símbolo por estado, en el mismo espíritu que las hojas clínicas
// impresas: una marca simple por diente completo, no por cara — para
// eso ya está la vista 2D con el diamante de 5 caras.
function Simbolo({ estado }) {
  const base = 'flex h-9 w-9 items-center justify-center rounded border-2 text-xs font-semibold'
  switch (estado) {
    case 'ausente':
      return <div className={`${base} border-slate-400 bg-slate-100 text-slate-400`}>✕</div>
    case 'corona':
      return <div className={`${base} border-amber-500 bg-amber-100 text-amber-700`}>C</div>
    case 'implante':
      return <div className={`${base} border-violet-500 bg-violet-100 text-violet-700`}>I</div>
    case 'endodoncia':
      return <div className={`${base} border-red-400 bg-red-100 text-red-700`}>E</div>
    case 'en_tratamiento':
      return <div className={`${base} border-cyan-500 bg-cyan-100 text-cyan-700`}>▲</div>
    default:
      return <div className={`${base} border-slate-300 bg-white`} />
  }
}

function Diente({ numero, estado }) {
  return (
    <div className="flex flex-col items-center gap-0.5" title={`Pieza ${numero} — ${ETIQUETA_ESTADO[estado] ?? estado}`}>
      <Simbolo estado={estado} />
      <span className="text-[10px] text-slate-500">{numero}</span>
    </div>
  )
}

export function OdontogramaHojaClinica({ pacienteId }) {
  const [piezas, setPiezas] = useState(null)
  const [historial, setHistorial] = useState(null)
  const [vista, setVista] = useState('actual') // 'actual' | 'inicial'
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true
    setCargando(true)
    Promise.all([
      obtenerOdontogramaCompleto(pacienteId),
      obtenerHistorialCompletoOdontograma(pacienteId),
    ]).then(([p, h]) => {
      if (!activo) return
      setPiezas(p)
      setHistorial(h)
      setCargando(false)
    })
    return () => { activo = false }
  }, [pacienteId])

  if (cargando || !piezas) return <p className="text-sm text-slate-400">Cargando odontograma…</p>

  const estadoInicial = calcularEstadoInicial(piezas, historial)
  const porNumero = Object.fromEntries(piezas.map((p) => [p.numero_pieza, p]))
  const estadoDe = (numero) => (vista === 'inicial' ? estadoInicial[numero] : porNumero[numero]?.estado ?? 'sano')

  const hayHistorial = historial.length > 0

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-700">Odontograma — formato hoja clínica</h3>
          <p className="text-xs text-slate-400">
            Símbolo por diente completo (numeración FDI), igual que un formato odontológico impreso.
            Para el detalle por cara, usa la vista 2D.
          </p>
        </div>
        {hayHistorial && (
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
            {[{ v: 'inicial', l: 'Inicial' }, { v: 'actual', l: 'Actual' }].map((o) => (
              <button
                key={o.v}
                onClick={() => setVista(o.v)}
                className={`rounded-md px-3 py-1 text-xs font-medium ${vista === o.v ? 'bg-clinico-azul text-white' : 'text-slate-600'}`}
              >
                {o.l}
              </button>
            ))}
          </div>
        )}
      </div>
      {!hayHistorial && (
        <p className="mb-3 text-xs text-slate-400">
          Este paciente aún no tiene cambios registrados en el odontograma — el estado inicial y el actual son iguales.
        </p>
      )}

      <div className="flex items-center justify-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-slate-400">Derecho</span>
        {FILA_SUPERIOR.map((n) => <Diente key={n} numero={n} estado={estadoDe(n)} />)}
        <span className="ml-1 text-xs font-medium text-slate-400">Izquierdo</span>
      </div>
      <div className="mt-4 flex items-center justify-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-slate-400 opacity-0">Derecho</span>
        {FILA_INFERIOR.map((n) => <Diente key={n} numero={n} estado={estadoDe(n)} />)}
        <span className="ml-1 text-xs font-medium text-slate-400 opacity-0">Izquierdo</span>
      </div>

      <div className="mt-6 flex flex-wrap gap-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
        {Object.entries(ETIQUETA_ESTADO).map(([estado, etiqueta]) => (
          <div key={estado} className="flex items-center gap-1.5">
            <div className="scale-75"><Simbolo estado={estado} /></div>
            {etiqueta}
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Nota: esta vista solo muestra dentición permanente (32 piezas) — SIRO todavía no captura dentición
        temporal/infantil (piezas 51-85), a diferencia de los formatos que incluyen ambas.
      </p>
    </div>
  )
}
