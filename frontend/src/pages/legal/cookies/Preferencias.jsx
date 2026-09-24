import { useState } from 'react'
import { useAuthStore } from '../../../store/useAuthStore'
import { useCookiesStore } from '../../../store/useCookiesStore'
import { HeaderPublico } from '../../../components/layout/HeaderPublico'
import { FooterPublico } from '../../../components/layout/FooterPublico'
import { ModalPreferenciasCookies } from '../../../components/legal/ModalPreferenciasCookies'
import { CATEGORIAS } from '../../../lib/inventarioCookies'
import { Button } from '../../../components/ui/Button'

export function PreferenciasCookies() {
  const session = useAuthStore((s) => s.session)
  const preferencias = useCookiesStore((s) => s.preferencias)
  const decisionTomada = useCookiesStore((s) => s.decisionTomada)
  const [modalAbierto, setModalAbierto] = useState(true)

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {!session && <HeaderPublico enlace="/login" textoEnlace="Iniciar sesión" />}
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12 sm:px-10">
        <h1 className="mb-2 text-2xl font-semibold text-slate-800">Preferencias de almacenamiento</h1>
        <p className="mb-6 text-sm text-slate-500">
          Puedes cambiar tu decisión sobre almacenamiento local en cualquier momento, desde aquí.
        </p>

        {decisionTomada && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 text-xs font-semibold text-slate-500">Tu configuración actual</div>
            <div className="space-y-1 text-sm">
              {CATEGORIAS.map((cat) => (
                <div key={cat.id} className="flex justify-between">
                  <span className="text-slate-600">{cat.label}</span>
                  <span className={preferencias[cat.id] ? 'text-clinico-verde' : 'text-slate-400'}>
                    {preferencias[cat.id] ? 'Activas' : 'Desactivadas'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button onClick={() => setModalAbierto(true)}>Cambiar preferencias</Button>
      </main>
      <FooterPublico />
      <ModalPreferenciasCookies abierto={modalAbierto} onCerrar={() => setModalAbierto(false)} />
    </div>
  )
}
