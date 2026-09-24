import { useAuthStore } from '../../store/useAuthStore'
import { HeaderPublico } from '../../components/layout/HeaderPublico'
import { FooterPublico } from '../../components/layout/FooterPublico'
import { INVENTARIO_PROVEEDORES } from '../../lib/inventarioProveedores'

export function Proveedores() {
  const session = useAuthStore((s) => s.session)

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {!session && <HeaderPublico enlace="/login" textoEnlace="Iniciar sesión" />}
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:px-10">
        <h1 className="mb-2 text-2xl font-semibold text-slate-800">Proveedores</h1>
        <p className="mb-8 text-sm text-slate-500">
          Este es el inventario real de servicios de terceros que utiliza SIRO — revisado directamente contra el
          código del proyecto, no una lista genérica.
        </p>

        <div className="space-y-4">
          {INVENTARIO_PROVEEDORES.map((p) => (
            <div key={p.proveedor} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">{p.proveedor}</h2>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">{p.estado}</span>
              </div>
              <dl className="space-y-1.5 text-sm">
                <div><dt className="inline font-medium text-slate-500">Servicio: </dt><dd className="inline text-slate-700">{p.servicio}</dd></div>
                <div><dt className="inline font-medium text-slate-500">Finalidad: </dt><dd className="inline text-slate-700">{p.finalidad}</dd></div>
                <div><dt className="inline font-medium text-slate-500">Datos que involucra: </dt><dd className="inline text-slate-700">{p.datos}</dd></div>
                <div>
                  <dt className="inline font-medium text-slate-500">Política de privacidad: </dt>
                  <dd className="inline">
                    <a href={p.enlace} target="_blank" rel="noreferrer" className="text-clinico-azul hover:underline">{p.enlace}</a>
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </main>
      <FooterPublico />
    </div>
  )
}
