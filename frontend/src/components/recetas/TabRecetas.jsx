import { useState } from 'react'
import { useRecetas } from '../../hooks/useRecetas'
import { useExpediente } from '../../hooks/useExpediente'
import { conflictosDeAlergia } from '../../lib/alergiasMedicamentos'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { imprimirReceta } from './imprimirReceta'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { PadFirma } from '../PadFirma'

const MEDICAMENTO_VACIO = { medicamento: '', presentacion: '', dosis: '', via: '', frecuencia: '', duracion: '', indicaciones: '' }

function calcularVencida(receta) {
  const emision = new Date(receta.creado_en)
  const vence = new Date(emision)
  vence.setDate(vence.getDate() + (receta.vigencia_dias ?? 30))
  return vence < new Date()
}

export function TabRecetas({ pacienteId, paciente }) {
  const { recetas, cargando, agregar } = useRecetas(pacienteId)
  const { expediente } = useExpediente(pacienteId)
  const alergias = expediente?.alergias ?? []
  const perfil = useAuthStore((s) => s.perfil)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [imprimiendoId, setImprimiendoId] = useState(null)

  const handleImprimir = async (receta) => {
    setImprimiendoId(receta.id)
    try {
      await imprimirReceta({ receta, paciente, clinicaId: perfil.clinica_id, alergias })
    } catch (err) {
      toastError(err.message)
    } finally {
      setImprimiendoId(null)
    }
  }

  if (cargando) return <p className="text-slate-400">Cargando…</p>

  return (
    <div className="space-y-4">
      <Button onClick={() => setModalAbierto(true)}>+ Nueva receta</Button>

      {recetas.length === 0 && <p className="text-sm text-slate-400">Sin recetas registradas.</p>}

      <div className="space-y-3">
        {recetas.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                {new Date(r.creado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                {r.dentista?.nombre && ` · ${r.dentista.nombre}`}
                {r.es_controlada && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                    Controlada
                  </span>
                )}
                {r.estado_sync === 'PENDIENTE_SYNC' && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                    Sin subir
                  </span>
                )}
                {r.estado_sync === 'ERROR_SYNC' && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-700">
                    Error al subir
                  </span>
                )}
                {calcularVencida(r) ? (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-700">Vencida</span>
                ) : (
                  <span className="text-[10px] text-slate-400">vigente {r.vigencia_dias ?? 30} días</span>
                )}
              </div>
              <button
                onClick={() => handleImprimir(r)}
                disabled={imprimiendoId === r.id}
                className="inline-flex items-center gap-1 text-xs font-medium text-clinico-azul hover:underline disabled:opacity-50"
              >
                {imprimiendoId === r.id ? 'Generando…' : (<><Icon.printer /> Imprimir</>)}
              </button>
            </div>
            {conflictosDeAlergia(r.medicamentos, alergias).map((c, i) => (
              <p key={i} className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-clinico-rojo">
                ⚠ {c.medicamento}: el paciente tiene registrada alergia a {c.alergia}.
              </p>
            ))}
            <div className="space-y-2">
              {(r.medicamentos ?? []).map((m, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium text-slate-800">{m.medicamento}</span>
                  {m.presentacion && <span className="text-slate-500"> — {m.presentacion}</span>}
                  <div className="text-xs text-slate-500">
                    {[m.dosis, m.via, m.frecuencia, m.duracion].filter(Boolean).join(' · ')}
                  </div>
                </div>
              ))}
            </div>
            {r.indicaciones_generales && (
              <p className="mt-2 text-xs italic text-slate-500">{r.indicaciones_generales}</p>
            )}
          </div>
        ))}
      </div>

      <ModalNuevaReceta
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        onGuardar={agregar}
        perfil={perfil}
        alergias={alergias}
      />
    </div>
  )
}

