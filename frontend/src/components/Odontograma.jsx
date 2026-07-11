import { useState } from 'react'
import { useOdontograma } from '../hooks/useOdontograma'
import { useTratamientos } from '../hooks/useTratamientos'
import { obtenerHistorialPieza, obtenerHistorialCompletoOdontograma } from '../services/odontograma'
import { useAuthStore } from '../store/useAuthStore'
import { toastExito, toastError } from '../store/useToastStore'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'

// Estados de CARA (superficie específica: caries, obturado, etc.)
const ESTADOS_CARA = [
  { value: 'sano', label: 'Sano', color: '#F1F5F9', borde: '#CBD5E1' },
  { value: 'caries', label: 'Caries', color: '#FCA5A5', borde: '#DC2626' },
  { value: 'obturado', label: 'Obturado', color: '#93C5FD', borde: '#2563EB' },
  { value: 'fracturado', label: 'Fracturado', color: '#FDBA74', borde: '#EA580C' },
  { value: 'en_tratamiento', label: 'En tratamiento', color: '#67E8F9', borde: '#0891B2' }
]

// Estados GENERALES de pieza (cubren todo el diente)
const ESTADOS_PIEZA = [
  { value: 'sano', label: 'Sano (usar caras)' },
  { value: 'ausente', label: 'Ausente' },
  { value: 'corona', label: 'Corona' },
  { value: 'implante', label: 'Implante' },
  { value: 'endodoncia', label: 'Endodoncia (tratada)' },
  { value: 'en_tratamiento', label: 'En tratamiento' }
]

const COLOR_PIEZA = {
  corona: { color: '#FCD34D', borde: '#D97706' },
  implante: { color: '#C4B5FD', borde: '#7C3AED' }
}

const FILA_SUPERIOR = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
const FILA_INFERIOR = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']

function esArcadaSuperior(numero) {
  return numero.startsWith('1') || numero.startsWith('2')
}

function esDientAnterior(numero) {
  return ['1', '2', '3'].includes(numero[1])
}

function nombreCaraLingual(numero) {
  return esArcadaSuperior(numero) ? 'Palatina' : 'Lingual'
}

function nombreCaraOclusal(numero) {
  return esDientAnterior(numero) ? 'Incisal' : 'Oclusal'
}

function nombreCara(numero, cara) {
  if (cara === 'lingual') return nombreCaraLingual(numero)
  if (cara === 'oclusal') return nombreCaraOclusal(numero)
  return cara.charAt(0).toUpperCase() + cara.slice(1)
}

function colorCara(estado) {
  return ESTADOS_CARA.find((e) => e.value === estado) ?? ESTADOS_CARA[0]
}

function caraDe(pieza, nombre) {
  return pieza.caras?.find((c) => c.cara === nombre)
}

// Reconstruye el estado "inicial" de cada pieza/cara a partir del
// historial: el valor inicial es el `estado_anterior` del primer cambio
// registrado; si nunca cambió, el inicial es igual al actual.
function calcularEstadoInicial(piezas, historial) {
  const primerCambioPieza = {}
  const primerCambioCara = {}
  for (const h of historial) {
    if (h.cara) {
      const clave = `${h.pieza_id}:${h.cara}`
      if (!(clave in primerCambioCara)) primerCambioCara[clave] = h
    } else if (!(h.pieza_id in primerCambioPieza)) {
      primerCambioPieza[h.pieza_id] = h
    }
  }

  return piezas.map((p) => ({
    ...p,
    estado: primerCambioPieza[p.id]?.estado_anterior ?? p.estado,
    caras: p.caras?.map((c) => ({
      ...c,
      estado: primerCambioCara[`${p.id}:${c.cara}`]?.estado_anterior ?? c.estado
    }))
  }))
}

export function Odontograma({ pacienteId }) {
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

// Tamaño de cada diente y separación entre ellos
const S = 38
const GAP = 4
const O = 11 // offset del cuadro central (oclusal/incisal)

function OdontogramaSvg({ porNumero, onClickCara, onClickDiente, soloLectura = false }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-6">
      <svg viewBox="0 0 700 230" className="w-full min-w-[680px]">
        <FilaDientes
          numeros={FILA_SUPERIOR}
          y={15}
          porNumero={porNumero}
          onClickCara={onClickCara}
          onClickDiente={onClickDiente}
          soloLectura={soloLectura}
        />
        <line x1="10" y1="115" x2="690" y2="115" stroke="#E2E8F0" strokeDasharray="4 4" />
        <FilaDientes
          numeros={FILA_INFERIOR}
          y={120}
          porNumero={porNumero}
          onClickCara={onClickCara}
          onClickDiente={onClickDiente}
          soloLectura={soloLectura}
        />
      </svg>
    </div>
  )
}

