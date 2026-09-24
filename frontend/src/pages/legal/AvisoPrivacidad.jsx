import { useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { HeaderPublico } from '../../components/layout/HeaderPublico'
import { FooterPublico } from '../../components/layout/FooterPublico'
import { VisorDocumentoLegal } from '../../components/legal/VisorDocumentoLegal'
import { EditorDocumentoLegal } from '../../components/legal/EditorDocumentoLegal'

const PESTANAS = [
  { tipo: 'privacy_simplified', label: 'Simplificado' },
  { tipo: 'privacy_integral', label: 'Integral' }
]

export function AvisoPrivacidad() {
  const session = useAuthStore((s) => s.session)
  const [tab, setTab] = useState('privacy_simplified')

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {!session && <HeaderPublico enlace="/login" textoEnlace="Iniciar sesión" />}
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:px-10">
        <h1 className="mb-6 text-2xl font-semibold text-slate-800">Aviso de Privacidad</h1>

        <div className="mb-6 flex gap-2 border-b border-slate-200">
          {PESTANAS.map((p) => (
            <button
              key={p.tipo}
              onClick={() => setTab(p.tipo)}
              className={`px-4 py-2 text-sm font-medium ${tab === p.tipo ? 'border-b-2 border-clinico-azul text-clinico-azul' : 'text-slate-500'}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <VisorDocumentoLegal tipo={tab} />
        </div>

        <EditorDocumentoLegal tipo={tab} />
      </main>
      <FooterPublico />
    </div>
  )
}
