import { useState } from 'react'
import { useConsentimientos } from '../../hooks/useConsentimientos'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { imprimirConsentimiento } from './imprimirConsentimiento'
import { PadFirma } from '../PadFirma'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'

export function TabConsentimientos({ pacienteId, paciente }) {
  const { consentimientos, cargando, agregar } = useConsentimientos(pacienteId)
  const perfil = useAuthStore((s) => s.perfil)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [imprimiendoId, setImprimiendoId] = useState(null)

  const handleImprimir = async (c) => {
    setImprimiendoId(c.id)
    try {
      await imprimirConsentimiento({ consentimiento: c, paciente, clinicaId: perfil.clinica_id })
    } catch (err) {
      toastError(err.message)
    } finally {
      setImprimiendoId(null)
    }
  }

  if (cargando) return <p className="text-slate-400">Cargando…</p>

  return (
    <div className="space-y-4">
      <Button onClick={() => setModalAbierto(true)}>+ Nuevo consentimiento</Button>

      {consentimientos.length === 0 && <p className="text-sm text-slate-400">Sin consentimientos registrados.</p>}

      <div className="space-y-2">
        {consentimientos.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <div className="font-medium text-slate-800">{c.procedimiento}</div>
              <div className="text-xs text-slate-400">
                {new Date(c.creado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                {c.dentista?.nombre && ` · ${c.dentista.nombre}`}
                {c.firma_paciente_png && ' · ✓ Firmado'}
              </div>
            </div>
            <button
              onClick={() => handleImprimir(c)}
              disabled={imprimiendoId === c.id}
              className="text-xs font-medium text-clinico-azul hover:underline disabled:opacity-50"
            >
              {imprimiendoId === c.id ? 'Generando…' : '🖨 Ver / imprimir'}
            </button>
          </div>
        ))}
      </div>

      <ModalNuevoConsentimiento
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        onGuardar={agregar}
        perfil={perfil}
        paciente={paciente}
      />
    </div>
  )
}

function ModalNuevoConsentimiento({ abierto, onCerrar, onGuardar, perfil, paciente }) {
  const [procedimiento, setProcedimiento] = useState('')
  const [riesgos, setRiesgos] = useState('')
  const [beneficios, setBeneficios] = useState('')
  const [alternativas, setAlternativas] = useState('')
  const [firmaPacienteNombre, setFirmaPacienteNombre] = useState(paciente?.nombre_completo ?? '')
  const [firmaPacientePng, setFirmaPacientePng] = useState(null)
  const [firmaMedicoNombre, setFirmaMedicoNombre] = useState(perfil?.nombre ?? '')
  const [firmaMedicoPng, setFirmaMedicoPng] = useState(null)
  const [testigo1, setTestigo1] = useState('')
  const [testigo2, setTestigo2] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cerrar = () => {
    setProcedimiento(''); setRiesgos(''); setBeneficios(''); setAlternativas('')
    setFirmaPacientePng(null); setFirmaMedicoPng(null); setTestigo1(''); setTestigo2('')
    onCerrar()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!procedimiento.trim()) {
      toastError('Describe el procedimiento.')
      return
    }
    setGuardando(true)
    try {
      await onGuardar({
        dentista_id: perfil.id,
        procedimiento,
        riesgos: riesgos || null,
        beneficios: beneficios || null,
        alternativas: alternativas || null,
        firma_paciente_nombre: firmaPacienteNombre || null,
        firma_paciente_png: firmaPacientePng,
        firma_medico_nombre: firmaMedicoNombre || null,
        firma_medico_png: firmaMedicoPng,
        testigo1_nombre: testigo1 || null,
        testigo2_nombre: testigo2 || null
      })
      toastExito('Consentimiento guardado.')
      cerrar()
    } catch (err) {
      toastError('No se pudo guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={cerrar} titulo="Nuevo consentimiento informado" ancho="grande">
      <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Procedimiento</span>
          <textarea value={procedimiento} onChange={(e) => setProcedimiento(e.target.value)} rows={2} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Riesgos (opcional)</span>
          <textarea value={riesgos} onChange={(e) => setRiesgos(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Beneficios (opcional)</span>
          <textarea value={beneficios} onChange={(e) => setBeneficios(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Alternativas (opcional)</span>
          <textarea value={alternativas} onChange={(e) => setAlternativas(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Input label="Nombre de quien firma (paciente/tutor)" value={firmaPacienteNombre} onChange={(e) => setFirmaPacienteNombre(e.target.value)} />
            <div className="mt-2">
              <PadFirma onCambiar={setFirmaPacientePng} />
            </div>
          </div>
          <div>
            <Input label="Nombre del profesional" value={firmaMedicoNombre} onChange={(e) => setFirmaMedicoNombre(e.target.value)} />
            <div className="mt-2">
              <PadFirma onCambiar={setFirmaMedicoPng} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Testigo 1 (opcional)" value={testigo1} onChange={(e) => setTestigo1(e.target.value)} />
          <Input label="Testigo 2 (opcional)" value={testigo2} onChange={(e) => setTestigo2(e.target.value)} />
        </div>

        <Button type="submit" disabled={guardando} className="w-full">
          {guardando ? 'Guardando…' : 'Guardar consentimiento'}
        </Button>
      </form>
    </Modal>
  )
}
