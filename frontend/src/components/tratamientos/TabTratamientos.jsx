import { useState } from 'react'
import { useTratamientos } from '../../hooks/useTratamientos'
import { useCatalogoTratamientos } from '../../hooks/useCatalogoTratamientos'
import { useAuthStore } from '../../store/useAuthStore'
import { toastError } from '../../store/useToastStore'
import { imprimirPresupuesto } from './imprimirPresupuesto'
import { FilaTratamiento } from './FilaTratamiento'
import { ModalTratamiento } from './ModalTratamiento'
import { SeccionPagos } from './SeccionPagos'
import { Button } from '../ui/Button'

export function TabTratamientos({ pacienteId, paciente }) {
  const { tratamientos, cargando, agregar, cambiarEstado, actualizar, sumarSesion } = useTratamientos(pacienteId)
  const { catalogo } = useCatalogoTratamientos()
  const perfil = useAuthStore((s) => s.perfil)
  const [modalNuevo, setModalNuevo] = useState(false)
  const [tratamientoEditar, setTratamientoEditar] = useState(null)
  const [imprimiendo, setImprimiendo] = useState(false)

  const handleImprimir = async () => {
    const activos = tratamientos.filter((t) => t.estado !== 'cancelado')
    if (activos.length === 0) return toastError('No hay tratamientos para incluir en el presupuesto.')
    setImprimiendo(true)
    try {
      await imprimirPresupuesto({ paciente, tratamientos: activos, clinicaId: perfil.clinica_id })
    } catch (err) {
      toastError(err.message)
    } finally {
      setImprimiendo(false)
    }
  }

  if (cargando) return <p className="text-slate-400">Cargando…</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <Button onClick={() => setModalNuevo(true)}>+ Nuevo tratamiento</Button>
        <Button variante="secundario" onClick={handleImprimir} disabled={imprimiendo}>
          {imprimiendo ? 'Generando…' : '🖨 Presupuesto imprimible'}
        </Button>
      </div>

      <div className="space-y-2">
        {tratamientos.length === 0 && <p className="text-sm text-slate-400">Sin tratamientos registrados.</p>}
        {tratamientos.map((t) => (
          <FilaTratamiento
            key={t.id}
            tratamiento={t}
            onEditar={() => setTratamientoEditar(t)}
            onCambiarEstado={cambiarEstado}
            onSumarSesion={sumarSesion}
          />
        ))}
      </div>

      <ModalTratamiento
        abierto={modalNuevo}
        onCerrar={() => setModalNuevo(false)}
        onGuardar={agregar}
        catalogo={catalogo}
        perfil={perfil}
        titulo="Nuevo tratamiento"
      />

      {tratamientoEditar && (
        <ModalTratamiento
          abierto
          onCerrar={() => setTratamientoEditar(null)}
          onGuardar={(cambios) => actualizar(tratamientoEditar.id, cambios)}
          catalogo={catalogo}
          perfil={perfil}
          titulo="Editar tratamiento"
          valorInicial={tratamientoEditar}
        />
      )}

      <SeccionPagos pacienteId={pacienteId} paciente={paciente} />
    </div>
  )
}
