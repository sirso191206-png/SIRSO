const variantes = {
  primario: 'bg-clinico-azul text-white hover:bg-blue-800',
  secundario: 'bg-white text-clinico-azul border border-clinico-azul hover:bg-clinico-azulClaro',
  peligro: 'bg-clinico-rojo text-white hover:bg-red-700'
}

export function Button({ children, variante = 'primario', className = '', ...props }) {
  return (
    <button
      className={`px-4 py-2 rounded-lg font-medium text-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${variantes[variante]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
