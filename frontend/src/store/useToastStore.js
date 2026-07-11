import { create } from 'zustand'

let siguienteId = 1

export const useToastStore = create((set, get) => ({
  toasts: [],

  mostrar: (mensaje, tipo = 'exito') => {
    const id = siguienteId++
    set({ toasts: [...get().toasts, { id, mensaje, tipo }] })
    setTimeout(() => get().quitar(id), 3500)
  },

  quitar: (id) => {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  }
}))

// Atajos para no repetir 'exito' / 'error' en cada llamada
export const toastExito = (mensaje) => useToastStore.getState().mostrar(mensaje, 'exito')
export const toastError = (mensaje) => useToastStore.getState().mostrar(mensaje, 'error')
