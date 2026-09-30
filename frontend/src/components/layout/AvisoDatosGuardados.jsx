// Aviso cuando una pantalla muestra la ÚLTIMA lectura guardada en el
// equipo (sin conexión) y no datos frescos. Sin esto, una agenda vieja se
// vería idéntica a una actual y podría llevar a decisiones equivocadas
// (p. ej. creer que un horario sigue libre).
export function AvisoDatosGuardados({ deCache, guardadoEn }) {
  if (!deCache) return null
  const cuando = guardadoEn
    ? new Date(guardadoEn).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'una consulta anterior'
  return (
    <div role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      Mostrando información guardada en este equipo ({cuando}). Puede no estar al día: otras personas pudieron
      agendar o cambiar citas desde entonces.
    </div>
  )
}
