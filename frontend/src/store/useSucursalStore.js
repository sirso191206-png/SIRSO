import { create } from 'zustand'

// null = "todas las sucursales" — el valor por defecto es seguro para
// cualquier clínica, incluidas las que nunca crearon una sucursal (en
// ese caso este store simplemente nunca se usa para filtrar nada,
// porque el selector ni siquiera se muestra).
export const useSucursalStore = create((set) => ({
  sucursalActualId: null,
  setSucursalActual: (id) => set({ sucursalActualId: id })
}))
