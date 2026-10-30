import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HeaderPublico } from '../components/layout/HeaderPublico'
import { FooterPublico } from '../components/layout/FooterPublico'
import { obtenerPlanesPublicos, formatearPrecioPublico } from '../services/planesPublicos'

// Página pública de SIRO (/inicio, y «/» para quien no ha iniciado sesión). Solo describe lo que el sistema YA hace;
// el detalle de planes y precios vive en su propia página (/precios); aquí solo se anuncia el precio de entrada, leído
// de la base (planes_publicos) para no publicar nada distinto de lo que se cobra.

const PROBLEMAS = [
  ['Expedientes en papel o en hojas sueltas', 'Historia clínica, notas, odontograma, recetas y consentimientos en un solo expediente por paciente.'],
  ['Citas que se pierden o se empalman', 'Agenda por día, semana y mes, con avisos de choques, horarios bloqueados, lista de espera y reserva en línea.'],
  ['Cobros sin control', 'Pagos, abonos y anulaciones con recibo, saldo por paciente y corte de caja por método de pago.'],
  ['No saber quién hizo qué', 'Cada persona entra con su rol y la auditoría registra los cambios importantes.']
]

const FUNCIONES = [
  ['Agenda y reserva en línea', 'Citas, urgencias, lista de espera y un enlace para que tus pacientes pidan cita; tú las confirmas.'],
  ['Expediente clínico', 'Historia clínica, signos vitales, notas con diagnóstico CIE-10, fotografías y documentos.'],
  ['Odontograma 2D y 3D', 'Estado de cada pieza y de cada cara, comparación con el estado inicial y periodontograma.'],
  ['Tratamientos y presupuestos', 'Plan de tratamiento desde tu catálogo de precios, con descuentos y presupuesto imprimible.'],
  ['Recetas, consentimientos y referencias', 'Documentos con tus datos profesionales y firma, listos para imprimir; aviso de alergias al recetar.'],
  ['Pagos y corte de caja', 'Recibos, abonos, anulaciones con motivo y corte de caja por periodo y método.'],
  ['Inventario de materiales', 'Existencias, entradas y salidas, y descuento de materiales por tratamiento realizado.'],
  ['Equipo, roles y auditoría', 'Propietario, odontólogo, recepción y asistente, cada uno con lo que le toca; registro de cambios.'],
  ['Funciona sin internet', 'Si se cae la conexión sigues trabajando; los cambios se suben solos al volver.']
]

const BENEFICIOS = [
  ['Menos tiempo en papeleo', 'Lo que ya capturaste se reutiliza en recetas, recibos y documentos.'],
  ['Cada quien ve lo que le toca', 'Recepción cobra y agenda sin acceder a la información clínica.'],
  ['Tu información, protegida', 'Datos separados por clínica, conexión cifrada y respaldos diarios.']
]

