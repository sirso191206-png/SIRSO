import { lazy, Suspense, useState } from 'react'
import { Odontograma2D } from './Odontograma2D'
import { OdontogramaHojaClinica } from './OdontogramaHojaClinica'
import { CargandoModelo3D } from './CargandoModelo3D'
import { Periodontograma } from '../periodontograma/Periodontograma'
import { useDisponibilidad } from '../../hooks/useFuncionalidad'
import { elegirVistaDisponible } from '../../lib/planes'

// Three.js/@react-three/fiber solo se descargan si el usuario pide la
// vista 3D — con React.lazy nunca entran al bundle inicial ni se cargan
// mientras el odontólogo se queda en 2D (que es lo normal para
// registrar consultas rápido).
const Odontograma3D = lazy(() => import('./Odontograma3D').then((m) => ({ default: m.Odontograma3D })))

const CLAVE_PREFERENCIA = 'sirso_odontograma_view'
const VISTAS_VALIDAS = ['2d', '3d', 'perio', 'hoja']

// `funcionalidad`: qué parte del plan la incluye (solo oculta la vista; la base de
// datos es quien bloquea los datos de periodontograma/odontograma sin plan).
const OPCIONES = [
  { value: '2d', label: 'Vista clínica 2D', funcionalidad: 'odontograma_2d' },
  { value: '3d', label: 'Vista anatómica 3D', funcionalidad: 'odontograma_3d' },
  { value: 'perio', label: 'Periodontograma', funcionalidad: 'periodontograma' },
  { value: 'hoja', label: 'Hoja clínica', funcionalidad: 'odontograma_2d' }
]

export function Odontograma({ pacienteId, onIrATab }) {
  const [vista, setVista] = useState(() => {
    if (typeof window === 'undefined') return '2d'
    const guardada = localStorage.getItem(CLAVE_PREFERENCIA)
    return VISTAS_VALIDAS.includes(guardada) ? guardada : '2d'
  })

  const disponible = useDisponibilidad()
  const opciones = OPCIONES.filter((o) => disponible(o.funcionalidad))
  // La preferencia guardada puede no estar en el plan actual: cae a una disponible.
  const vistaActiva = elegirVistaDisponible(vista, opciones.map((o) => o.value))

  const cambiarVista = (nueva) => {
    setVista(nueva)
    try {
      localStorage.setItem(CLAVE_PREFERENCIA, nueva)
    } catch {
      // localStorage puede fallar en modo privado — no es crítico, se
      // pierde solo la preferencia recordada, no ningún dato clínico.
    }
  }

  if (opciones.length === 0) {
    return <p className="text-sm text-slate-500">Esta funcionalidad no está disponible en tu plan.</p>
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
        {opciones.map((o) => (
          <button
            key={o.value}
            onClick={() => cambiarVista(o.value)}
            aria-pressed={vistaActiva === o.value}
            className={`rounded-md px-4 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-clinico-azul ${
              vistaActiva === o.value ? 'bg-clinico-azul text-white' : 'text-slate-600'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {vistaActiva === '2d' && <Odontograma2D pacienteId={pacienteId} />}

      {vistaActiva === '3d' && (
        <Suspense fallback={<CargandoModelo3D />}>
          <Odontograma3D
            pacienteId={pacienteId}
            onVerEnExpediente={() => cambiarVista('2d')}
            onIrAPlan={onIrATab ? () => onIrATab('Plan') : undefined}
          />
        </Suspense>
      )}

      {vistaActiva === 'perio' && <Periodontograma pacienteId={pacienteId} />}

      {vistaActiva === 'hoja' && <OdontogramaHojaClinica pacienteId={pacienteId} />}
    </div>
  )
}