function FilaDientes({ numeros, y, porNumero, onClickCara, onClickDiente, soloLectura }) {
  return (
    <g>
      {numeros.map((numero, i) => {
        const pieza = porNumero[numero]
        const x = 10 + i * (S + GAP)
        if (!pieza) return null

        return (
          <g key={numero}>
            <DienteVentana
              pieza={pieza}
              x={x}
              y={y}
              soloLectura={soloLectura}
              onClickCara={(cara) => onClickCara?.(pieza, cara)}
              onClickDiente={() => onClickDiente?.(pieza)}
            />
            <text
              x={x + S / 2}
              y={y + S + 14}
              textAnchor="middle"
              fontSize="11"
              fill="#64748B"
              fontFamily="system-ui"
              style={{ cursor: soloLectura ? 'default' : 'pointer' }}
              onClick={() => !soloLectura && onClickDiente?.(pieza)}
            >
              {numero}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function DienteVentana({ pieza, x, y, onClickCara, onClickDiente, soloLectura }) {
  const cursor = soloLectura ? 'default' : 'pointer'

  // Condiciones que cubren TODO el diente: no se dibuja la ventana de
  // caras, se muestra un solo bloque representando la condición general.
  if (pieza.estado === 'ausente') {
    return (
      <g style={{ cursor }} onClick={() => !soloLectura && onClickDiente()}>
        <rect x={x} y={y} width={S} height={S} rx="6" fill="#E2E8F0" stroke="#94A3B8" opacity="0.5" />
        <line x1={x + 6} y1={y + 6} x2={x + S - 6} y2={y + S - 6} stroke="#94A3B8" strokeWidth="2" />
        <line x1={x + S - 6} y1={y + 6} x2={x + 6} y2={y + S - 6} stroke="#94A3B8" strokeWidth="2" />
        <title>{`Pieza ${pieza.numero_pieza} — Ausente`}</title>
      </g>
    )
  }

  if (pieza.estado === 'corona' || pieza.estado === 'implante') {
    const c = COLOR_PIEZA[pieza.estado]
    return (
      <g style={{ cursor }} onClick={() => !soloLectura && onClickDiente()}>
        <rect x={x} y={y} width={S} height={S} rx="6" fill={c.color} stroke={c.borde} strokeWidth="1.5" />
        <title>{`Pieza ${pieza.numero_pieza} — ${pieza.estado === 'corona' ? 'Corona' : 'Implante'}`}</title>
      </g>
    )
  }

  // Ventana de 5 caras: oclusal/incisal (centro) + vestibular/lingual/mesial/distal
  const puntos = {
    vestibular: `${x},${y} ${x + S},${y} ${x + S - O},${y + O} ${x + O},${y + O}`,
    distal: `${x + S},${y} ${x + S},${y + S} ${x + S - O},${y + S - O} ${x + S - O},${y + O}`,
    lingual: `${x + S},${y + S} ${x},${y + S} ${x + O},${y + S - O} ${x + S - O},${y + S - O}`,
    mesial: `${x},${y + S} ${x},${y} ${x + O},${y + O} ${x + O},${y + S - O}`,
    oclusal: `${x + O},${y + O} ${x + S - O},${y + O} ${x + S - O},${y + S - O} ${x + O},${y + S - O}`
  }

  const bordeGeneral = pieza.estado === 'endodoncia' ? '#B91C1C' : pieza.estado === 'en_tratamiento' ? '#0891B2' : '#CBD5E1'
  const anchoBorde = pieza.estado === 'sano' ? 1 : 2.5

  return (
    <g>
      <rect x={x} y={y} width={S} height={S} rx="4" fill="none" stroke={bordeGeneral} strokeWidth={anchoBorde} />
      {Object.entries(puntos).map(([nombreCaraKey, pts]) => {
        const cara = caraDe(pieza, nombreCaraKey)
        const info = colorCara(cara?.estado)
        return (
          <polygon
            key={nombreCaraKey}
            points={pts}
            fill={info.color}
            stroke="#94A3B8"
            strokeWidth="1.2"
            style={{ cursor }}
            onClick={() => !soloLectura && onClickCara(nombreCaraKey)}
          >
            <title>{`Pieza ${pieza.numero_pieza} — ${nombreCara(pieza.numero_pieza, nombreCaraKey)} — ${info.label}`}</title>
          </polygon>
        )
      })}
    </g>
  )
}

function ModalCara({ pieza, cara, onCerrar, onGuardar }) {
  const perfil = useAuthStore((s) => s.perfil)
  const caraActual = caraDe(pieza, cara)
  const [estado, setEstado] = useState(caraActual?.estado ?? 'sano')
  const [guardando, setGuardando] = useState(false)

  const nombreVisible = nombreCara(pieza.numero_pieza, cara)

  const handleGuardar = async () => {
    setGuardando(true)
    try {
      await onGuardar(caraActual.id, { estado, usuarioId: perfil.id })
      toastExito(`Cara ${nombreVisible.toLowerCase()} de la pieza ${pieza.numero_pieza} actualizada.`)
      onCerrar()
    } catch (err) {
      toastError('No se pudo guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Pieza ${pieza.numero_pieza} — ${nombreVisible}`}>
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Estado de esta cara</span>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {ESTADOS_CARA.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
        </label>
        <Button onClick={handleGuardar} disabled={guardando} className="w-full">
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </Modal>
  )
}

function ModalPiezaGeneral({ pieza, tratamientos, onCerrar, onGuardar }) {
  const perfil = useAuthStore((s) => s.perfil)
  const [estado, setEstado] = useState(pieza.estado)
  const [diagnostico, setDiagnostico] = useState(pieza.diagnostico ?? '')
  const [tratamientoId, setTratamientoId] = useState(pieza.tratamiento_id ?? '')
  const [notas, setNotas] = useState(pieza.notas ?? '')
  const [guardando, setGuardando] = useState(false)
  const [historial, setHistorial] = useState(null)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)

  const handleGuardar = async () => {
    setGuardando(true)
    try {
      await onGuardar(pieza.id, { estado, diagnostico, tratamientoId, notas, usuarioId: perfil.id })
      toastExito(`Pieza ${pieza.numero_pieza} actualizada.`)
      onCerrar()
    } catch (err) {
      toastError('No se pudo guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  const handleVerHistorial = async () => {
    setCargandoHistorial(true)
    const data = await obtenerHistorialPieza(pieza.id)
    setHistorial(data)
    setCargandoHistorial(false)
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Pieza ${pieza.numero_pieza}`}>
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Estado general</span>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {ESTADOS_PIEZA.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">
            Para caries, obturaciones o fracturas de una cara específica, cierra esto y da clic directo sobre esa cara en el diagrama.
          </p>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Diagnóstico</span>
          <input
            value={diagnostico}
            onChange={(e) => setDiagnostico(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Ej. Caries profunda con compromiso pulpar"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Tratamiento asociado</span>
          <select
            value={tratamientoId}
            onChange={(e) => setTratamientoId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Sin asociar</option>
            {tratamientos.map((t) => (
              <option key={t.id} value={t.id}>{t.descripcion}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Notas</span>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        {pieza.actualizado_en && (
          <p className="text-xs text-slate-400">
            Última actualización: {new Date(pieza.actualizado_en).toLocaleString('es-MX')}
          </p>
        )}

        <Button onClick={handleGuardar} disabled={guardando} className="w-full">
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>

        {historial === null ? (
          <button
            onClick={handleVerHistorial}
            disabled={cargandoHistorial}
            className="text-xs text-clinico-azul hover:underline"
          >
            {cargandoHistorial ? 'Cargando historial…' : 'Ver historial de esta pieza (incluye caras)'}
          </button>
        ) : (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <p className="text-xs font-medium text-slate-500">Historial</p>
            {historial.length === 0 && <p className="text-xs text-slate-400">Sin cambios previos.</p>}
            {historial.map((h) => (
              <div key={h.id} className="text-xs text-slate-600">
                <span className="text-slate-400">{new Date(h.creado_en).toLocaleString('es-MX')}</span>
                {' — '}
                {h.cara ? `[${nombreCara(pieza.numero_pieza, h.cara)}] ` : '[general] '}
                {h.estado_anterior ?? 'sin registro'} → {h.estado_nuevo}
                {h.usuario?.nombre && ` (${h.usuario.nombre})`}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
