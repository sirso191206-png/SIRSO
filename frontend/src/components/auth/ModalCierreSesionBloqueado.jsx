import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { operacionEsDescartable, resumenOperacion } from '../../lib/descarteOperaciones'

// Nombres legibles para lo que hay en la cola.
const NOMBRE_ENTIDAD = {
  notas_clinicas: 'notas clínicas',
  recetas: 'recetas',
  odontograma_piezas: 'cambios de odontograma',
  periodontograma_piezas: 'cambios de periodontograma',
  periodontograma_sitios: 'cambios de periodontograma',
  tratamientos: 'tratamientos',
  signos_vitales: 'registros de signos vitales',
  citas: 'consultas por finalizar'
}

// Fila de una operación descartable, con confirmación en dos pasos
// (pedir → confirmar) en vez de un solo clic: es irreversible y se
// pierde el cambio clínico si no se guardó la copia.
function FilaDescartable({ operacion, descartando, onDescartar }) {
  const [confirmando, setConfirmando] = useState(false)
  const ocupado = descartando === operacion.id

  if (confirmando) {
    return (
      <li className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
        <p className="mb-2">
          Se descargará una copia y este cambio se borrará de la cola. No se puede deshacer. ¿Confirmas?
        </p>
        <div className="flex gap-2">
          <Button
            variante="peligro"
            onClick={() => onDescartar(operacion)}
            disabled={ocupado}
            className="!px-2 !py-1 text-xs"
          >
            {ocupado ? 'Descartando…' : 'Sí, descartar'}
          </Button>
          <Button variante="secundario" onClick={() => setConfirmando(false)} disabled={ocupado} className="!px-2 !py-1 text-xs">
            Cancelar
          </Button>
        </div>
      </li>
    )
  }

  const resumen = resumenOperacion(operacion)
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs">
      <span className="min-w-0">
        <span className="block truncate font-medium text-slate-700">
          {NOMBRE_ENTIDAD[operacion.entidad] ?? operacion.entidad ?? operacion.tipo}
        </span>
        <span className="block truncate text-slate-500">
          {resumen.intentos} intentos · {operacion.ultimoError ?? 'sin detalle del error'}
        </span>
      </span>
      <Button variante="secundario" onClick={() => setConfirmando(true)} className="inline-flex shrink-0 items-center gap-1 !px-2 !py-1 text-xs">
        <Icon.xCircle /> Descartar
      </Button>
    </li>
  )
}

// Se muestra cuando se intenta cerrar sesión y no se puede: hay cambios
// sin subir, o no hay conexión. Ver lib/cierreSesion.js para la regla.
export function ModalCierreSesionBloqueado({
  evaluacion, sincronizando, descartando,
  onSincronizar, onDescartar, onCerrarSesion, onCerrar,
  listarPendientesDescartables
}) {
  const [descartables, setDescartables] = useState([])

  useEffect(() => {
    if (!evaluacion || evaluacion.errores === 0 || !listarPendientesDescartables) {
      setDescartables([])
      return
    }
    let cancelado = false
    listarPendientesDescartables().then((lista) => {
      if (!cancelado) setDescartables(lista.filter(operacionEsDescartable))
    })
    return () => { cancelado = true }
  }, [evaluacion, descartando, listarPendientesDescartables])

  if (!evaluacion) return null
  const { permitido, motivo, pendientes, errores, porEntidad, conectado } = evaluacion

  return (
    <Modal abierto onCerrar={onCerrar} titulo={permitido ? 'Todo sincronizado' : 'No puedes cerrar sesión todavía'}>
      {permitido ? (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <Icon.checkCircle /> Tus cambios ya se subieron. Ya puedes cerrar sesión.
        </div>
      ) : motivo === 'PENDIENTES' ? (
        <>
          <p className="mb-3 text-sm text-slate-700">
            Tienes <strong>{pendientes}</strong> {pendientes === 1 ? 'cambio sin subir' : 'cambios sin subir'}. Si cierras
            sesión ahora podrías perderlos, así que primero hay que sincronizarlos.
          </p>

          <ul className="mb-3 space-y-1 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            {Object.entries(porEntidad).map(([entidad, cantidad]) => (
              <li key={entidad} className="flex justify-between">
                <span>{NOMBRE_ENTIDAD[entidad] ?? entidad}</span>
                <span className="font-medium">{cantidad}</span>
              </li>
            ))}
          </ul>

          {errores > 0 && (
            <p className="mb-3 flex items-start gap-2 text-xs text-red-700">
              <Icon.alertTriangle /> {errores} {errores === 1 ? 'ya se intentó subir y falló' : 'ya se intentaron subir y fallaron'}.
              Se reintentan al sincronizar.
            </p>
          )}

          {descartables.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <Icon.alertTriangle /> {descartables.length === 1 ? 'Este cambio ya falló varias veces' : 'Estos cambios ya fallaron varias veces'}.
                Si el error se repite y ya no aplica, puedes descartarlo(s) — se descarga una copia y queda en la auditoría.
              </p>
              <ul className="space-y-1.5">
                {descartables.map((op) => (
                  <FilaDescartable key={op.id} operacion={op} descartando={descartando} onDescartar={onDescartar} />
                ))}
              </ul>
            </div>
          )}

          {!conectado && (
            <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <Icon.alertTriangle />
              <span>
                <strong>Sin conexión.</strong> Tus cambios se conservan en este equipo y se subirán cuando vuelva
                internet. Hasta entonces no se puede cerrar sesión ni descartar nada (el descarte también necesita
                conexión, para quedar registrado).
              </span>
            </p>
          )}
        </>
      ) : motivo === 'SIN_CONEXION' ? (
        <p className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <Icon.alertTriangle />
          <span>
            <strong>Sin conexión.</strong> Para cerrar sesión hace falta internet: así la sesión también se cierra
            en el servidor, no solo en este equipo.
          </span>
        </p>
      ) : (
        <p className="mb-5 text-sm text-slate-700">
          No se pudo comprobar si tienes cambios sin subir en este equipo, así que por seguridad no se cierra la sesión.
          Recarga la página e inténtalo de nuevo.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variante="secundario" onClick={onCerrar}>{permitido ? 'Seguir en SIRO' : 'Cancelar'}</Button>
        {permitido ? (
          <Button variante="peligro" onClick={onCerrarSesion} className="inline-flex items-center justify-center gap-1.5">
            <Icon.logOut /> Cerrar sesión
          </Button>
        ) : motivo === 'PENDIENTES' ? (
          <Button
            onClick={onSincronizar}
            disabled={!conectado || sincronizando}
            title={!conectado ? 'Requiere conexión a internet.' : undefined}
            className="inline-flex items-center justify-center gap-1.5"
          >
            <Icon.refresh /> {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
          </Button>
        ) : null}
      </div>
    </Modal>
  )
}
