import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { obtenerPaciente, archivarPaciente, restaurarPaciente } from '../services/pacientes'
import { actualizarCita, buscarCitaIniciableHoy } from '../services/citas'
import { toastExito, toastError } from '../store/useToastStore'

// Extraído de PacienteDetalle.jsx (corte 2B): agrupa el estado y los
// handlers de la ficha de paciente, dejando el componente como un
// renderer que solo consume lo que este hook expone.
export function usePacienteDetalle(id) {
  const navigate = useNavigate()
  const [paciente, setPaciente] = useState(null)
  const [procesando, setProcesando] = useState(false)
  const [iniciandoConsulta, setIniciandoConsulta] = useState(false)

  const recargarPaciente = () => obtenerPaciente(id).then(setPaciente)

  useEffect(() => {
    recargarPaciente()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleArchivar = async () => {
    setProcesando(true)
    try {
      await archivarPaciente(id)
      toastExito('Paciente archivado. Su historial sigue intacto, solo se ocultó de la lista.')
      navigate('/pacientes')
    } catch (err) {
      toastError('No se pudo archivar: ' + err.message)
    } finally {
      setProcesando(false)
    }
  }

  const handleRestaurar = async () => {
    setProcesando(true)
    try {
      await restaurarPaciente(id)
      toastExito('Paciente restaurado.')
      await recargarPaciente()
    } catch (err) {
      toastError('No se pudo restaurar: ' + err.message)
    } finally {
      setProcesando(false)
    }
  }

  const handleIniciarConsulta = async () => {
    setIniciandoConsulta(true)
    try {
      const citaIniciable = await buscarCitaIniciableHoy(id)
      if (!citaIniciable) {
        toastError('Este paciente no tiene una cita agendada para hoy.')
        return
      }
      await actualizarCita(citaIniciable.id, { estado: 'en_consulta' })
      toastExito('Consulta iniciada.')
      navigate(`/consulta/${citaIniciable.id}`)
    } catch (err) {
      toastError(err.message)
    } finally {
      setIniciandoConsulta(false)
    }
  }

  return {
    paciente,
    procesando,
    iniciandoConsulta,
    handleArchivar,
    handleRestaurar,
    handleIniciarConsulta
  }
}
