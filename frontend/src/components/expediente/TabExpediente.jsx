import { useState } from 'react'
import { useExpediente } from '../../hooks/useExpediente'
import { useSignosVitales } from '../../hooks/useSignosVitales'
import { useAuthStore } from '../../store/useAuthStore'
import { toastExito, toastError } from '../../store/useToastStore'
import { EditorAlergias } from './EditorAlergias'
import { EditorLista } from './EditorLista'
import { EditorHeredofamiliares } from './EditorHeredofamiliares'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

const SUBTABS = ['General', 'Notas y consultas', 'Signos vitales']

export function TabExpediente({ pacienteId }) {
  const [subtab, setSubtab] = useState('General')

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-100 pb-px">
        {SUBTABS.map((t) => (
          <button
            key={t}
            onClick={() => setSubtab(t)}
            className={`whitespace-nowrap rounded-t-lg px-3 py-1.5 text-xs font-medium ${
              subtab === t ? 'bg-clinico-azulClaro text-clinico-azul' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {subtab === 'General' && <SeccionGeneral pacienteId={pacienteId} />}
      {subtab === 'Notas y consultas' && <SeccionNotas pacienteId={pacienteId} />}
      {subtab === 'Signos vitales' && <SeccionSignosVitales pacienteId={pacienteId} />}
    </div>
  )
}

// ============================================================
// General: alergias, antecedentes, datos médicos, hábitos
// ============================================================
function SeccionGeneral({ pacienteId }) {
  const { expediente, cargando, guardarAntecedentes } = useExpediente(pacienteId)

  if (cargando || !expediente) return <p className="text-slate-400">Cargando expediente…</p>

  const guardarCampo = async (campo, valor, mensaje) => {
    try {
      await guardarAntecedentes({ [campo]: valor })
      toastExito(mensaje)
    } catch (err) {
      toastError('No se pudo guardar: ' + err.message)
    }
  }

  return (
    <div className="space-y-4">
      <EditorAlergias
        alergias={expediente.alergias}
        onGuardar={(nueva) => guardarCampo('alergias', nueva, 'Alergias actualizadas.')}
      />

      <EditorHeredofamiliares
        familiares={expediente.antecedentes_heredofamiliares}
        onGuardar={(nueva) => guardarCampo('antecedentes_heredofamiliares', nueva, 'Antecedentes heredofamiliares actualizados.')}
      />

      <AntecedentesFamiliaresForm expediente={expediente} onGuardar={guardarAntecedentes} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <EditorLista
          etiqueta="Enfermedades actuales"
          items={expediente.enfermedades}
          placeholder="Ej. Diabetes tipo 2"
          onGuardar={(nueva) => guardarCampo('enfermedades', nueva, 'Enfermedades actualizadas.')}
        />
        <EditorLista
          etiqueta="Medicamentos actuales"
          items={expediente.medicamentos_actuales}
          placeholder="Ej. Metformina 850mg"
          onGuardar={(nueva) => guardarCampo('medicamentos_actuales', nueva, 'Medicamentos actualizados.')}
        />
        <EditorLista
          etiqueta="Cirugías anteriores"
          items={expediente.cirugias_anteriores}
          placeholder="Ej. Apendicectomía (2019)"
          onGuardar={(nueva) => guardarCampo('cirugias_anteriores', nueva, 'Cirugías actualizadas.')}
        />
        <EditorLista
          etiqueta="Hospitalizaciones"
          items={expediente.hospitalizaciones}
          placeholder="Ej. Neumonía (2021)"
          onGuardar={(nueva) => guardarCampo('hospitalizaciones', nueva, 'Hospitalizaciones actualizadas.')}
        />
      </div>

      <HabitosForm expediente={expediente} onGuardar={guardarAntecedentes} />
    </div>
  )
}

function AntecedentesFamiliaresForm({ expediente, onGuardar }) {
  const [editando, setEditando] = useState(!expediente.antecedentes_familiares)
  const [valor, setValor] = useState(expediente.antecedentes_familiares ?? '')
  const [guardando, setGuardando] = useState(false)

  if (!editando) {
    return (
      <div className="rounded-xl border border-slate-200 p-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Notas adicionales sobre antecedentes familiares</span>
          <button type="button" onClick={() => setEditando(true)} className="text-xs font-medium text-clinico-azul hover:underline">
            Editar
          </button>
        </div>
        <div className="mb-1 flex justify-between text-xs text-slate-400">
          <span>Actualizado</span>
          <span>{new Date(expediente.actualizado_en).toLocaleString('es-MX')}</span>
        </div>
        <p className="text-sm text-slate-700">{expediente.antecedentes_familiares}</p>
      </div>
    )
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        setGuardando(true)
        try {
          await onGuardar({ antecedentes_familiares: valor })
          toastExito('Antecedentes familiares actualizados.')
          setEditando(false)
        } catch (err) {
          toastError('No se pudo guardar: ' + err.message)
        } finally {
          setGuardando(false)
        }
      }}
      className="rounded-xl border border-slate-200 p-4"
    >
      <Input label="Notas adicionales sobre antecedentes familiares" value={valor} onChange={(e) => setValor(e.target.value)} />
      <div className="mt-3 flex items-center gap-3">
        <Button variante="secundario" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
        {expediente.antecedentes_familiares && (
          <button type="button" onClick={() => { setValor(expediente.antecedentes_familiares ?? ''); setEditando(false) }} className="text-sm text-slate-400 hover:text-slate-600">
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

function HabitosForm({ expediente, onGuardar }) {
  const [editando, setEditando] = useState(false)
  const [antecedentesOdontologicos, setAntecedentesOdontologicos] = useState(expediente.antecedentes_odontologicos ?? '')
  const [tabaquismo, setTabaquismo] = useState(expediente.tabaquismo ?? 'no')
  const [consumoAlcohol, setConsumoAlcohol] = useState(expediente.consumo_alcohol ?? 'no')
  const [bruxismo, setBruxismo] = useState(expediente.bruxismo ?? false)
  const [higieneDental, setHigieneDental] = useState(expediente.higiene_dental ?? 'buena')
  const [frecuenciaCepillado, setFrecuenciaCepillado] = useState(expediente.frecuencia_cepillado ?? '')
  const [guardando, setGuardando] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      await onGuardar({
        antecedentes_odontologicos: antecedentesOdontologicos,
        tabaquismo,
        consumo_alcohol: consumoAlcohol,
        bruxismo,
        higiene_dental: higieneDental,
        frecuencia_cepillado: frecuenciaCepillado
      })
      toastExito('Hábitos y antecedentes odontológicos actualizados.')
      setEditando(false)
    } catch (err) {
      toastError('No se pudo guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  const OPCIONES = { no: 'No', ocasional: 'Ocasional', frecuente: 'Frecuente' }
  const OPCIONES_HIGIENE = { buena: 'Buena', regular: 'Regular', mala: 'Mala' }

  if (!editando) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Hábitos y antecedentes odontológicos</span>
          <button onClick={() => setEditando(true)} className="text-xs font-medium text-clinico-azul hover:underline">Editar</button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 sm:grid-cols-3">
          <span>Tabaquismo: <strong>{OPCIONES[expediente.tabaquismo] ?? '—'}</strong></span>
          <span>Alcohol: <strong>{OPCIONES[expediente.consumo_alcohol] ?? '—'}</strong></span>
          <span>Bruxismo: <strong>{expediente.bruxismo ? 'Sí' : 'No'}</strong></span>
          <span>Higiene dental: <strong>{OPCIONES_HIGIENE[expediente.higiene_dental] ?? '—'}</strong></span>
          <span>Cepillado: <strong>{expediente.frecuencia_cepillado || '—'}</strong></span>
        </div>
        {expediente.antecedentes_odontologicos && (
          <p className="mt-3 text-sm text-slate-700">{expediente.antecedentes_odontologicos}</p>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <span className="block text-sm font-semibold text-slate-700">Hábitos y antecedentes odontológicos</span>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Antecedentes odontológicos</span>
        <textarea value={antecedentesOdontologicos} onChange={(e) => setAntecedentesOdontologicos(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </label>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Tabaquismo</span>
          <select value={tabaquismo} onChange={(e) => setTabaquismo(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            {Object.entries(OPCIONES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Consumo de alcohol</span>
          <select value={consumoAlcohol} onChange={(e) => setConsumoAlcohol(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            {Object.entries(OPCIONES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Higiene dental</span>
          <select value={higieneDental} onChange={(e) => setHigieneDental(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            {Object.entries(OPCIONES_HIGIENE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <Input label="Frecuencia de cepillado" value={frecuenciaCepillado} onChange={(e) => setFrecuenciaCepillado(e.target.value)} placeholder="Ej. 2 veces al día" />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={bruxismo} onChange={(e) => setBruxismo(e.target.checked)} />
          Bruxismo
        </label>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
        <button type="button" onClick={() => setEditando(false)} className="text-sm text-slate-400 hover:text-slate-600">Cancelar</button>
      </div>
    </form>
  )
}

// ============================================================
// Notas y consultas
// ============================================================
function SeccionNotas({ pacienteId }) {
  const { expediente, notas, cargando, agregarNota } = useExpediente(pacienteId)
  const perfil = useAuthStore((s) => s.perfil)
  const [modoCompleto, setModoCompleto] = useState(false)
  const [contenido, setContenido] = useState('')
  const [diagnostico, setDiagnostico] = useState('')
  const [pronostico, setPronostico] = useState('')
  const [planTratamiento, setPlanTratamiento] = useState('')
  const [guardando, setGuardando] = useState(false)

  if (cargando || !expediente) return <p className="text-slate-400">Cargando…</p>

  const limpiar = () => {
    setContenido('')
    setDiagnostico('')
    setPronostico('')
    setPlanTratamiento('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!contenido.trim()) return
    setGuardando(true)
    try {
      await agregarNota({
        contenido,
        tipo: 'consulta',
        usuario_id: perfil.id,
        diagnostico: modoCompleto ? diagnostico || null : null,
        pronostico: modoCompleto ? pronostico || null : null,
        plan_tratamiento: modoCompleto ? planTratamiento || null : null
      })
      toastExito('Nota clínica agregada.')
      limpiar()
    } catch (err) {
      toastError('No se pudo agregar la nota: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Nueva nota</span>
          <button type="button" onClick={() => setModoCompleto(!modoCompleto)} className="text-xs font-medium text-clinico-azul hover:underline">
            {modoCompleto ? 'Usar nota rápida' : 'Registrar consulta completa'}
          </button>
        </div>

        <textarea
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          placeholder={modoCompleto ? 'Motivo de consulta / notas de la visita…' : 'Nota rápida de esta consulta…'}
          rows={2}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />

        {modoCompleto && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Diagnóstico</span>
              <input value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Pronóstico</span>
              <input value={pronostico} onChange={(e) => setPronostico(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Plan de tratamiento</span>
              <input value={planTratamiento} onChange={(e) => setPlanTratamiento(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
          </div>
        )}

        <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Agregar'}</Button>
      </form>

      <div className="space-y-3">
        {notas.map((n) => (
          <div key={n.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="mb-1 flex justify-between text-xs text-slate-400">
              <span>{n.usuario?.nombre}</span>
              <span>{new Date(n.creado_en).toLocaleString('es-MX')}</span>
            </div>
            <p className="text-slate-700">{n.contenido}</p>
            {(n.diagnostico || n.pronostico || n.plan_tratamiento) && (
              <div className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-xs text-slate-600">
                {n.diagnostico && <div><span className="font-medium">Diagnóstico:</span> {n.diagnostico}</div>}
                {n.pronostico && <div><span className="font-medium">Pronóstico:</span> {n.pronostico}</div>}
                {n.plan_tratamiento && <div><span className="font-medium">Plan de tratamiento:</span> {n.plan_tratamiento}</div>}
              </div>
            )}
            {n.editado && <span className="text-xs text-slate-400">(corregida posteriormente)</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// Signos vitales
// ============================================================
function calcularImc(peso, estatura) {
  if (!peso || !estatura) return null
  const estaturaMetros = estatura / 100
  return (peso / (estaturaMetros * estaturaMetros)).toFixed(1)
}

function SeccionSignosVitales({ pacienteId }) {
  const { registros, cargando, agregar } = useSignosVitales(pacienteId)
  const perfil = useAuthStore((s) => s.perfil)
  const [form, setForm] = useState({
    presion_arterial: '', frecuencia_cardiaca: '', temperatura: '', peso: '', estatura: '',
    frecuencia_respiratoria: '', saturacion_oxigeno: '', glucosa_capilar: ''
  })
  const [guardando, setGuardando] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      await agregar({
        presion_arterial: form.presion_arterial || null,
        frecuencia_cardiaca: form.frecuencia_cardiaca ? Number(form.frecuencia_cardiaca) : null,
        temperatura: form.temperatura ? Number(form.temperatura) : null,
        peso: form.peso ? Number(form.peso) : null,
        estatura: form.estatura ? Number(form.estatura) : null,
        frecuencia_respiratoria: form.frecuencia_respiratoria ? Number(form.frecuencia_respiratoria) : null,
        saturacion_oxigeno: form.saturacion_oxigeno ? Number(form.saturacion_oxigeno) : null,
        glucosa_capilar: form.glucosa_capilar ? Number(form.glucosa_capilar) : null,
        registrado_por: perfil.id
      })
      toastExito('Signos vitales registrados.')
      setForm({
        presion_arterial: '', frecuencia_cardiaca: '', temperatura: '', peso: '', estatura: '',
        frecuencia_respiratoria: '', saturacion_oxigeno: '', glucosa_capilar: ''
      })
    } catch (err) {
      toastError('No se pudo guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) return <p className="text-slate-400">Cargando…</p>

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <Input label="Presión arterial" placeholder="120/80" value={form.presion_arterial} onChange={(e) => setForm({ ...form, presion_arterial: e.target.value })} />
        <Input label="Frec. cardiaca" type="number" placeholder="lpm" value={form.frecuencia_cardiaca} onChange={(e) => setForm({ ...form, frecuencia_cardiaca: e.target.value })} />
        <Input label="Frec. respiratoria" type="number" placeholder="rpm" value={form.frecuencia_respiratoria} onChange={(e) => setForm({ ...form, frecuencia_respiratoria: e.target.value })} />
        <Input label="Saturación O₂" type="number" placeholder="%" value={form.saturacion_oxigeno} onChange={(e) => setForm({ ...form, saturacion_oxigeno: e.target.value })} />
        <Input label="Temperatura" type="number" step="0.1" placeholder="°C" value={form.temperatura} onChange={(e) => setForm({ ...form, temperatura: e.target.value })} />
        <Input label="Glucosa capilar" type="number" placeholder="mg/dL (si aplica)" value={form.glucosa_capilar} onChange={(e) => setForm({ ...form, glucosa_capilar: e.target.value })} />
        <Input label="Peso (kg)" type="number" step="0.1" value={form.peso} onChange={(e) => setForm({ ...form, peso: e.target.value })} />
        <Input label="Estatura (cm)" type="number" step="0.1" value={form.estatura} onChange={(e) => setForm({ ...form, estatura: e.target.value })} />
        {form.peso && form.estatura && (
          <p className="col-span-2 text-xs text-slate-500 sm:col-span-4">IMC calculado: <strong>{calcularImc(form.peso, form.estatura)}</strong></p>
        )}
        <div className="col-span-2 sm:col-span-4">
          <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Registrar toma'}</Button>
        </div>
      </form>

      <div className="space-y-2">
        {registros.length === 0 && <p className="text-sm text-slate-400">Sin registros todavía.</p>}
        {registros.map((r) => {
          const imc = calcularImc(r.peso, r.estatura)
          return (
            <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="mb-1 flex justify-between text-xs text-slate-400">
                <span>{r.usuario?.nombre}</span>
                <span>{new Date(r.creado_en).toLocaleString('es-MX')}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-700">
                {r.presion_arterial && <span>PA: {r.presion_arterial}</span>}
                {r.frecuencia_cardiaca && <span>FC: {r.frecuencia_cardiaca} lpm</span>}
                {r.frecuencia_respiratoria && <span>FR: {r.frecuencia_respiratoria} rpm</span>}
                {r.saturacion_oxigeno && <span>SpO₂: {r.saturacion_oxigeno}%</span>}
                {r.temperatura && <span>Temp: {r.temperatura}°C</span>}
                {r.glucosa_capilar && <span>Glucosa: {r.glucosa_capilar} mg/dL</span>}
                {r.peso && <span>Peso: {r.peso} kg</span>}
                {r.estatura && <span>Estatura: {r.estatura} cm</span>}
                {imc && <span>IMC: {imc}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
