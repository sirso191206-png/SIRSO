import { useId } from 'react'

// Autocompletar con <datalist> nativo: al escribir, el navegador
// sugiere de la lista, pero SIEMPRE se puede escribir algo que no esté
// en ella — a propósito, para nunca bloquear un caso real que no
// estaba contemplado. Sin dependencias externas.

export function CampoAutocompletar({ value, onChange, sugerencias, placeholder, className }) {
  const id = useId()
  return (
    <>
      <input
        list={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={className ?? 'flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm'}
      />
      <datalist id={id}>
        {sugerencias.map((s) => <option key={s} value={s} />)}
      </datalist>
    </>
  )
}
