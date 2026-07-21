import { useState } from 'react'
import { TabRecetas } from '../recetas/TabRecetas'
import { TabConsentimientos } from '../consentimientos/TabConsentimientos'
import { TabReferencias } from '../referencias/TabReferencias'

const SUBTABS = ['Recetas', 'Consentimientos', 'Referencias']

export function TabDocumentosClinicos({ pacienteId, paciente }) {
  const [subtab, setSubtab] = useState('Recetas')

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {SUBTABS.map((t) => (
          <button
            key={t}
            onClick={() => setSubtab(t)}
            className={`px-3 py-1.5 text-sm font-medium ${
              subtab === t ? 'border-b-2 border-clinico-azul text-clinico-azul' : 'text-slate-500'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {subtab === 'Recetas' && <TabRecetas pacienteId={pacienteId} paciente={paciente} />}
      {subtab === 'Consentimientos' && <TabConsentimientos pacienteId={pacienteId} paciente={paciente} />}
      {subtab === 'Referencias' && <TabReferencias pacienteId={pacienteId} paciente={paciente} />}
    </div>
  )
}
