import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HeaderPublico } from '../components/layout/HeaderPublico'
import { FooterPublico } from '../components/layout/FooterPublico'
import { obtenerPlanesPublicos, formatearPrecioPublico } from '../services/planesPublicos'

// Página de PRECIOS (/precios), independiente de la página de inicio: cambio mensual/anual con el ahorro real, tarjetas
// por plan y una tabla para comparar funcionalidades. Todo sale de la base (planes_publicos): aquí no hay precios ni
// funcionalidades escritos a mano. Si no se pueden leer, se ofrece la cotización.

function ahorroAnual(plan) {
  const mensual = Number(plan.precio_mensual)
  const anual = Number(plan.precio_anual)
  if (!(mensual > 0) || !(anual > 0) || !plan.permite_anual) return 0
  return Math.max(0, Math.round((1 - anual / (mensual * 12)) * 100))
}

const PREGUNTAS = [
  ['¿Puedo cambiar de plan después?', 'Sí. Escríbenos y cambiamos tu plan; tus pacientes, citas y expedientes se conservan.'],
  ['¿Qué pasa si llego al límite de pacientes o usuarios?', 'SIRO te avisa antes de llegar al límite y puedes pasar a un plan mayor sin perder información.'],
  ['¿Funciona en teléfono y tableta?', 'Sí: SIRO funciona en el navegador de computadora, tableta y teléfono, sin instalar nada.'],
  ['¿Mis datos están separados de otras clínicas?', 'Sí. Cada clínica solo ve su propia información y cada persona de tu equipo entra con su rol.'],
  ['¿Puedo verlo antes de contratar?', 'Sí. Solicita una demostración y te lo mostramos con datos de ejemplo.']
]

