import { useState } from 'react'
import { TabRecetas } from '../recetas/TabRecetas'
import { TabConsentimientos } from '../consentimientos/TabConsentimientos'
import { TabReferencias } from '../referencias/TabReferencias'
import { useDisponibilidad } from '../../hooks/useFuncionalidad'

// `funcionalidad`: qué parte del plan la incluye (solo oculta interfaz; la base de datos
// bloquea recetas y consentimientos sin ella). Referencias no depende del plan.
const SUBTABS = [
  { nombre: 'Recetas', funcionalidad: 'recetas' },
  { nombre: 'Consentimientos', funcionalidad: 'consentimientos' },
  { nombre: 'Referencias' }
]

export function TabDocumentosClinicos({ pacienteId, paciente }) {
  const [subtabElegida, setSubtab] = useState('Recetas')
  const disponible = useDisponibilidad()
  const visibles = SUBTABS.filter((t) => disponible(t.funcionalidad))
  // Si la guardada ya no está en el plan, cae a la primera disponible (nunca en blanco).
  const subtab = visibles.some((t) => t.nombre === subtabElegida) ? subtabElegida : visibles[0].nombre

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {visibles.map((t) => (
          <button
            key={t.nombre}
            onClick={() => setSubtab(t.nombre)}
            className={`px-3 py-1.5 text-sm font-medium ${
              subtab === t.nombre ? 'border-b-2 border-clinico-azul text-clinico-azul' : 'text-slate-500'
            }`}
          >
            {t.nombre}
          </button>
        ))}
      </div>

      {subtab === 'Recetas' && <TabRecetas pacienteId={pacienteId} paciente={paciente} />}
      {subtab === 'Consentimientos' && <TabConsentimientos pacienteId={pacienteId} paciente={paciente} />}
      {subtab === 'Referencias' && <TabReferencias pacienteId={pacienteId} paciente={paciente} />}
    </div>
  )
}
