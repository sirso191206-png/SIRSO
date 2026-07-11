export function SeccionLista({ titulo, items, vacio, render }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{titulo}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">{vacio}</p>
      ) : (
        <div className="space-y-2">{items.map(render)}</div>
      )}
    </div>
  )
}
