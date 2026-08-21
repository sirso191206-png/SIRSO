import { useState } from 'react'
import { useConsentimientos } from '../../hooks/useConsentimientos'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { imprimirConsentimiento } from './imprimirConsentimiento'
import { calcularEdad } from '../../lib/fechas'
import { PadFirma } from '../PadFirma'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'

export function TabConsentimientos({ pacienteId, paciente }) {
  const { consentimientos, cargando, agregar, revocar } = useConsentimientos(pacienteId)
  const perfil = useAuthStore((s) => s.perfil)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [imprimiendoId, setImprimiendoId] = useState(null)
  const [consentimientoARevocar, setConsentimientoARevocar] = useState(null)

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
          <div key={c.id} className={`flex items-center justify-between rounded-xl border p-4 ${c.revocado_en ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-slate-200 bg-white'}`}>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-800">{c.procedimiento}</span>
                {c.grado_urgencia && c.grado_urgencia !== 'electivo' && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${c.grado_urgencia === 'emergencia' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {c.grado_urgencia}
                  </span>
                )}
                {c.revocado_en && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-600">Revocado</span>
                )}
              </div>
              <div className="text-xs text-slate-400">
                {new Date(c.creado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                {c.fecha_procedimiento && ` · Procedimiento: ${new Date(c.fecha_procedimiento + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                {c.dentista?.nombre && ` · ${c.dentista.nombre}`}
                {c.firma_paciente_png && ' · ✓ Firmado'}
                {c.revocado_en && ` · Revocado el ${new Date(c.revocado_en).toLocaleDateString('es-MX')}`}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!c.revocado_en && (
                <button
                  onClick={() => setConsentimientoARevocar(c)}
                  className="text-xs font-medium text-clinico-rojo hover:underline"
                >
                  Revocar
                </button>
              )}
              <button
                onClick={() => handleImprimir(c)}
                disabled={imprimiendoId === c.id}
                className="text-xs font-medium text-clinico-azul hover:underline disabled:opacity-50"
              >
                {imprimiendoId === c.id ? 'Generando…' : '🖨 Ver / imprimir'}
              </button>
            </div>
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

      <ModalRevocar
        consentimiento={consentimientoARevocar}
        onCerrar={() => setConsentimientoARevocar(null)}
        onRevocar={revocar}
        usuarioId={perfil?.id}
      />
    </div>
  )
}

function ModalRevocar({ consentimiento, onCerrar, onRevocar, usuarioId }) {
  const [motivo, setMotivo] = useState('')
  const [procesando, setProcesando] = useState(false)

  const handleRevocar = async () => {
    setProcesando(true)
    try {
      await onRevocar(consentimiento.id, { usuarioId, motivo })
      toastExito('Consentimiento revocado.')
      setMotivo('')
      onCerrar()
    } catch (err) {
      toastError('No se pudo revocar: ' + err.message)
    } finally {
      setProcesando(false)
    }
  }

  return (
    <Modal abierto={!!consentimiento} onCerrar={onCerrar} titulo="Revocar consentimiento">
      <p className="mb-4 text-sm text-slate-600">
        El paciente tiene plena libertad de revocar su autorización en cualquier momento antes de
        realizarse el tratamiento. Esto queda registrado con fecha y no se puede deshacer — el
        consentimiento original se conserva, solo se marca como revocado.
      </p>
      <label className="mb-4 block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Motivo (opcional)</span>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </label>
      <div className="flex gap-3">
        <Button variante="secundario" onClick={onCerrar} className="flex-1" disabled={procesando}>Cancelar</Button>
        <Button variante="peligro" onClick={handleRevocar} className="flex-1" disabled={procesando}>
          {procesando ? 'Revocando…' : 'Confirmar revocación'}
        </Button>
      </div>
    </Modal>
  )
}

function ModalNuevoConsentimiento({ abierto, onCerrar, onGuardar, perfil, paciente }) {
  const [diagnostico, setDiagnostico] = useState('')
  const [procedimiento, setProcedimiento] = useState('')
  const [pronostico, setPronostico] = useState('')
  const [riesgos, setRiesgos] = useState('')
  const [molestias, setMolestias] = useState('')
  const [beneficios, setBeneficios] = useState('')
  const [alternativas, setAlternativas] = useState('')
  const [motivoEleccion, setMotivoEleccion] = useState('')
  const [gradoUrgencia, setGradoUrgencia] = useState('electivo')
  const [lugar, setLugar] = useState('')
  const [fechaProcedimiento, setFechaProcedimiento] = useState('')
  const [firmaPacienteNombre, setFirmaPacienteNombre] = useState(() => {
    const edad = calcularEdad(paciente?.fecha_nacimiento)
    const esMenor = edad !== null && edad < 18
    if (esMenor && paciente?.tutor_legal?.nombre) {
      return `${paciente.tutor_legal.nombre} (tutor de ${paciente.nombre_completo})`
    }
    return paciente?.nombre_completo ?? ''
  })
  const [firmaPacientePng, setFirmaPacientePng] = useState(null)
  const [firmaMedicoNombre, setFirmaMedicoNombre] = useState(perfil?.nombre ?? '')
  const [firmaMedicoPng, setFirmaMedicoPng] = useState(null)
  const [testigo1, setTestigo1] = useState('')
  const [testigo2, setTestigo2] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cerrar = () => {
    setDiagnostico(''); setProcedimiento(''); setPronostico(''); setRiesgos(''); setMolestias('')
    setBeneficios(''); setAlternativas(''); setMotivoEleccion(''); setGradoUrgencia('electivo'); setLugar('')
    setFechaProcedimiento('')
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
        diagnostico: diagnostico || null,
        procedimiento,
        pronostico: pronostico || null,
        riesgos: riesgos || null,
        molestias_efectos_secundarios: molestias || null,
        beneficios: beneficios || null,
        alternativas: alternativas || null,
        motivo_eleccion: motivoEleccion || null,
        grado_urgencia: gradoUrgencia || null,
        lugar: lugar || null,
        fecha_procedimiento: fechaProcedimiento || null,
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Diagnóstico</span>
            <textarea value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Grado de urgencia</span>
            <select value={gradoUrgencia} onChange={(e) => setGradoUrgencia(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="electivo">Electivo</option>
              <option value="urgente">Urgente</option>
              <option value="emergencia">Emergencia</option>
            </select>
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Procedimiento</span>
          <textarea value={procedimiento} onChange={(e) => setProcedimiento(e.target.value)} rows={2} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Pronóstico (opcional)</span>
          <textarea value={pronostico} onChange={(e) => setPronostico(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Riesgos y complicaciones (opcional)</span>
            <textarea value={riesgos} onChange={(e) => setRiesgos(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Posibles molestias o efectos secundarios (opcional)</span>
            <textarea value={molestias} onChange={(e) => setMolestias(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Beneficios (opcional)</span>
          <textarea value={beneficios} onChange={(e) => setBeneficios(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Alternativa(s) de tratamiento (opcional)</span>
            <textarea value={alternativas} onChange={(e) => setAlternativas(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Motivo de elección (opcional)</span>
            <textarea value={motivoEleccion} onChange={(e) => setMotivoEleccion(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
        </div>

        <Input label="Lugar (opcional — por defecto, el domicilio de la clínica)" value={lugar} onChange={(e) => setLugar(e.target.value)} />
        <Input label="Fecha del procedimiento (opcional, si es distinta a hoy)" type="date" value={fechaProcedimiento} onChange={(e) => setFechaProcedimiento(e.target.value)} />

        {(() => {
          const edad = calcularEdad(paciente?.fecha_nacimiento)
          const esMenor = edad !== null && edad < 18
          if (!esMenor || paciente?.tutor_legal?.nombre) return null
          return (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              ⚠ Este paciente es menor de edad y no tiene tutor/representante legal registrado. Un menor no
              puede otorgar consentimiento válido por sí mismo — agrega el tutor en "Datos generales" antes
              de firmar, o escribe su nombre manualmente abajo.
            </div>
          )
        })()}

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
