import { useState } from 'react'
import { useReferencias } from '../../hooks/useReferencias'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { imprimirReferencia } from './imprimirReferencia'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'

export function TabReferencias({ pacienteId, paciente }) {
  const { referencias, cargando, agregar } = useReferencias(pacienteId)
  const perfil = useAuthStore((s) => s.perfil)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [imprimiendoId, setImprimiendoId] = useState(null)

  const handleImprimir = async (r) => {
    setImprimiendoId(r.id)
    try {
      await imprimirReferencia({ referencia: r, paciente, clinicaId: perfil.clinica_id })
    } catch (err) {
      toastError(err.message)
    } finally {
      setImprimiendoId(null)
    }
  }

  if (cargando) return <p className="text-slate-400">Cargando…</p>

  return (
    <div className="space-y-4">
      <Button onClick={() => setModalAbierto(true)}>+ Nueva referencia</Button>

      {referencias.length === 0 && <p className="text-sm text-slate-400">Sin referencias registradas.</p>}

      <div className="space-y-2">
        {referencias.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  r.direccion === 'enviada' ? 'bg-blue-100 text-clinico-azul' : 'bg-purple-100 text-purple-700'
                }`}>
                  {r.direccion === 'enviada' ? 'ENVIADA' : 'RECIBIDA'}
                </span>
                <span className="font-medium text-slate-800">{r.medico_nombre}</span>
                {r.especialidad && <span className="text-sm text-slate-500">— {r.especialidad}</span>}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                {new Date(r.creado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                {r.motivo && ` · ${r.motivo}`}
              </div>
            </div>
            {r.direccion === 'enviada' && (
              <button
                onClick={() => handleImprimir(r)}
                disabled={imprimiendoId === r.id}
                className="shrink-0 text-xs font-medium text-clinico-azul hover:underline disabled:opacity-50"
              >
                {imprimiendoId === r.id ? 'Generando…' : '🖨 Imprimir carta'}
              </button>
            )}
          </div>
        ))}
      </div>

      <ModalNuevaReferencia
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        onGuardar={agregar}
        perfil={perfil}
      />
    </div>
  )
}

function ModalNuevaReferencia({ abierto, onCerrar, onGuardar, perfil }) {
  const [direccion, setDireccion] = useState('enviada')
  const [medicoNombre, setMedicoNombre] = useState('')
  const [especialidad, setEspecialidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [diagnostico, setDiagnostico] = useState('')
  const [tratamientoRealizado, setTratamientoRealizado] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cerrar = () => {
    setDireccion('enviada'); setMedicoNombre(''); setEspecialidad('')
    setMotivo(''); setDiagnostico(''); setTratamientoRealizado('')
    onCerrar()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!medicoNombre.trim()) {
      toastError('Escribe el nombre del médico.')
      return
    }
    setGuardando(true)
    try {
      await onGuardar({
        dentista_id: perfil.id,
        direccion,
        medico_nombre: medicoNombre,
        especialidad: especialidad || null,
        motivo: motivo || null,
        diagnostico: diagnostico || null,
        tratamiento_realizado: tratamientoRealizado || null
      })
      toastExito('Referencia guardada.')
      cerrar()
    } catch (err) {
      toastError('No se pudo guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={cerrar} titulo="Nueva referencia médica">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDireccion('enviada')}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${direccion === 'enviada' ? 'border-clinico-azul bg-clinico-azulClaro text-clinico-azul' : 'border-slate-300 text-slate-600'}`}
          >
            Enviada (yo refiero al paciente)
          </button>
          <button
            type="button"
            onClick={() => setDireccion('recibida')}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${direccion === 'recibida' ? 'border-clinico-azul bg-clinico-azulClaro text-clinico-azul' : 'border-slate-300 text-slate-600'}`}
          >
            Recibida (otro médico me lo refirió)
          </button>
        </div>

        <Input label="Nombre del médico" required value={medicoNombre} onChange={(e) => setMedicoNombre(e.target.value)} />
        <Input label="Especialidad (opcional)" value={especialidad} onChange={(e) => setEspecialidad(e.target.value)} placeholder="Ej. Cirugía maxilofacial" />

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Motivo</span>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Diagnóstico (opcional)</span>
          <textarea value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Tratamiento realizado (opcional)</span>
          <textarea value={tratamientoRealizado} onChange={(e) => setTratamientoRealizado(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>

        <Button type="submit" disabled={guardando} className="w-full">
          {guardando ? 'Guardando…' : 'Guardar referencia'}
        </Button>
      </form>
    </Modal>
  )
}
