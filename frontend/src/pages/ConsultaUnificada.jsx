import { useParams } from 'react-router-dom'
import { useConsultaForm } from '../hooks/useConsultaForm'
import { useAuthStore } from '../store/useAuthStore'
import { Odontograma } from '../components/odontograma/Odontograma'
import { SelectorCie10 } from '../components/SelectorCie10'
import { InterrogatorioSistemas } from '../components/InterrogatorioSistemas'
import { ExploracionFisica } from '../components/ExploracionFisica'
import { AccionSaludBucal } from '../components/AccionSaludBucal'
import { TabExpediente } from '../components/expediente/TabExpediente'
import { ModalTratamiento } from '../components/tratamientos/ModalTratamiento'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'

const MOTIVOS_RAPIDOS = ['Dolor', 'Revisión', 'Limpieza', 'Sensibilidad', 'Seguimiento', 'Urgencia']
const HALLAZGOS_RAPIDOS = ['Sin alteraciones', 'Caries', 'Inflamación', 'Sangrado', 'Sensibilidad', 'Movilidad']

const FRASES_RAPIDAS = [
  'Sin dolor', 'Sin alergias conocidas', 'Buena higiene',
  'Sangrado gingival', 'Sensibilidad', 'Evolución favorable', 'Se brindan indicaciones'
]