export function ModalNuevaReceta({ abierto, onCerrar, onGuardar, perfil, alergias = [] }) {
  const [medicamentos, setMedicamentos] = useState([{ ...MEDICAMENTO_VACIO }])
  const [indicacionesGenerales, setIndicacionesGenerales] = useState('')
  const [vigenciaDias, setVigenciaDias] = useState(30)
  const [esControlada, setEsControlada] = useState(false)
  const [firmaPacientePng, setFirmaPacientePng] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [alergiaConfirmada, setAlergiaConfirmada] = useState(false)
  const conflictos = conflictosDeAlergia(medicamentos.filter((m) => m.medicamento.trim()), alergias)

  const cerrar = () => {
    setMedicamentos([{ ...MEDICAMENTO_VACIO }])
    setIndicacionesGenerales('')
    setVigenciaDias(30)
    setEsControlada(false)
    setFirmaPacientePng(null)
    setAlergiaConfirmada(false)
    onCerrar()
  }

  const actualizarMedicamento = (indice, campo, valor) => {
    setMedicamentos((actual) => actual.map((m, i) => (i === indice ? { ...m, [campo]: valor } : m)))
  }

  const agregarMedicamento = () => setMedicamentos((actual) => [...actual, { ...MEDICAMENTO_VACIO }])
  const quitarMedicamento = (indice) => setMedicamentos((actual) => actual.filter((_, i) => i !== indice))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validos = medicamentos.filter((m) => m.medicamento.trim())
    if (validos.length === 0) {
      toastError('Agrega al menos un medicamento.')
      return
    }
    if (conflictos.length > 0 && !alergiaConfirmada) {
      toastError('El paciente es alérgico a algo de esta receta. Cambia el medicamento o confirma que lo revisaste.')
      return
    }
    setGuardando(true)
    try {
      await onGuardar({
        dentista_id: perfil.id,
        medicamentos: validos,
        indicaciones_generales: indicacionesGenerales || null,
        vigencia_dias: Number(vigenciaDias) || 30,
        es_controlada: esControlada,
        // Snapshot de los datos profesionales AL MOMENTO de emitir la
        // receta — si el odontólogo corrige su perfil después, esta
        // receta ya generada debe seguir mostrando estos mismos datos.
        nombre_medico_snapshot: perfil.nombre ?? null,
        rfc_snapshot: perfil.rfc ?? null,
        cedula_profesional_snapshot: perfil.cedula_profesional ?? null,
        escuela_snapshot: perfil.escuela_procedencia ?? null,
        // Firma del dentista: se copia la que ya tiene guardada en su
        // perfil (Datos profesionales) — no se le pide volver a
        // firmar en cada receta. La del paciente sí se captura aquí,
        // porque es específica de esta consulta.
        firma_dentista_png: perfil.firma_png ?? null,
        firma_paciente_png: firmaPacientePng
      })
      toastExito('Receta guardada.')
      cerrar()
    } catch (err) {
      toastError('No se pudo guardar la receta: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={cerrar} titulo="Nueva receta" ancho="grande">
      <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        {alergias.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-clinico-rojo">
            <strong>⚠ Alergias registradas:</strong>{' '}
            {alergias.map((a) => `${a.sustancia}${a.severidad ? ` (${a.severidad})` : ''}`).join(', ')}
          </div>
        )}
        {conflictos.length > 0 && (
          <div role="alert" className="space-y-2 rounded-lg border-2 border-clinico-rojo bg-red-50 p-3 text-sm text-clinico-rojo">
            {conflictos.map((c, i) => (
              <p key={i} className="font-semibold">
                «{c.medicamento}» puede causar reacción: el paciente es alérgico a {c.alergia}{c.severidad ? ` (${c.severidad})` : ''}.
              </p>
            ))}
            <label className="flex items-start gap-2 font-medium">
              <input type="checkbox" checked={alergiaConfirmada} onChange={(e) => setAlergiaConfirmada(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-red-300" />
              Lo revisé y aun así quiero recetarlo.
            </label>
          </div>
        )}
        {medicamentos.map((m, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Medicamento {i + 1}</span>
              {medicamentos.length > 1 && (
                <button type="button" onClick={() => quitarMedicamento(i)} className="text-xs text-clinico-rojo hover:underline">
                  Quitar
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Medicamento" required value={m.medicamento} onChange={(e) => actualizarMedicamento(i, 'medicamento', e.target.value)} />
              <Input label="Presentación" value={m.presentacion} onChange={(e) => actualizarMedicamento(i, 'presentacion', e.target.value)} placeholder="Ej. Tabletas 500mg" />
              <Input label="Dosis" value={m.dosis} onChange={(e) => actualizarMedicamento(i, 'dosis', e.target.value)} placeholder="Ej. 1 tableta" />
              <Input label="Vía" value={m.via} onChange={(e) => actualizarMedicamento(i, 'via', e.target.value)} placeholder="Ej. Oral" />
              <Input label="Frecuencia" value={m.frecuencia} onChange={(e) => actualizarMedicamento(i, 'frecuencia', e.target.value)} placeholder="Ej. Cada 8 horas" />
              <Input label="Duración" value={m.duracion} onChange={(e) => actualizarMedicamento(i, 'duracion', e.target.value)} placeholder="Ej. 5 días" />
            </div>
            <label className="mt-2 block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Indicaciones (opcional)</span>
              <input
                value={m.indicaciones}
                onChange={(e) => actualizarMedicamento(i, 'indicaciones', e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
        ))}

        <button type="button" onClick={agregarMedicamento} className="text-sm font-medium text-clinico-azul hover:underline">
          + Agregar otro medicamento
        </button>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Indicaciones generales (opcional)</span>
          <textarea
            value={indicacionesGenerales}
            onChange={(e) => setIndicacionesGenerales(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
          <Input
            label="Vigencia (días)"
            type="number"
            min="1"
            value={vigenciaDias}
            onChange={(e) => setVigenciaDias(e.target.value)}
          />
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={esControlada} onChange={(e) => setEsControlada(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            <span className="text-slate-700">Contiene medicamento controlado</span>
          </label>
          {esControlada && (
            <p className="col-span-full text-xs text-amber-700">
              SIRO no emite recetario especial numerado (COFEPRIS) — esta marca solo advierte que el
              medicamento lo requiere; el trámite del recetario especial es aparte.
            </p>
          )}
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Firma del paciente (opcional)</span>
          <PadFirma onCambiar={setFirmaPacientePng} />
        </div>

        <Button type="submit" disabled={guardando} className="w-full">
          {guardando ? 'Guardando…' : 'Guardar receta'}
        </Button>
      </form>
    </Modal>
  )
}
