import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePacientesLista } from '../hooks/usePacientesLista'
import { crearPaciente, buscarPosiblesDuplicados, buscarPacientePorCurp } from '../services/pacientes'
import { validarEstructuraCurp, parsearCurp } from '../lib/curp'
import { calcularEdad } from '../lib/fechas'
import { ENTIDAD_FEDERATIVA, GENERO, AFILIACION } from '../features/interoperabilidad/sis/sis-catalogs'
import { toastExito, toastError } from '../store/useToastStore'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'

const POR_PAGINA = 15

export function Pacientes() {
  const navigate = useNavigate()

  const [termino, setTermino] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('activos')
  const [filtroExtra, setFiltroExtra] = useState('')
  const [orden, setOrden] = useState('nombre_completo.asc')
  const [pagina, setPagina] = useState(1)
  const [modalAbierto, setModalAbierto] = useState(false)

  const { pacientes, total, cargando, error } = usePacientesLista({
    termino, filtroEstado, filtroExtra, orden, pagina, porPagina: POR_PAGINA
  })

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  const cambiarFiltro = (setter) => (valor) => {
    setter(valor)
    setPagina(1)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Pacientes</h1>
        <Button onClick={() => setModalAbierto(true)}>+ Nuevo paciente</Button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          placeholder="Buscar por nombre, teléfono, correo o folio…"
          value={termino}
          onChange={(e) => cambiarFiltro(setTermino)(e.target.value)}
          className="max-w-sm"
        />
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Estado</span>
          <select value={filtroEstado} onChange={(e) => cambiarFiltro(setFiltroEstado)(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            <option value="activos">Activos</option>
            <option value="archivados">Archivados</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Filtro</span>
          <select value={filtroExtra} onChange={(e) => cambiarFiltro(setFiltroExtra)(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">Sin filtro adicional</option>
            <option value="con_saldo">Con saldo pendiente</option>
            <option value="con_cita">Con cita próxima</option>
            <option value="con_tratamiento">Con tratamiento activo</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Ordenar por</span>
          <select value={orden} onChange={(e) => cambiarFiltro(setOrden)(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            <option value="nombre_completo.asc">Nombre (A-Z)</option>
            <option value="nombre_completo.desc">Nombre (Z-A)</option>
            <option value="creado_en.desc">Más recientes primero</option>
            <option value="creado_en.asc">Más antiguos primero</option>
            <option value="fecha_nacimiento.asc">Edad (mayor a menor)</option>
            <option value="fecha_nacimiento.desc">Edad (menor a mayor)</option>
          </select>
        </label>
      </div>

      {error && <p className="mb-3 text-sm text-clinico-rojo">{error}</p>}

      <TablaPacientes pacientes={pacientes} cargando={cargando} navigate={navigate} />

      {total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>{total} paciente{total !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagina === 1}
              className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40"
            >
              ← Anterior
            </button>
            <span>Página {pagina} de {totalPaginas}</span>
            <button
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={pagina >= totalPaginas}
              className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}

      <ModalNuevoPaciente abierto={modalAbierto} onCerrar={() => setModalAbierto(false)} />
    </div>
  )
}

function TablaPacientes({ pacientes, cargando, navigate }) {
  if (cargando) return <SkeletonTabla />
  if (pacientes.length === 0) return <p className="text-slate-400">Sin resultados.</p>

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2">Nombre</th>
            <th className="px-4 py-2">Folio</th>
            <th className="px-4 py-2">Edad</th>
            <th className="px-4 py-2">Teléfono</th>
            <th className="px-4 py-2">Última consulta</th>
            <th className="px-4 py-2">Próxima cita</th>
            <th className="px-4 py-2">Tratamiento</th>
            <th className="px-4 py-2">Saldo</th>
            <th className="px-4 py-2">Estado</th>
          </tr>
        </thead>
        <tbody>
          {pacientes.map((p) => {
            const edad = calcularEdad(p.fecha_nacimiento)
            return (
              <tr
                key={p.id}
                onClick={() => navigate(`/pacientes/${p.id}`)}
                className="cursor-pointer border-t border-slate-100 hover:bg-clinico-azulClaro"
              >
                <td className="px-4 py-2 font-medium text-slate-800">{p.nombre_completo}</td>
                <td className="px-4 py-2 text-slate-500">{p.numero_expediente ?? '—'}</td>
                <td className="px-4 py-2 text-slate-600">{edad !== null ? edad : '—'}</td>
                <td className="px-4 py-2 text-slate-600">{p.telefono}</td>
                <td className="px-4 py-2 text-slate-500">
                  {p.ultima_consulta ? new Date(p.ultima_consulta).toLocaleDateString('es-MX') : '—'}
                </td>
                <td className="px-4 py-2 text-slate-500">
                  {p.proxima_cita ? new Date(p.proxima_cita).toLocaleDateString('es-MX') : '—'}
                </td>
                <td className="px-4 py-2">
                  {p.tratamiento_activo && (
                    <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-800">Activo</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {p.saldo > 0 ? (
                    <span className="font-medium text-clinico-ambar">${p.saldo.toFixed(2)}</span>
                  ) : (
                    <span className="text-slate-400">$0.00</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.archivado_en ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-800'}`}>
                    {p.archivado_en ? 'Archivado' : 'Activo'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ModalNuevoPaciente({ abierto, onCerrar }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    nombre_completo: '', telefono: '', fecha_nacimiento: '', curp: '', sexo: '',
    primer_apellido: '', segundo_apellido: '', entidad_nacimiento: '', sexo_biologico: '',
    genero: '', se_autodenomina_afromexicano: '', se_considera_indigena: '', migrante: '',
    derechohabiencia: []
  })
  const [mostrarDatosSis, setMostrarDatosSis] = useState(false)
  const [duplicados, setDuplicados] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [estadoCurp, setEstadoCurp] = useState(null) // null | 'valida' | 'invalida'
  const [errorCurp, setErrorCurp] = useState('')
  const [entidadDetectada, setEntidadDetectada] = useState(null)
  const [pacienteExistente, setPacienteExistente] = useState(null)
  const [verificandoCurp, setVerificandoCurp] = useState(false)

  const handleChange = (campo) => (e) => setForm({ ...form, [campo]: e.target.value })

  const handleChangeCurp = async (e) => {
    const valor = e.target.value.toUpperCase()
    setForm({ ...form, curp: valor })
    setPacienteExistente(null)

    if (valor.length < 18) {
      setEstadoCurp(null)
      setErrorCurp('')
      setEntidadDetectada(null)
      return
    }

    if (!validarEstructuraCurp(valor)) {
      setEstadoCurp('invalida')
      setErrorCurp('La CURP no tiene una estructura válida.')
      return
    }

    const resultado = parsearCurp(valor)
    if (!resultado.valido) {
      setEstadoCurp('invalida')
      setErrorCurp(resultado.error)
      return
    }

    // Autocompleta sin pisar lo que el usuario ya haya escrito distinto,
    // pero si venían vacíos, se llenan solos.
    setForm((actual) => ({
      ...actual,
      curp: valor,
      fecha_nacimiento: actual.fecha_nacimiento || resultado.fechaNacimiento,
      sexo: actual.sexo || resultado.sexo
    }))
    setEstadoCurp('valida')
    setErrorCurp('')
    setEntidadDetectada(resultado.entidadNombre)

    setVerificandoCurp(true)
    try {
      const existente = await buscarPacientePorCurp(valor)
      setPacienteExistente(existente)
    } finally {
      setVerificandoCurp(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (pacienteExistente) return // no se deja avanzar, hay que usar el botón de "ir al expediente"

    setGuardando(true)
    try {
      const posibles = await buscarPosiblesDuplicados(form)
      if (posibles.length > 0 && duplicados.length === 0) {
        setDuplicados(posibles) // primera vuelta: solo advertir
        setGuardando(false)
        return
      }
      // Los campos SIS opcionales van vacíos ('') cuando no se llenan —
      // se convierten a null para no guardar cadenas vacías.
      const payload = {
        ...form,
        primer_apellido: form.primer_apellido || null,
        segundo_apellido: form.segundo_apellido || null,
        entidad_nacimiento: form.entidad_nacimiento || null,
        sexo_biologico: form.sexo_biologico || null,
        genero: form.genero || null,
        se_autodenomina_afromexicano: form.se_autodenomina_afromexicano || null,
        se_considera_indigena: form.se_considera_indigena || null,
        migrante: form.migrante || null,
        derechohabiencia: form.derechohabiencia.length > 0 ? form.derechohabiencia : null
      }
      const paciente = await crearPaciente(payload)
      toastExito('Paciente creado.')
      onCerrar()
      navigate(`/pacientes/${paciente.id}`)
    } catch (err) {
      toastError('No se pudo crear el paciente: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Nuevo paciente">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Input
            label="CURP (opcional, pero acelera el registro)"
            value={form.curp}
            onChange={handleChangeCurp}
            maxLength={18}
            className="uppercase"
            placeholder="AAAA000000HAAAAA00"
          />
          {estadoCurp === 'invalida' && <p className="mt-1 text-xs text-clinico-rojo">{errorCurp}</p>}
          {estadoCurp === 'valida' && !pacienteExistente && (
            <p className="mt-1 text-xs text-clinico-verde">
              CURP válida{entidadDetectada ? ` — ${entidadDetectada}` : ''}. Fecha de nacimiento y sexo autocompletados.
            </p>
          )}
          {verificandoCurp && <p className="mt-1 text-xs text-slate-400">Verificando si ya existe…</p>}
        </div>

        {pacienteExistente ? (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <p className="mb-2">
              Ya existe un expediente con esta CURP: <strong>{pacienteExistente.nombre_completo}</strong>
              {pacienteExistente.numero_expediente && ` (${pacienteExistente.numero_expediente})`}.
            </p>
            <Button
              type="button"
              variante="secundario"
              onClick={() => { onCerrar(); navigate(`/pacientes/${pacienteExistente.id}`) }}
              className="w-full"
            >
              Ir a su expediente
            </Button>
          </div>
        ) : (
          <>
            <Input label="Nombre completo" required value={form.nombre_completo} onChange={handleChange('nombre_completo')} />
            <Input label="Teléfono" required value={form.telefono} onChange={handleChange('telefono')} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Fecha de nacimiento" type="date" value={form.fecha_nacimiento} onChange={handleChange('fecha_nacimiento')} />
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Sexo</span>
                <select
                  value={form.sexo}
                  onChange={handleChange('sexo')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-clinico-azul focus:outline-none focus:ring-1 focus:ring-clinico-azul"
                >
                  <option value="">Sin especificar</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                  <option value="X">Otro</option>
                </select>
              </label>
            </div>

            {duplicados.length > 0 && (
              <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                Ya existen pacientes parecidos: {duplicados.map((d) => d.nombre_completo).join(', ')}.
                Vuelve a dar clic en "Guardar" si aun así quieres crear uno nuevo.
              </div>
            )}

            <div className="border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setMostrarDatosSis((v) => !v)}
                className="text-xs font-medium text-clinico-azul hover:underline"
              >
                {mostrarDatosSis ? 'Ocultar' : 'Agregar'} datos para reporte oficial SIS (opcional)
              </button>

              {mostrarDatosSis && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Primer apellido" value={form.primer_apellido} onChange={(e) => setForm({ ...form, primer_apellido: e.target.value })} />
                    <Input label="Segundo apellido" value={form.segundo_apellido} onChange={(e) => setForm({ ...form, segundo_apellido: e.target.value })} />
                  </div>

                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Entidad de nacimiento</span>
                    <select
                      value={form.entidad_nacimiento}
                      onChange={(e) => setForm({ ...form, entidad_nacimiento: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">Sin especificar</option>
                      {ENTIDAD_FEDERATIVA.map((ent) => (
                        <option key={ent.clave} value={ent.clave}>{ent.nombre}</option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Sexo biológico</span>
                      <select
                        value={form.sexo_biologico}
                        onChange={(e) => setForm({ ...form, sexo_biologico: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="">Sin especificar</option>
                        <option value="M">Masculino</option>
                        <option value="F">Femenino</option>
                        <option value="X">Intersexual</option>
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Identidad de género</span>
                      <select
                        value={form.genero}
                        onChange={(e) => setForm({ ...form, genero: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="">Sin especificar</option>
                        {GENERO.filter((g) => g.value !== 0).map((g) => (
                          <option key={g.value} value={g.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}>{g.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">¿Se considera indígena?</span>
                      <select
                        value={form.se_considera_indigena}
                        onChange={(e) => setForm({ ...form, se_considera_indigena: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="">Sin especificar</option>
                        <option value="si">Sí</option>
                        <option value="no">No</option>
                        <option value="no_responde">No responde</option>
                        <option value="no_sabe">No sabe</option>
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">¿Se autodenomina afromexicano?</span>
                      <select
                        value={form.se_autodenomina_afromexicano}
                        onChange={(e) => setForm({ ...form, se_autodenomina_afromexicano: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="">Sin especificar</option>
                        <option value="si">Sí</option>
                        <option value="no">No</option>
                        <option value="no_responde">No responde</option>
                        <option value="no_sabe">No sabe</option>
                      </select>
                    </label>
                  </div>

                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">¿Es migrante?</span>
                    <select
                      value={form.migrante}
                      onChange={(e) => setForm({ ...form, migrante: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">Sin especificar</option>
                      <option value="no">No</option>
                      <option value="nacional">Sí, nacional</option>
                      <option value="internacional">Sí, internacional</option>
                      <option value="retornado">Retornado</option>
                    </select>
                  </label>

                  <div>
                    <span className="mb-1 block text-sm font-medium text-slate-700">Derechohabiencia (una o varias)</span>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {AFILIACION.filter((a) => ![0, 1, 99].includes(a.value)).map((a) => {
                        const clave = a.label.toLowerCase().replace(/\s+/g, '_')
                        const marcado = form.derechohabiencia.includes(clave)
                        return (
                          <label key={a.value} className="flex items-center gap-1.5 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={marcado}
                              onChange={() => {
                                setForm((f) => ({
                                  ...f,
                                  derechohabiencia: marcado
                                    ? f.derechohabiencia.filter((d) => d !== clave)
                                    : [...f.derechohabiencia, clave]
                                }))
                              }}
                              className="h-3.5 w-3.5 rounded border-slate-300"
                            />
                            {a.label}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Button type="submit" disabled={guardando || estadoCurp === 'invalida'} className="w-full">
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </>
        )}
      </form>
    </Modal>
  )
}

function SkeletonTabla() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="h-9 border-b border-slate-100 bg-slate-50" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-t border-slate-100 px-4 py-3 first:border-t-0">
          <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-12 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
          <div className="ml-auto h-4 w-16 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  )
}
