import { useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { HeaderPublico } from '../../components/layout/HeaderPublico'
import { FooterPublico } from '../../components/layout/FooterPublico'
import { VisorDocumentoLegal } from '../../components/legal/VisorDocumentoLegal'
import { EditorDocumentoLegal } from '../../components/legal/EditorDocumentoLegal'
import { ModalPreferenciasCookies } from '../../components/legal/ModalPreferenciasCookies'
import { agruparPorCategoria } from '../../lib/inventarioCookies'
import { Button } from '../../components/ui/Button'

export function Cookies() {
  const session = useAuthStore((s) => s.session)
  const [modalAbierto, setModalAbierto] = useState(false)
  const grupos = agruparPorCategoria()

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {!session && <HeaderPublico enlace="/login" textoEnlace="Iniciar sesión" />}
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:px-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-800">Cookies y Tecnologías de Almacenamiento</h1>
          <Button variante="secundario" onClick={() => setModalAbierto(true)}>Cambiar preferencias</Button>
        </div>
        <p className="mb-6 text-xs text-slate-400">
          A esto muchos sitios le llaman solo "cookies" — pero técnicamente SIRO no usa cookies HTTP tradicionales.
          Usa <code className="rounded bg-slate-100 px-1">localStorage</code>, otra tecnología de almacenamiento del
          navegador. Se explica aquí bajo el mismo nombre común porque es donde la gente lo busca, pero preferimos
          ser precisos sobre qué es exactamente.
        </p>

        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
          <VisorDocumentoLegal tipo="cookies" />
        </div>

        <h2 className="mb-3 text-lg font-semibold text-slate-800">Qué usa SIRO exactamente</h2>
        <p className="mb-6 text-sm text-slate-500">
          Este es un inventario real, revisado directamente contra el código — no una lista genérica. Si en algún
          momento SIRO agrega algo nuevo (analítica, por ejemplo), esta tabla se actualiza para reflejarlo.
        </p>

        <div className="space-y-4">
          {grupos.map((grupo) => (
            <div key={grupo.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-700">{grupo.label}</h3>
                {!grupo.desactivable && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Siempre activas</span>
                )}
              </div>
              {grupo.items.length === 0 ? (
                <p className="text-xs text-slate-400">SIRO no usa actualmente ninguna cookie ni tecnología de esta categoría.</p>
              ) : (
                <div className="space-y-3">
                  {grupo.items.map((item) => (
                    <div key={item.nombre} className="rounded-lg bg-slate-50 p-3 text-xs">
                      <div className="mb-1 font-mono font-semibold text-slate-700">{item.nombre}</div>
                      <div className="text-slate-500">{item.finalidad}</div>
                      <div className="mt-1 flex flex-wrap gap-x-4 text-slate-400">
                        <span>Proveedor: {item.proveedor}</span>
                        <span>Tipo: {item.tipo}</span>
                        <span>Duración: {item.duracion}</span>
                        <span>{item.tercero ? 'De tercero' : 'Primera parte'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <EditorDocumentoLegal tipo="cookies" />
      </main>
      <FooterPublico />
      <ModalPreferenciasCookies abierto={modalAbierto} onCerrar={() => setModalAbierto(false)} />
    </div>
  )
}
