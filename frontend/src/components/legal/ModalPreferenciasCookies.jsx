import { useState, useEffect } from 'react'
import { useCookiesStore } from '../../store/useCookiesStore'
import { CATEGORIAS, agruparPorCategoria } from '../../lib/inventarioCookies'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

export function ModalPreferenciasCookies({ abierto, onCerrar }) {
  const preferenciasGuardadas = useCookiesStore((s) => s.preferencias)
  const guardar = useCookiesStore((s) => s.guardar)
  const [locales, setLocales] = useState(preferenciasGuardadas)
  const grupos = agruparPorCategoria()

  useEffect(() => {
    if (abierto) setLocales(preferenciasGuardadas)
  }, [abierto, preferenciasGuardadas])

  const handleGuardar = () => {
    guardar(locales)
    onCerrar()
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Preferencias de almacenamiento">
      <div className="space-y-4">
        {CATEGORIAS.map((cat) => {
          const grupo = grupos.find((g) => g.id === cat.id)
          const sinUso = grupo.items.length === 0
          return (
            <div key={cat.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">{cat.label}</span>
                {!cat.desactivable ? (
                  <span className="text-xs font-medium text-slate-400">Siempre activas</span>
                ) : sinUso ? (
                  <span className="text-xs text-slate-400">Sin uso actualmente</span>
                ) : (
                  <button
                    role="switch"
                    aria-checked={locales[cat.id]}
                    onClick={() => setLocales((l) => ({ ...l, [cat.id]: !l[cat.id] }))}
                    className={`h-5 w-9 rounded-full transition ${locales[cat.id] ? 'bg-clinico-azul' : 'bg-slate-300'}`}
                  >
                    <span className={`block h-4 w-4 rounded-full bg-white transition ${locales[cat.id] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                )}
              </div>
              {sinUso && cat.desactivable && (
                <p className="mt-1 text-xs text-slate-400">SIRO no usa actualmente ninguna cookie de esta categoría.</p>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={handleGuardar}>Guardar preferencias</Button>
      </div>
    </Modal>
  )
}