export function Precios() {
  const [planes, setPlanes] = useState(undefined) // undefined = cargando; null = no disponible
  const [periodo, setPeriodo] = useState('mensual')

  useEffect(() => {
    let activo = true
    obtenerPlanesPublicos().then((p) => activo && setPlanes(p))
    return () => { activo = false }
  }, [])

  const hayAnual = Array.isArray(planes) && planes.some((p) => p.permite_anual && Number(p.precio_anual) > 0)
  const ahorros = Array.isArray(planes) ? planes.map(ahorroAnual).filter((a) => a > 0) : []
  const mayorAhorro = Math.max(0, ...ahorros)
  const ahorroUniforme = ahorros.length > 0 && ahorros.every((a) => a === mayorAhorro)
  // Todas las funcionalidades que aparecen en algún plan, en el orden en que llegan (la base las ordena).
  const todasLasFunciones = useMemo(() => {
    if (!Array.isArray(planes)) return []
    const vistas = []
    for (const p of planes) for (const f of p.funcionalidades ?? []) if (!vistas.includes(f)) vistas.push(f)
    return vistas
  }, [planes])

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <HeaderPublico enlace="/login" textoEnlace="Iniciar sesión" navegacion />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 pb-6 pt-12 text-center sm:px-10 lg:pt-16">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-clinico-azul">Planes y precios</p>
          <h1 className="mx-auto mb-3 max-w-3xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Elige el plan que se ajusta al tamaño de tu clínica
          </h1>
          <p className="mx-auto max-w-2xl text-slate-600">Precios en pesos mexicanos. Todos los planes incluyen agenda, pacientes y expediente clínico.</p>

          {hayAnual && (
            <div className="mt-8 inline-flex rounded-xl border border-slate-300 bg-white p-1" role="group" aria-label="Forma de pago">
              {[['mensual', 'Mensual'], ['anual', mayorAhorro > 0 ? `Anual (ahorra ${ahorroUniforme ? '' : 'hasta '}${mayorAhorro}%)` : 'Anual']].map(([valor, etiqueta]) => (
                <button key={valor} type="button" aria-pressed={periodo === valor} onClick={() => setPeriodo(valor)}
                  className={`min-h-[44px] rounded-lg px-4 text-sm font-semibold transition-colors ${periodo === valor ? 'bg-clinico-azul text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                  {etiqueta}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-14 sm:px-10" aria-label="Planes">
          {planes === undefined && <p className="text-center text-sm text-slate-400" role="status">Cargando planes…</p>}
          {planes === null && (
            <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-600">
              En este momento no pudimos mostrar los precios. Escríbenos y te enviamos los planes vigentes.
              <div className="mt-4">
                <Link to="/contacto?asunto=planes" className="inline-flex min-h-[44px] items-center rounded-xl bg-clinico-azul px-5 text-sm font-semibold text-white hover:bg-blue-700">Pedir cotización</Link>
              </div>
            </div>
          )}
          {Array.isArray(planes) && (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {planes.map((p) => {
                const anual = periodo === 'anual' && p.permite_anual && Number(p.precio_anual) > 0
                const ahorro = ahorroAnual(p)
                return (
                  <article key={p.plan} className={`relative flex flex-col rounded-2xl border bg-white p-6 ${p.recomendado ? 'border-2 border-clinico-azul shadow-lg' : 'border-slate-200'}`}>
                    {p.recomendado && (
                      <span className="absolute -top-3 left-6 rounded-full bg-clinico-azul px-3 py-1 text-xs font-semibold text-white">Recomendado</span>
                    )}
                    <h2 className="text-lg font-bold text-slate-900">{p.nombre}</h2>
                    {p.descripcion && <p className="mt-1 min-h-[40px] text-sm text-slate-500">{p.descripcion}</p>}
                    <p className="mt-5">
                      <span className="text-4xl font-bold tracking-tight text-slate-900">
                        {formatearPrecioPublico(anual ? Number(p.precio_anual) / 12 : p.precio_mensual, p.moneda)}
                      </span>
                      <span className="text-sm text-slate-500"> / mes</span>
                    </p>
                    <p className="min-h-[20px] text-xs text-slate-500">
                      {anual
                        ? `${formatearPrecioPublico(p.precio_anual, p.moneda)} al año${ahorro > 0 ? ` · ahorras ${ahorro}%` : ''}`
                        : p.permite_anual && Number(p.precio_anual) > 0 ? `o ${formatearPrecioPublico(p.precio_anual, p.moneda)} al año` : ''}
                    </p>
                    <Link to={`/contacto?asunto=plan&plan=${encodeURIComponent(p.nombre)}`}
                      className={`mt-5 inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-semibold ${p.recomendado ? 'bg-clinico-azul text-white hover:bg-blue-700' : 'border border-clinico-azul text-clinico-azul hover:bg-clinico-azulClaro'}`}>
                      Quiero el plan {p.nombre}
                    </Link>
                    <ul className="mt-6 space-y-2 border-t border-slate-100 pt-5 text-sm text-slate-700">
                      {/* Sin límite en la base (null) = ilimitado: se dice, en vez de omitirlo. */}
                      <li>✓ {p.max_usuarios == null ? 'Usuarios ilimitados' : Number(p.max_usuarios) === 1 ? '1 usuario' : `Hasta ${p.max_usuarios} usuarios`}</li>
                      <li>✓ {p.max_pacientes == null ? 'Pacientes ilimitados' : `Hasta ${Number(p.max_pacientes).toLocaleString('es-MX')} pacientes`}</li>
                      <li>✓ {p.limite_sucursales == null ? 'Sucursales ilimitadas' : Number(p.limite_sucursales) === 1 ? '1 sucursal' : `Hasta ${p.limite_sucursales} sucursales`}</li>
                      {p.max_almacenamiento_mb != null && <li>✓ {Number(p.max_almacenamiento_mb) >= 1024 ? `${Math.round(Number(p.max_almacenamiento_mb) / 1024)} GB` : `${p.max_almacenamiento_mb} MB`} para fotos y documentos</li>}
                      <li>✓ {(p.funcionalidades ?? []).length} funcionalidades</li>
                    </ul>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {Array.isArray(planes) && todasLasFunciones.length > 0 && (
          <section className="bg-slate-50 py-14" aria-labelledby="titulo-comparar">
            <div className="mx-auto max-w-6xl px-6 sm:px-10">
              <h2 id="titulo-comparar" className="mb-6 text-2xl font-bold text-slate-900">Compara los planes</h2>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left">
                      <th scope="col" className="sticky left-0 bg-white px-4 py-3 font-semibold text-slate-700">Funcionalidad</th>
                      {planes.map((p) => <th key={p.plan} scope="col" className="px-4 py-3 text-center font-semibold text-slate-700">{p.nombre}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {todasLasFunciones.map((f) => (
                      <tr key={f} className="border-b border-slate-100 last:border-0">
                        <th scope="row" className="sticky left-0 bg-white px-4 py-2.5 text-left font-normal text-slate-700">{f}</th>
                        {planes.map((p) => {
                          const incluida = (p.funcionalidades ?? []).includes(f)
                          return (
                            <td key={p.plan} className="px-4 py-2.5 text-center">
                              {incluida
                                ? <span className="font-bold text-clinico-verde" aria-label="Incluida">✓</span>
                                : <span className="text-slate-300" aria-label="No incluida">—</span>}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        <section className="py-14" aria-labelledby="titulo-preguntas">
          <div className="mx-auto max-w-3xl px-6 sm:px-10">
            <h2 id="titulo-preguntas" className="mb-6 text-2xl font-bold text-slate-900">Preguntas frecuentes</h2>
            <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
              {PREGUNTAS.map(([pregunta, respuesta]) => (
                <details key={pregunta} className="group px-5">
                  <summary className="flex min-h-[52px] cursor-pointer items-center justify-between font-medium text-slate-800">
                    {pregunta}
                    <span className="ml-3 text-slate-400 transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <p className="pb-4 text-sm leading-relaxed text-slate-600">{respuesta}</p>
                </details>
              ))}
            </div>
            <div className="mt-10 rounded-2xl bg-clinico-azul p-6 text-center text-white">
              <p className="mb-4 font-semibold">¿No sabes cuál elegir? Te ayudamos.</p>
              <Link to="/contacto?asunto=demo" className="inline-flex min-h-[44px] items-center rounded-xl bg-white px-5 text-sm font-semibold text-clinico-azul hover:bg-blue-50">
                Solicitar una demostración
              </Link>
            </div>
          </div>
        </section>
      </main>

      <FooterPublico />
    </div>
  )
}
