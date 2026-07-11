export function Input({ label, className = '', ...props }) {
  return (
    <label className="block text-sm">
      {label && <span className="mb-1 block font-medium text-slate-700">{label}</span>}
      <input
        className={`w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-clinico-azul focus:outline-none focus:ring-1 focus:ring-clinico-azul ${className}`}
        {...props}
      />
    </label>
  )
}
