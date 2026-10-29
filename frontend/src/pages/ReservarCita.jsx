import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { HeaderPublico } from '../components/layout/HeaderPublico'
import { BarraRegresoPublica } from '../components/layout/BarraRegreso'
import { obtenerReservaPublica, obtenerHorariosLibres, solicitarCitaEnLinea } from '../services/reservaEnLinea'
import { validarSolicitudReserva, LIMITES_RESERVA, DIAS_SEMANA, fechaLegible, esDiaDeAtencion } from '../lib/reservaEnLinea'

const CAMPO = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-sm transition-all placeholder:text-slate-400 focus:border-clinico-azul focus:bg-white focus:outline-none focus:ring-4 focus:ring-clinico-azul/10'

// Enlace público de una clínica (/reservar/:slug): el paciente elige servicio, día y hora libre, y deja sus datos. Lo que
// envía es una SOLICITUD: la clínica la confirma desde su Agenda. Solo se muestran horas libres, nunca datos de nadie.
export function ReservarCita() {
  const { slug } = useParams()
  const [info, setInfo] = useState(null)
  const [errorCarga, setErrorCarga] = useState('')
  const [servicioId, setServicioId] = useState('')
  const [sucursalId, setSucursalId] = useState('')
  const [fecha, setFecha] = useState('')
  const [horarios, setHorarios] = useState(null)
  const [cargandoHorarios, setCargandoHorarios] = useState(false)
  const [errorHorarios, setErrorHorarios] = useState('')
  const [inicio, setInicio] = useState('')
  const [datos, setDatos] = useState({ nombre: '', correo: '', telefono: '', motivo: '' })
  const [sitioWeb, setSitioWeb] = useState('') // campo trampa: invisible para las personas
  const [errores, setErrores] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState('')
  const [enviada, setEnviada] = useState(null)

  useEffect(() => {
    let activo = true
    obtenerReservaPublica(slug)
      .then((d) => {
        if (!activo) return
        setInfo(d)
        if (d.servicios.length === 1) setServicioId(d.servicios[0].id)
        if (d.sucursales.length === 1) setSucursalId(d.sucursales[0].id)
      })
      .catch((err) => activo && setErrorCarga(err.message))
    return () => { activo = false }
  }, [slug])

  const requiereSucursal = (info?.sucursales.length ?? 0) > 1
  useEffect(() => {
    setInicio('')
    setHorarios(null)
    setErrorHorarios('')
    if (!info || !servicioId || !fecha || (requiereSucursal && !sucursalId)) return
    if (!esDiaDeAtencion(fecha, info.dias_semana)) { setHorarios([]); return }
    let activo = true
    setCargandoHorarios(true)
    obtenerHorariosLibres({ slug, servicioId, fecha, sucursalId })
      .then((h) => activo && setHorarios(h))
      .catch((err) => activo && setErrorHorarios(err.message))
      .finally(() => activo && setCargandoHorarios(false))
    return () => { activo = false }
  }, [info, slug, servicioId, fecha, sucursalId, requiereSucursal])

  // Al corregir un campo su error rojo desaparece en el momento (antes seguía ahí hasta volver a enviar).
  const cambiar = (campo) => (e) => {
    setDatos((d) => ({ ...d, [campo]: e.target.value }))
    setErrores((er) => (er[campo] ? { ...er, [campo]: undefined } : er))
  }
  const hoy = new Date().toISOString().slice(0, 10)
  const fechaPasada = Boolean(fecha) && fecha < (info?.fecha_minima ?? hoy)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorEnvio('')
    const nuevos = validarSolicitudReserva(datos)
    if (!servicioId) nuevos.servicio = 'Elige un servicio.'
    if (requiereSucursal && !sucursalId) nuevos.sucursal = 'Elige una sucursal.'
    if (!inicio) nuevos.inicio = fecha ? 'Elige un horario.' : 'Elige el día y luego un horario.'
    setErrores(nuevos)
    if (Object.keys(nuevos).length > 0) return
    setEnviando(true)
    try {
      const r = await solicitarCitaEnLinea({ slug, servicioId, inicio, sucursalId, sitioWeb, ...datos })
      setEnviada({ ...r, hora: horarios?.find((h) => h.inicio === inicio)?.hora, fecha })
    } catch (err) {
      setErrorEnvio(err.message)
      if (err.hint === 'RESERVA_HORARIO_OCUPADO') {
        setInicio('')
        obtenerHorariosLibres({ slug, servicioId, fecha, sucursalId }).then(setHorarios).catch(() => {})
      }
    } finally {
      setEnviando(false)
    }
  }

  const servicio = info?.servicios.find((s) => s.id === servicioId)
  const diasAtencion = info ? DIAS_SEMANA.filter((d) => info.dias_semana.includes(d.valor)).map((d) => d.corto).join(', ') : ''

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <HeaderPublico enlace="/contacto" textoEnlace="¿Eres una clínica?" />

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12 animate-fade-in sm:px-10">
        <BarraRegresoPublica />

        {errorCarga && (
          <div role="alert" className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            <h1 className="mb-2 text-xl font-semibold text-slate-800">Reserva en línea no disponible</h1>
            <p>{errorCarga}</p>
          </div>
        )}

        {!info && !errorCarga && <p className="text-slate-400">Cargando…</p>}

        {info && enviada && (
          <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-6">
            <h1 className="mb-2 text-xl font-semibold text-slate-800">¡Recibimos tu solicitud!</h1>
            <p className="text-sm text-slate-700">
              Pediste <strong>{enviada.servicio ?? servicio?.nombre}</strong> el <strong>{fechaLegible(enviada.fecha)}</strong>
              {enviada.hora && <> a las <strong>{enviada.hora}</strong></>} en {info.clinica.nombre}.
            </p>
            <p className="mt-2 text-sm text-slate-700">
              Tu cita queda <strong>pendiente de confirmar</strong>: la clínica se comunicará contigo para confirmarla.
              {info.clinica.telefono && <> Si necesitas cambiarla, llama al {info.clinica.telefono}.</>}
            </p>
          </div>
        )}

        {info && !enviada && (
          <>
            <div className="mb-8 flex items-center gap-4">
              {info.clinica.logo_url && (
                <img src={info.clinica.logo_url} alt="" className="h-14 w-14 rounded-lg border border-slate-200 object-contain" />
              )}
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Agenda tu cita en {info.clinica.nombre}</h1>
                <p className="text-sm text-slate-500">
                  Atención: {diasAtencion}, de {info.hora_apertura} a {info.hora_cierre}.
                  {info.clinica.direccion && <> {info.clinica.direccion}.</>}
                </p>
              </div>
            </div>
            {info.mensaje && <p className="mb-6 rounded-lg bg-blue-50 px-4 py-3 text-sm text-slate-700">{info.mensaje}</p>}

            {info.servicios.length === 0 ? (
              <p className="text-sm text-slate-500">Por ahora no hay servicios para reservar en línea. Comunícate con la clínica.</p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <fieldset className="space-y-3">
                  <legend className="mb-2 text-sm font-semibold text-slate-700">1. ¿Qué necesitas?</legend>
                  <select value={servicioId} onChange={(e) => { setServicioId(e.target.value); setErrores((er) => ({ ...er, servicio: undefined })) }} className={CAMPO} aria-label="Servicio" required>
                    <option value="">Elige un servicio</option>
                    {info.servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre} ({s.duracion_min} min)</option>)}
                  </select>
                  {errores.servicio && <p className="text-xs text-clinico-rojo">{errores.servicio}</p>}
                  {requiereSucursal && (
                    <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} className={CAMPO} aria-label="Sucursal" required>
                      <option value="">Elige una sucursal</option>
                      {info.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.direccion ? ` — ${s.direccion}` : ''}</option>)}
                    </select>
                  )}
                  {errores.sucursal && <p className="text-xs text-clinico-rojo">{errores.sucursal}</p>}
                </fieldset>

                <fieldset className="space-y-3">
                  <legend className="mb-2 text-sm font-semibold text-slate-700">2. ¿Qué día y a qué hora?</legend>
                  <input type="date" value={fecha} min={info.fecha_minima} max={info.fecha_maxima} onChange={(e) => setFecha(e.target.value)}
                    className={CAMPO} aria-label="Fecha" required />
                  {fechaPasada && <p className="text-sm text-slate-500">Esa fecha ya pasó. Elige un día a partir de hoy.</p>}
                  {fecha && !fechaPasada && !esDiaDeAtencion(fecha, info.dias_semana) && <p className="text-sm text-slate-500">Ese día no hay atención. Elige otro.</p>}
                  {cargandoHorarios && <p className="text-sm text-slate-400">Buscando horarios libres…</p>}
                  {errorHorarios && <p className="text-sm text-clinico-rojo">{errorHorarios}</p>}
                  {horarios && horarios.length === 0 && !fechaPasada && esDiaDeAtencion(fecha, info.dias_semana) && !cargandoHorarios && (
                    <p className="text-sm text-slate-500">No quedan horarios libres ese día. Prueba con otro.</p>
                  )}
                  {horarios && horarios.length > 0 && (
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Horarios libres">
                      {horarios.map((h) => (
                        <button key={h.inicio} type="button" role="radio" aria-checked={inicio === h.inicio} onClick={() => { setInicio(h.inicio); setErrores((er) => ({ ...er, inicio: undefined })) }}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium ${inicio === h.inicio ? 'border-clinico-azul bg-clinico-azul text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-clinico-azul'}`}>
                          {h.hora}
                        </button>
                      ))}
                    </div>
                  )}
                  {errores.inicio && <p className="text-xs text-clinico-rojo">{errores.inicio}</p>}
                </fieldset>

                <fieldset className="space-y-3">
                  <legend className="mb-2 text-sm font-semibold text-slate-700">3. Tus datos</legend>
                  <div>
                    <input type="text" value={datos.nombre} onChange={cambiar('nombre')} maxLength={LIMITES_RESERVA.nombre} placeholder="Nombre completo" autoComplete="name" className={CAMPO} aria-label="Nombre completo" />
                    {errores.nombre && <p className="mt-1 text-xs text-clinico-rojo">{errores.nombre}</p>}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <input type="email" value={datos.correo} onChange={cambiar('correo')} maxLength={LIMITES_RESERVA.correo} placeholder="Correo" autoComplete="email" className={CAMPO} aria-label="Correo" />
                      {errores.correo && <p className="mt-1 text-xs text-clinico-rojo">{errores.correo}</p>}
                    </div>
                    <div>
                      <input type="tel" value={datos.telefono} onChange={cambiar('telefono')} maxLength={LIMITES_RESERVA.telefono} placeholder="Teléfono" autoComplete="tel" className={CAMPO} aria-label="Teléfono" />
                      {errores.telefono && <p className="mt-1 text-xs text-clinico-rojo">{errores.telefono}</p>}
                    </div>
                  </div>
                  <div>
                    <textarea value={datos.motivo} onChange={cambiar('motivo')} maxLength={LIMITES_RESERVA.motivo} rows={3} placeholder="Motivo o comentarios (opcional)" className={CAMPO} aria-label="Motivo" />
                    {errores.motivo && <p className="mt-1 text-xs text-clinico-rojo">{errores.motivo}</p>}
                  </div>
                  {/* Campo trampa contra robots: fuera de la vista y del teclado. Una persona nunca lo llena. */}
                  <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
                    <label>Sitio web<input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" value={sitioWeb} onChange={(e) => setSitioWeb(e.target.value)} /></label>
                  </div>
                </fieldset>

                <p className="text-xs text-slate-500">
                  {info.clinica.nombre} recibe tus datos únicamente para confirmar y dar seguimiento a tu cita. Consulta el <a href="/legal/privacidad" className="text-clinico-azul hover:underline">Aviso de Privacidad</a>.
                </p>

                {errorEnvio && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-clinico-rojo">{errorEnvio}</p>}

                <button type="submit" disabled={enviando}
                  className="w-full rounded-xl bg-clinico-azul px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-60">
                  {enviando ? 'Enviando…' : 'Solicitar cita'}
                </button>
              </form>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-slate-100 py-5 text-center text-xs text-slate-400">© 2026 SIRO</footer>
    </div>
  )
}
