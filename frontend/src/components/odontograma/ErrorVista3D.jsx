import { Component } from 'react'

// Si la vista 3D no se puede abrir (el modelo no se descargó, el archivo está desactualizado, no hay conexión) esto lo
// contiene aquí: SIRO sigue funcionando y el resto del expediente no se ve afectado. Sin este límite, un error al
// descargar el modelo se propagaba hasta la raíz y dejaba TODA la aplicación en blanco.
const PATRON_ARCHIVO_DESACTUALIZADO = /dynamically imported module|importing a module script failed|loading chunk|loading css chunk|unexpected token '<'|is not valid json/i

export class ErrorVista3D extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('No se pudo abrir la vista 3D:', error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    // Un archivo de la app que ya no existe (hubo una versión nueva) solo se arregla recargando la página; un fallo
    // del modelo (red, servidor) sí admite "Reintentar" sin recargar.
    const desactualizado = PATRON_ARCHIVO_DESACTUALIZADO.test(String(error?.message ?? ''))
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <div className="font-semibold">No se pudo abrir la vista 3D</div>
        <p>
          {desactualizado
            ? 'Puede que haya una versión nueva de SIRO. Recarga la página para continuar.'
            : 'El modelo 3D no se pudo descargar (revisa tu conexión). El resto del expediente funciona con normalidad.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {desactualizado ? (
            <button onClick={() => window.location.reload()} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">Recargar página</button>
          ) : (
            <button onClick={() => { this.setState({ error: null }); this.props.onReintentar?.() }} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">Reintentar</button>
          )}
          {this.props.onUsar2D && (
            <button onClick={this.props.onUsar2D} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100">Usar vista 2D</button>
          )}
        </div>
      </div>
    )
  }
}
