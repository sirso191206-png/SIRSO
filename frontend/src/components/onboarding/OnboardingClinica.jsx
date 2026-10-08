import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { useFuncionalidad, usePlanActual } from '../../hooks/useFuncionalidad'
import { obtenerDatosOnboarding } from '../../services/onboarding'
import { calcularPasos, claveOnboardingOculto, progresoOnboarding, puedeVerOnboarding } from '../../lib/onboarding'

function estaOculto(usuarioId) {
  try { return localStorage.getItem(claveOnboardingOculto(usuarioId)) === '1' } catch { return false }
}

// "Primeros pasos" para el propietario. Se oculta solo al completarse, o cuando la persona lo oculta. Sin conexión o ante
// cualquier falla no muestra nada: es una ayuda, nunca debe estorbar ni alarmar.
export function OnboardingClinica() {
  const perfil = useAuthStore((s) => s.perfil)
  const { suscripcion } = usePlanActual()
  const incluyeAgenda = useFuncionalidad('agenda')
  const esOwner = puedeVerOnboarding(perfil)
  const [datos, setDatos] = useState(null)
  const [oculto, setOculto] = useState(() => (perfil?.id ? estaOculto(perfil.id) : false))

  useEffect(() => {
    if (!esOwner || oculto) return undefined
    let activo = true
    obtenerDatosOnboarding(perfil.clinica_id).then((d) => { if (activo) setDatos(d) }).catch(() => {})
    return () => { activo = false }
  }, [esOwner, oculto, perfil?.clinica_id])

  if (!esOwner || oculto || !datos) return null

  const limiteUsuarios = suscripcion?.limites?.usuarios
  const pasos = calcularPasos({
    clinica: datos.clinica, perfil, incluyeAgenda,
    totales: { ...datos.totales, usuarios: suscripcion?.uso?.usuarios },
    puedeAgregarUsuarios: !suscripcion || suscripcion.sin_suscripcion || limiteUsuarios == null || limiteUsuarios > 1
  })
  const { completo } = progresoOnboarding(pasos)
  if (completo) return null

  const ocultar = () => {
    try { localStorage.setItem(claveOnboardingOculto(perfil.id), '1') } catch { /* sin almacenamiento: solo se oculta ahora */ }
    setOculto(true)
  }

  return <PanelPrimerosPasos pasos={pasos} onOcultar={ocultar} />
}

// Parte visual (recibe los pasos ya calculados): así se puede probar sin red ni efectos.
export function PanelPrimerosPasos({ pasos, onOcultar }) {
  const { hechos, total, porcentaje } = progresoOnboarding(pasos)
  return (
    <section className="rounded-2xl border border-clinico-azul/20 bg-white p-5" aria-label="Primeros pasos">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Bienvenido a SIRO: primeros pasos</h2>
          <p className="text-xs text-slate-500">{hechos} de {total} completados</p>
        </div>
        <button onClick={onOcultar} className="text-xs text-slate-400 hover:text-slate-600 hover:underline">Ocultar esta guía</button>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de primeros pasos">
        <div className="h-full rounded-full bg-clinico-azul" style={{ width: `${porcentaje}%` }} />
      </div>
      <ol className="space-y-2">
        {pasos.map((p, i) => (
          <li key={p.id} data-hecho={p.hecho ? 'si' : 'no'} className="flex items-start gap-3 text-sm">
            <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-semibold ${p.hecho ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`} aria-hidden="true">
              {p.hecho ? '✓' : i + 1}
            </span>
            <div className="flex-1">
              <div className={p.hecho ? 'text-slate-400 line-through' : 'font-medium text-slate-700'}>{p.titulo}</div>
              {!p.hecho && <div className="text-xs text-slate-500">{p.descripcion}</div>}
            </div>
            {!p.hecho && p.ruta && (
              <Link to={p.ruta} className="whitespace-nowrap rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">{p.accion}</Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