export function ConsultaUnificada() {
  const { citaId } = useParams()
  const perfil = useAuthStore((s) => s.perfil)
  const f = useConsultaForm(citaId)

  if (f.cargandoCita || !f.cita) return <p className="text-slate-400">Cargando consulta…</p>

  if (!['owner', 'dentista'].includes(perfil?.rol)) {
    return <p className="text-slate-400">Esta sección solo está disponible para owner y dentista.</p>
  }

  if (perfil?.rol === 'dentista' && f.cita.dentista_id !== perfil.id) {
    return <p className="text-slate-400">Esta consulta pertenece a otro dentista — no puedes editarla.</p>
  }

  const alergias = f.expediente?.alergias ?? []
  const enfermedades = f.expediente?.enfermedades ?? []
  const medicamentos = f.expediente?.medicamentos_actuales ?? []

  return (
    <div className="space-y-6 pb-12">
      {/* Encabezado */}
      <div className="rounded-xl border-2 border-clinico-azul bg-clinico-azulClaro/40 p-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-clinico-azul">Consulta</div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">{f.cita.paciente?.nombre_completo}</h1>
            <p className="text-sm text-slate-500">{f.cita.paciente?.numero_expediente}</p>
          </div>
          <Button variante="secundario" onClick={() => f.setModalExpediente(true)}>Ver expediente completo</Button>
        </div>
        {(alergias.length > 0 || enfermedades.length > 0 || medicamentos.length > 0) && (
          <div className="mt-3 space-y-0.5 rounded-lg bg-white p-3 text-sm">
            {alergias.map((a, i) => <div key={`a-${i}`} className="text-clinico-rojo">⚠ Alergia: {a.sustancia} ({a.severidad})</div>)}
            {enfermedades.map((e, i) => <div key={`e-${i}`} className="text-clinico-ambar">{e}</div>)}
            {medicamentos.length > 0 && <div className="text-slate-600">Medicamentos: {medicamentos.join(', ')}</div>}
          </div>
        )}
      </div>

      {/* Sección 1: Motivo */}
      <Seccion titulo="1. Motivo de consulta">
        <BotonesRapidos opciones={MOTIVOS_RAPIDOS} onClick={f.setMotivo} />
        <Input label="Motivo" value={f.motivo} onChange={(e) => f.setMotivo(e.target.value)} placeholder="Escribe o elige una opción rápida" />
      </Seccion>

      {/* Sección 2: Hallazgos */}
      <Seccion titulo="2. Hallazgos clínicos">
        <BotonesRapidos opciones={HALLAZGOS_RAPIDOS} onClick={(op) => f.setHallazgos((actual) => actual.includes(op) ? actual : (actual ? `${actual}, ${op}` : op))} />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Exploración</span>
          <textarea value={f.hallazgos} onChange={(e) => f.setHallazgos(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </Seccion>

      <Seccion titulo="Interrogatorio por aparatos y sistemas">
        <InterrogatorioSistemas valor={f.interrogatorioSistemas} onCambiar={f.setInterrogatorioSistemas} />
      </Seccion>

      <Seccion titulo="Exploración física">
        <ExploracionFisica valor={f.exploracionFisica} onCambiar={f.setExploracionFisica} />
      </Seccion>

      <Seccion titulo="Acciones de salud bucal">
        <AccionSaludBucal valor={f.accionSaludBucal} onCambiar={f.setAccionSaludBucal} />
      </Seccion>

      {/* Sección 3: Diagnóstico */}
      <Seccion titulo="3. Diagnóstico">
        <label className="mb-1 block text-xs font-medium text-slate-500">Código CIE-10 (opcional)</label>
        <SelectorCie10
          codigo={f.diagnosticoCie10Codigo}
          descripcion={f.diagnosticoCie10Descripcion}
          onSeleccionar={(r) => { f.setDiagnosticoCie10Codigo(r.codigo); f.setDiagnosticoCie10Descripcion(r.descripcion) }}
          onLimpiar={() => { f.setDiagnosticoCie10Codigo(''); f.setDiagnosticoCie10Descripcion('') }}
        />

        <label className="mb-1 mt-3 block text-xs font-medium text-slate-500">Descripción clínica</label>
        <input
          list="diagnosticos-frecuentes"
          value={f.diagnostico}
          onChange={(e) => f.setDiagnostico(e.target.value)}
          placeholder="Escribe o elige uno frecuente"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <datalist id="diagnosticos-frecuentes">
          {f.diagnosticosFrecuentes.map((d) => <option key={d} value={d} />)}
        </datalist>
      </Seccion>

      {/* Sección 4: Odontograma rápido */}
      <Seccion titulo="4. Odontograma">
        <Odontograma pacienteId={f.cita.paciente_id} />
      </Seccion>

      {/* Sección 5: Tratamiento */}
      <Seccion titulo="5. Tratamiento">
        <Button variante="secundario" onClick={() => f.setModalTratamiento(true)}>+ Agregar tratamiento</Button>
        <div className="mt-3 space-y-2">
          {f.tratamientos.length === 0 && <p className="text-sm text-slate-400">Sin tratamientos agregados en esta consulta.</p>}
          {f.tratamientos.slice(0, 5).map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-sm">
              <span>{t.descripcion} {t.pieza_dental && `(pieza ${t.pieza_dental})`}</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">${Number(t.costo).toFixed(2)}</span>
                <Badge estado={t.estado} />
              </div>
            </div>
          ))}
        </div>
      </Seccion>

      {/* Sección 6: Nota clínica */}
      <Seccion titulo="6. Nota clínica">
        <div className="mb-2 flex flex-wrap gap-2">
          {Object.keys(f.PLANTILLAS_NOTA).map((p) => (
            <button key={p} onClick={() => f.aplicarPlantillaNota(p)} className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">
              {p}
            </button>
          ))}
        </div>
        <textarea
          value={f.notaContenido}
          onChange={(e) => f.setNotaContenido(e.target.value)}
          rows={4}
          placeholder="Nota clínica de la consulta…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {FRASES_RAPIDAS.map((fr) => (
            <button key={fr} onClick={() => f.agregarFraseRapida(fr)} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200">
              + {fr}
            </button>
          ))}
        </div>
      </Seccion>

      {/* Sección 7: Próxima cita */}
      <Seccion titulo="7. Próxima cita">
        <p className="mb-2 text-sm text-slate-600">¿Programar seguimiento?</p>
        <div className="mb-3 flex gap-2">
          <button
            onClick={() => f.setProgramarSeguimiento(true)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${f.programarSeguimiento ? 'bg-clinico-azul text-white' : 'border border-slate-300 text-slate-600'}`}
          >
            Sí
          </button>
          <button
            onClick={() => f.setProgramarSeguimiento(false)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${!f.programarSeguimiento ? 'bg-clinico-azul text-white' : 'border border-slate-300 text-slate-600'}`}
          >
            No
          </button>
        </div>
        {f.programarSeguimiento && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Input label="Fecha" type="date" value={f.seguimiento.fecha} onChange={(e) => f.setSeguimiento({ ...f.seguimiento, fecha: e.target.value })} />
            <Input label="Hora" type="time" value={f.seguimiento.hora} onChange={(e) => f.setSeguimiento({ ...f.seguimiento, hora: e.target.value })} />
            <Input label="Duración (min)" type="number" value={f.seguimiento.duracion} onChange={(e) => f.setSeguimiento({ ...f.seguimiento, duracion: e.target.value })} />
            <Input label="Motivo" value={f.seguimiento.motivo} onChange={(e) => f.setSeguimiento({ ...f.seguimiento, motivo: e.target.value })} />
          </div>
        )}
      </Seccion>

      {/* Sección 8: Acciones */}
      <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
        <Button variante="secundario" onClick={f.handleGuardarBorrador} disabled={f.guardandoBorrador || f.guardando}>
          {f.guardandoBorrador ? 'Guardando…' : 'Guardar borrador'}
        </Button>
        <Button onClick={f.handleFinalizar} disabled={f.guardando || f.guardandoBorrador || f.finalizada}>
          {f.guardando ? 'Guardando…' : f.finalizada ? 'Consulta guardada ✓' : 'Guardar y finalizar consulta'}
        </Button>
      </div>

      <Modal abierto={f.modalExpediente} onCerrar={() => f.setModalExpediente(false)} titulo="Expediente completo" ancho="grande">
        <TabExpediente pacienteId={f.cita.paciente_id} />
      </Modal>

      {f.modalTratamiento && (
        <ModalTratamiento
          abierto
          onCerrar={() => f.setModalTratamiento(false)}
          onGuardar={f.agregarTratamiento}
          catalogo={f.catalogo}
          perfil={f.perfil}
          titulo="Agregar tratamiento a esta consulta"
        />
      )}
    </div>
  )
}

function Seccion({ titulo, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{titulo}</h2>
      {children}
    </div>
  )
}

function BotonesRapidos({ opciones, onClick }) {
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {opciones.map((op) => (
        <button key={op} onClick={() => onClick(op)} className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">
          {op}
        </button>
      ))}
      <button onClick={() => onClick('')} className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-400 hover:bg-slate-50">
        Otro
      </button>
    </div>
  )
}
