import { Component } from 'react'
import { registrarErrorCliente } from '../../lib/registroErrores'

// Si una pantalla no se puede descargar —lo habitual: SIRO se actualizó y esta pestaña pide un archivo de la versión
// anterior que ya no existe, o no hay conexión y esa pantalla no estaba en caché— no se deja la pantalla en blanco.
// Con conexión, primero se recarga SOLA una vez (trae la versión nueva y no es un error: no se registra). Si tras
// recargar vuelve a fallar, o no hay conexión, se explica y se ofrece recargar, y entonces sí se registra.
// Los cambios pendientes de subir NO se pierden (viven en IndexedDB, no en la página).

export const CLAVE_RECARGA = 'siro:recarga-por-version'
const VENTANA_MS = 30000

// ¿Ya se recargó sola hace poco? Así nunca entra en un ciclo de recargas.
export function debeRecargarSola(ahora = Date.now(), almacen = globalThis.sessionStorage, enLinea = globalThis.navigator?.onLine !== false) {
  if (!enLinea) return false
  try {
    const ultima = Number(almacen?.getItem(CLAVE_RECARGA) || 0)
    if (ahora - ultima < VENTANA_MS) return false
    almacen?.setItem(CLAVE_RECARGA, String(ahora))
    return true
  } catch {
    return false
  }
}

export class ErrorDeCarga extends Component {
  constructor(props) {
    super(props)
    this.state = { fallo: false }
  }

  static getDerivedStateFromError() {
    return { fallo: true }
  }

  componentDidCatch(error) {
    if (debeRecargarSola()) {
      window.location.reload()
      return
    }
    console.error('No se pudo cargar una pantalla de SIRO:', error)
    registrarErrorCliente(error, 'pantalla que no se pudo abrir')
  }

  render() {
    if (!this.state.fallo) return this.props.children
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-6" role="alert">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-xl font-semibold text-slate-800">No se pudo abrir esta pantalla</h1>
          <p className="mb-6 text-sm text-slate-500">
            Puede que haya una versión nueva de SIRO o que no haya conexión. Recarga la página para continuar. Tus cambios
            pendientes de sincronizar no se pierden.
          </p>
          <button onClick={() => window.location.reload()} className="rounded-xl bg-clinico-azul px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Recargar
          </button>
        </div>
      </div>
    )
  }
}
