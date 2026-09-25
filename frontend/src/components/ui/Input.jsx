export function Input({ label, className = '', ...props }) {
  return (
    <label className="block text-sm">
      {label && <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>}
      <input
        className={`w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm transition-all duration-150 focus:border-clinico-azul focus:outline-none focus:ring-2 focus:ring-clinico-azul/20 ${className}`}
        {...props}
      />
    </label>
  )
}
