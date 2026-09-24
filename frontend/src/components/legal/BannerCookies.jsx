import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCookiesStore } from '../../store/useCookiesStore'
import { Button } from '../ui/Button'
import { ModalPreferenciasCookies } from './ModalPreferenciasCookies'

export function BannerCookies() {
  const decisionTomada = useCookiesStore((s) => s.decisionTomada)
  const aceptarTodas = useCookiesStore((s) => s.aceptarTodas)
  const rechazarNoNecesarias = useCookiesStore((s) => s.rechazarNoNecesarias)
  const [modalAbierto, setModalAbierto] = useState(false)

  if (decisionTomada) return null

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white p-4 shadow-lg sm:p-5">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            Usamos almacenamiento local del navegador (comúnmente llamado "cookies") necesario para que SIRO
            funcione, y opcionalmente para recordar tus preferencias. No usamos cookies ni almacenamiento de
            analítica ni de publicidad.{' '}
            <Link to="/legal/cookies" className="text-clinico-azul hover:underline">Ver detalle</Link>
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variante="secundario" onClick={() => setModalAbierto(true)}>Configurar</Button>
            <Button variante="secundario" onClick={rechazarNoNecesarias}>Rechazar no necesarias</Button>
            <Button onClick={aceptarTodas}>Aceptar todas</Button>
          </div>
        </div>
      </div>

      <ModalPreferenciasCookies abierto={modalAbierto} onCerrar={() => setModalAbierto(false)} />
    </>
  )
}
