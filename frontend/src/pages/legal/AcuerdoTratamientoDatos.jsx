import { useAuthStore } from '../../store/useAuthStore'
import { HeaderPublico } from '../../components/layout/HeaderPublico'
import { FooterPublico } from '../../components/layout/FooterPublico'
import { VisorDocumentoLegal } from '../../components/legal/VisorDocumentoLegal'
import { EditorDocumentoLegal } from '../../components/legal/EditorDocumentoLegal'

export function AcuerdoTratamientoDatos() {
  const session = useAuthStore((s) => s.session)

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {!session && <HeaderPublico enlace="/login" textoEnlace="Iniciar sesión" />}
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:px-10">
        <h1 className="mb-6 text-2xl font-semibold text-slate-800">Acuerdo de Tratamiento de Datos</h1>
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <VisorDocumentoLegal tipo="data_processing_agreement" />
        </div>
        <EditorDocumentoLegal tipo="data_processing_agreement" />
      </main>
      <FooterPublico />
    </div>
  )
}
