import { useCallback, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { procesarColaOffline } from '../lib/procesadorColaOffline'
import { listarOperacionesPendientes, operacionEsDe } from '../lib/colaOffline'
import { exportarOperacionComoArchivo, descartarOperacionPermanente } from '../lib/descarteOperaciones'
import { ModalCierreSesionBloqueado } from '../components/auth/ModalCierreSesionBloqueado'
import { toastError, toastExito } from '../store/useToastStore'

// Para cierres de sesión iniciados por la persona (botón "Cerrar sesión",
// "Cerrar todas mis sesiones"). Uso:
//
//   const { solicitarCierre, modalCierre } = useCierreSesionSeguro()
//   <button onClick={() => solicitarCierre(cerrarSesionSegura)}>…</button>
//   {modalCierre}
//
// `accion` debe devolver { ok: true } si cerró, o { ok: false, evaluacion }
// si la regla la bloqueó (así lo hace cerrarSesionSegura del store). Si se
// bloquea, muestra qué falta y permite sincronizar ahí mismo.
export function useCierreSesionSeguro() {
  const evaluarCierreSesion = useAuthStore((s) => s.evaluarCierreSesion)
  const [evaluacion, setEvaluacion] = useState(null)
  const [accionPendiente, setAccionPendiente] = useState(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [descartando, setDescartando] = useState(null) // id de la operación en curso, o null

  const solicitarCierre = useCallback(async (accion) => {
    const resultado = await accion()
    if (resultado?.ok === false && resultado.evaluacion) {
      setAccionPendiente(() => accion)
      setEvaluacion(resultado.evaluacion)
    }
  }, [])

  const cerrarModal = () => { setEvaluacion(null); setAccionPendiente(null) }

  const sincronizar = async () => {
    setSincronizando(true)
    try {
      await procesarColaOffline()
    } finally {
      setSincronizando(false)
      // Se vuelve a evaluar con lo que REALMENTE quedó en la cola.
      setEvaluacion(await evaluarCierreSesion())
    }
  }

  // Vuelve a evaluar leyendo la cola directo — evaluarCierreSesion() del
  // store ya hace esto, pero aquí también se necesita la lista completa
  // (con payload) para poder exportar/descartar, no solo el conteo.
  const perfil = useAuthStore((s) => s.perfil)

  const descartar = async (operacion) => {
    setDescartando(operacion.id)
    try {
      exportarOperacionComoArchivo(operacion)
      await descartarOperacionPermanente(operacion)
      toastExito('Cambio descartado. Se guardó una copia y quedó registrado en la auditoría.')
    } catch (err) {
      toastError('No se pudo descartar: ' + err.message)
    } finally {
      setDescartando(null)
      setEvaluacion(await evaluarCierreSesion())
    }
  }

  const cerrarSesion = async () => {
    const accion = accionPendiente
    cerrarModal()
    if (accion) await solicitarCierre(accion) // vuelve a comprobar la regla
  }

  const modalCierre = (
    <ModalCierreSesionBloqueado
      evaluacion={evaluacion}
      sincronizando={sincronizando}
      descartando={descartando}
      onSincronizar={sincronizar}
      onDescartar={descartar}
      onCerrarSesion={cerrarSesion}
      onCerrar={cerrarModal}
      listarPendientesDescartables={async () => {
        const todas = await listarOperacionesPendientes()
        return todas.filter((op) => operacionEsDe(op, perfil?.id) && op.estado === 'error')
      }}
    />
  )

  return { solicitarCierre, modalCierre }
}
