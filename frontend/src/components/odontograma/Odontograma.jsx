import { lazy, Suspense, useState } from 'react'
import { Odontograma2D } from './Odontograma2D'
import { CargandoModelo3D } from './CargandoModelo3D'

// Three.js/@react-three/fiber solo se descargan si el usuario pide la
// vista 3D — con React.lazy nunca entran al bundle inicial ni se cargan
// mientras el odontólogo se queda en 2D (que es lo normal para
// registrar consultas rápido).
const Odontograma3D = lazy(() => import('./Odontograma3D').then((m) => ({ default: m.Odontograma3D })))

const CLAVE_PREFERENCIA = 'sirso_odontograma_view'

export function Odontograma({ pacienteId, onIrATab }) {
  const [vista, setVista] = useState(() => {
    if (typeof window === 'undefined') return '2d'
    return localStorage.getItem(CLAVE_PREFERENCIA) === '3d' ? '3d' : '2d'
  })

  const cambiarVista = (nueva) => {
    setVista(nueva)
    try {
      localStorage.setItem(CLAVE_PREFERENCIA, nueva)
    } catch {
      // localStorage puede fallar en modo privado — no es crítico, se
      // pierde solo la preferencia recordada, no ningún dato clínico.
    }
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
        <button
          onClick={() => cambiarVista('2d')}
          aria-pressed={vista === '2d'}
          className={`rounded-md px-4 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-clinico-azul ${
            vista === '2d' ? 'bg-clinico-azul text-white' : 'text-slate-600'
          }`}
        >
          Vista clínica 2D
        </button>
        <button
          onClick={() => cambiarVista('3d')}
          aria-pressed={vista === '3d'}
          className={`rounded-md px-4 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-clinico-azul ${
            vista === '3d' ? 'bg-clinico-azul text-white' : 'text-slate-600'
          }`}
        >
          Vista anatómica 3D
        </button>
      </div>

      {vista === '2d' ? (
        <Odontograma2D pacienteId={pacienteId} />
      ) : (
        <Suspense fallback={<CargandoModelo3D />}>
          <Odontograma3D
            pacienteId={pacienteId}
            onVerEnExpediente={() => cambiarVista('2d')}
            onIrAPlan={onIrATab ? () => onIrATab('Plan') : undefined}
          />
        </Suspense>
      )}
    </div>
  )
}
