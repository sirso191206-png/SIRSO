import { useToastStore } from '../../store/useToastStore'

export function ToastContainer() {
  const { toasts, quitar } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => quitar(t.id)}
          className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg cursor-pointer animate-[fadeIn_0.15s_ease-out] ${
            t.tipo === 'error' ? 'bg-red-600 text-white' : 'bg-slate-800 text-white'
          }`}
        >
          <span>{t.tipo === 'error' ? '✕' : '✓'}</span>
          {t.mensaje}
        </div>
      ))}
    </div>
  )
}