export function Inicio() {
  const [planes, setPlanes] = useState(undefined) // undefined = cargando; null = no disponible

  useEffect(() => {
    let activo = true
    obtenerPlanesPublicos().then((p) => activo && setPlanes(p))
    return () => { activo = false }
  }, [])

  // Plan de entrada (el más barato con precio): solo para anunciar «desde $…» con el precio real.
  const desde = Array.isArray(planes)
    ? planes.filter((p) => Number(p.precio_mensual) > 0).sort((a, b) => Number(a.precio_mensual) - Number(b.precio_mensual))[0]
    : undefined

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <HeaderPublico enlace="/login" textoEnlace="Iniciar sesión" navegacion />

      <main className="flex-1">
        {/* Portada */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-14 sm:px-10 lg:grid-cols-2 lg:py-20">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-clinico-azul">Software para clínicas dentales</p>
            <h1 className="mb-4 text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
              Tu consultorio dental, organizado en un solo lugar
            </h1>
            <p className="mb-8 text-base leading-relaxed text-slate-600 sm:text-lg">
              SIRO (Solución Integral de Registro Odontológico) reúne la agenda, el expediente clínico, el odontograma, los
              tratamientos y los cobros de tu clínica. Funciona en computadora, tableta y teléfono.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/contacto?asunto=demo" className="inline-flex min-h-[48px] items-center rounded-xl bg-clinico-azul px-6 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
                Solicitar una demostración
              </Link>
              <Link to="/precios" className="inline-flex min-h-[48px] items-center rounded-xl border border-slate-300 px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Ver planes y precios
              </Link>
            </div>
          </div>
          <img src="/ilustracion-login.svg" alt="Ilustración de una consulta odontológica" width="560" height="420" className="mx-auto w-full max-w-[520px]" loading="eager" />
        </section>

        {/* Problemas que resuelve */}
        <section className="bg-slate-50 py-14" aria-labelledby="titulo-problemas">
          <div className="mx-auto max-w-6xl px-6 sm:px-10">
            <h2 id="titulo-problemas" className="mb-8 text-2xl font-bold text-slate-900 sm:text-3xl">Lo que SIRO resuelve</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {PROBLEMAS.map(([titulo, texto]) => (
                <div key={titulo} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-1 font-semibold text-slate-800">{titulo}</h3>
                  <p className="text-sm leading-relaxed text-slate-600">{texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Funcionalidades */}
        <section className="py-14" aria-labelledby="titulo-funciones">
          <div className="mx-auto max-w-6xl px-6 sm:px-10">
            <h2 id="titulo-funciones" className="mb-8 text-2xl font-bold text-slate-900 sm:text-3xl">Funcionalidades</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FUNCIONES.map(([titulo, texto]) => (
                <div key={titulo} className="rounded-2xl border border-slate-200 p-5">
                  <h3 className="mb-1 font-semibold text-slate-800">{titulo}</h3>
                  <p className="text-sm leading-relaxed text-slate-600">{texto}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-slate-500">Algunas funcionalidades dependen del plan contratado (ver el detalle de cada plan).</p>
          </div>
        </section>

        {/* Beneficios */}
        <section className="bg-slate-50 py-14" aria-labelledby="titulo-beneficios">
          <div className="mx-auto max-w-6xl px-6 sm:px-10">
            <h2 id="titulo-beneficios" className="mb-8 text-2xl font-bold text-slate-900 sm:text-3xl">Beneficios para tu clínica</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {BENEFICIOS.map(([titulo, texto]) => (
                <div key={titulo} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-1 font-semibold text-slate-800">{titulo}</h3>
                  <p className="text-sm leading-relaxed text-slate-600">{texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Planes: la página completa de precios es /precios */}
        <section className="py-14" aria-labelledby="titulo-planes">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-2xl border border-slate-200 px-6 py-8 sm:px-10 md:flex-row md:items-center">
            <div>
              <h2 id="titulo-planes" className="mb-1 text-2xl font-bold text-slate-900">Planes para cada tamaño de clínica</h2>
              <p className="text-sm text-slate-600">
                {desde
                  ? `Desde ${formatearPrecioPublico(desde.precio_mensual, desde.moneda)} al mes. Compara funcionalidades y límites de cada plan.`
                  : 'Compara funcionalidades, límites y precios de cada plan.'}
              </p>
            </div>
            <Link to="/precios" className="inline-flex min-h-[48px] shrink-0 items-center rounded-xl bg-clinico-azul px-6 text-sm font-semibold text-white hover:bg-blue-700">
              Ver planes y precios
            </Link>
          </div>
        </section>

        {/* Cierre */}
        <section className="bg-clinico-azul py-14 text-white">
          <div className="mx-auto max-w-4xl px-6 text-center sm:px-10">
            <h2 className="mb-3 text-2xl font-bold sm:text-3xl">¿Quieres verlo funcionando?</h2>
            <p className="mb-6 text-blue-100">Te mostramos SIRO con datos de ejemplo y resolvemos tus dudas.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/contacto?asunto=demo" className="inline-flex min-h-[48px] items-center rounded-xl bg-white px-6 text-sm font-semibold text-clinico-azul hover:bg-blue-50">
                Solicitar una demostración
              </Link>
              <a href="mailto:sirso191206@gmail.com" className="inline-flex min-h-[48px] items-center rounded-xl border border-white/60 px-6 text-sm font-semibold text-white hover:bg-white/10">
                sirso191206@gmail.com
              </a>
            </div>
          </div>
        </section>
      </main>

      <FooterPublico />
    </div>
  )
}
