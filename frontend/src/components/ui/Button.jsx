const variantes = {
  primario: 'bg-clinico-azul text-white shadow-sm shadow-clinico-azul/20 hover:bg-[#184e75]',
  secundario: 'bg-white text-clinico-azul border border-slate-200 hover:bg-clinico-azulClaro',
  peligro: 'bg-clinico-rojo text-white hover:bg-red-700'
}

export function Button({ children, variante = 'primario', className = '', ...props }) {
  return (
    <button
      className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${variantes[variante]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
