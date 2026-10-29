// Reserva en línea (migración 117): validación del formulario público, coherencia con la base de datos, servicio,
// página pública (campo trampa) y su lugar en la Agenda.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
vi.mock('../../../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }))
import { supabase } from '../../../lib/supabase'
import {
  validarSolicitudReserva, validarConfigReserva, validarServicioReserva, sugerirSlug, mensajeErrorReserva,
  LIMITES_RESERVA, REGEX_SLUG, CONFIG_RESERVA_INICIAL, INTERVALOS_RESERVA, esDiaDeAtencion, solicitudComoCita,
  solicitudesVisiblesEnAgenda, enlacePublicoReserva
} from '../../../lib/reservaEnLinea.js'
import { solicitarCitaEnLinea, obtenerHorariosLibres, confirmarSolicitudCita, rechazarSolicitudCita } from '../../../services/reservaEnLinea.js'

const leer = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const SQL = leer('../../../../../supabase/migrations/117_sirso_reserva_en_linea.sql')
const ok = { nombre: 'Laura Gómez', correo: 'laura@correo.mx', telefono: '55 1234 5678', motivo: '' }

describe('validarSolicitudReserva (formulario público)', () => {
  it('datos normales son válidos (con acentos, ñ, lada y espacios)', () => {
    expect(validarSolicitudReserva(ok)).toEqual({})
    expect(validarSolicitudReserva({ ...ok, nombre: 'José Ñúñez', telefono: '+52 (55) 1234-5678', correo: 'Jose.Nunez@Correo.com.mx' })).toEqual({})
  })
  it('rechaza nombre corto, sin letras o con < >; correo y teléfono inválidos; motivo largo o con < >', () => {
    expect(validarSolicitudReserva({ ...ok, nombre: 'X' }).nombre).toBeTruthy()
    expect(validarSolicitudReserva({ ...ok, nombre: '12345' }).nombre).toBeTruthy()
    expect(validarSolicitudReserva({ ...ok, nombre: '<b>Ana</b>' }).nombre).toMatch(/< >/)
    expect(validarSolicitudReserva({ ...ok, correo: 'sin-arroba' }).correo).toBeTruthy()
    expect(validarSolicitudReserva({ ...ok, telefono: '123' }).telefono).toBeTruthy()
    expect(validarSolicitudReserva({ ...ok, telefono: '55-1234-ABCD' }).telefono).toBeTruthy()
    expect(validarSolicitudReserva({ ...ok, motivo: 'm'.repeat(501) }).motivo).toMatch(/500/)
    expect(validarSolicitudReserva({ ...ok, motivo: '<script>' }).motivo).toMatch(/< >/)
  })
})

describe('coherencia con la migración 117', () => {
  it('los límites del frontend son los de las restricciones de la base', () => {
    expect(SQL).toMatch(new RegExp(`char_length\\(nombre\\) between 2 and ${LIMITES_RESERVA.nombre}`))
    expect(SQL).toMatch(new RegExp(`char_length\\(correo\\) <= ${LIMITES_RESERVA.correo}`))
    expect(SQL).toMatch(new RegExp(`char_length\\(telefono\\) <= ${LIMITES_RESERVA.telefono}`))
    expect(SQL).toMatch(new RegExp(`char_length\\(motivo\\) <= ${LIMITES_RESERVA.motivo}`))
    expect(SQL).toMatch(new RegExp(`char_length\\(mensaje\\) <= ${LIMITES_RESERVA.mensaje}`))
    expect(SQL).toMatch(new RegExp(`between 2 and ${LIMITES_RESERVA.servicio}\\)`))
    expect(SQL).toContain(`slug ~ '${REGEX_SLUG.source}'`)
    expect(SQL).toContain(`intervalo_min in (${INTERVALOS_RESERVA.join(', ')})`)
  })
  it('anon solo puede ejecutar las tres funciones públicas; confirmar y rechazar son solo del personal', () => {
    const aAnon = [...SQL.matchAll(/grant execute on function (\w+)\([^)]*\) to ([\w, ]+);/g)].filter((m) => /anon/.test(m[2])).map((m) => m[1])
    expect(aAnon.sort()).toEqual(['reserva_horarios_libres', 'reserva_publica_info', 'reserva_solicitar_cita'])
    expect(SQL).toMatch(/revoke all on function reserva_confirmar_solicitud\(uuid, uuid\) from public, anon;/)
    expect(SQL).toMatch(/revoke all on reserva_config, reserva_servicios, solicitudes_cita from anon, authenticated;/)
  })
  it('toda función SECURITY DEFINER fija su search_path; las internas fn_reserva_* se revocan de la API', () => {
    for (const m of SQL.matchAll(/create or replace function\s+(\w+)\(([\s\S]*?)\$\$/gi)) {
      if (/security definer/i.test(m[0])) expect(m[0], m[1]).toMatch(/set search_path = public/)
    }
    for (const f of new Set([...SQL.matchAll(/create or replace function (fn_reserva_\w+)\(/g)].map((m) => m[1]))) {
      expect(SQL, f).toMatch(new RegExp(`revoke all on function ${f}\\([^)]*\\) from public, anon, authenticated;`))
    }
  })
  it('es transaccional, tiene rollback y declara la política restrictiva de sesión y la de plan', () => {
    expect(SQL).toMatch(/^begin;$/m); expect(SQL).toMatch(/^commit;$/m)
    expect(SQL).toContain("'sesion_activa_' || t"); expect(SQL).toContain("'plan_func_' || t")
    expect(leer('../../../../../supabase/rollback/siro_v3/rollback_117.sql')).toMatch(/drop table if exists solicitudes_cita;/)
  })
})

describe('configuración del owner', () => {
  it('sugerirSlug quita acentos y símbolos', () => {
    expect(sugerirSlug('Clínica Dental Sonrisa & Más')).toBe('clinica-dental-sonrisa-mas')
    expect(sugerirSlug('  Ñandú  ')).toBe('nandu')
    expect(sugerirSlug('A')).toBe('')
    expect(REGEX_SLUG.test(sugerirSlug('x'.repeat(100)))).toBe(true)
  })
  it('validarConfigReserva: la configuración inicial con slug es válida; detecta los errores', () => {
    expect(validarConfigReserva({ ...CONFIG_RESERVA_INICIAL, slug: 'mi-clinica' })).toEqual({})
    const e = validarConfigReserva({ ...CONFIG_RESERVA_INICIAL, slug: '-Mal-', dias_semana: [], hora_apertura: '18:00', hora_cierre: '09:00', anticipacion_max_dias: 0 })
    expect(Object.keys(e).sort()).toEqual(['anticipacion_max_dias', 'dias_semana', 'horario', 'slug'])
    expect(validarConfigReserva({ ...CONFIG_RESERVA_INICIAL, slug: 'doble--guion' }).slug).toBeTruthy()
  })
  it('validarServicioReserva', () => {
    expect(validarServicioReserva({ nombre: 'Limpieza', duracion_min: '60' })).toEqual({})
    expect(Object.keys(validarServicioReserva({ nombre: 'L', duracion_min: 5 })).sort()).toEqual(['duracion_min', 'nombre'])
  })
  it('enlace público', () => { expect(enlacePublicoReserva('mi-clinica', 'https://siro.mx')).toBe('https://siro.mx/reservar/mi-clinica') })
})

describe('mensajes de error', () => {
  it('cada pista del servidor tiene un texto claro; los de validación usan el del servidor', () => {
    expect(mensajeErrorReserva({ hint: 'RESERVA_DEMASIADAS' })).toMatch(/demasiadas/)
    expect(mensajeErrorReserva({ hint: 'RESERVA_NO_DISPONIBLE' })).toMatch(/no existe o la clínica lo desactivó/)
    expect(mensajeErrorReserva({ hint: 'RESERVA_DATOS_INVALIDOS', message: 'Escribe un correo electrónico válido.' })).toBe('Escribe un correo electrónico válido.')
    expect(mensajeErrorReserva({ code: '23505' })).toMatch(/enlace ya lo usa/)
    expect(mensajeErrorReserva({ code: 'XX000', message: 'detalle técnico' })).not.toContain('detalle técnico')
  })
  it('todas las pistas que lanza la migración tienen mensaje en el frontend', () => {
    const pistas = new Set([...SQL.matchAll(/hint = '(RESERVA_\w+)'/g)].map((m) => m[1]))
    expect(pistas.size).toBeGreaterThanOrEqual(8)
    for (const p of pistas) expect(mensajeErrorReserva({ hint: p, message: 'x' }), p).not.toMatch(/No se pudo completar/)
  })
})

describe('servicio', () => {
  beforeEach(() => supabase.rpc.mockReset())
  it('solicitar: normaliza correo, manda el campo trampa y explica el error con la pista', async () => {
    supabase.rpc.mockResolvedValue({ data: { ok: true }, error: null })
    await solicitarCitaEnLinea({ slug: 's', servicioId: 'v', inicio: '2026-11-03T15:00:00Z', nombre: ' Ana ', correo: ' ANA@X.MX ', telefono: '5512345678', motivo: '', sitioWeb: 'spam' })
    expect(supabase.rpc).toHaveBeenCalledWith('reserva_solicitar_cita', expect.objectContaining({ p_nombre: 'Ana', p_correo: 'ana@x.mx', p_motivo: null, p_sitio_web: 'spam', p_sucursal: null }))
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', hint: 'RESERVA_HORARIO_OCUPADO', message: 'Ese horario se acaba de ocupar. Elige otro.' } })
    await expect(solicitarCitaEnLinea({ slug: 's', servicioId: 'v', inicio: 'x', nombre: 'Ana', correo: 'a@x.mx', telefono: '5512345678' }))
      .rejects.toMatchObject({ message: 'Ese horario se acaba de ocupar. Elige otro.', hint: 'RESERVA_HORARIO_OCUPADO' })
  })
  it('horarios, confirmar y rechazar llaman a sus funciones con los parámetros de la migración', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    await obtenerHorariosLibres({ slug: 's', servicioId: 'v', fecha: '2026-11-03' })
    expect(supabase.rpc).toHaveBeenCalledWith('reserva_horarios_libres', { p_slug: 's', p_servicio: 'v', p_fecha: '2026-11-03', p_sucursal: null })
    await confirmarSolicitudCita('id1')
    expect(supabase.rpc).toHaveBeenCalledWith('reserva_confirmar_solicitud', { p_solicitud: 'id1', p_paciente: null })
    await rechazarSolicitudCita('id1', '  ')
    expect(supabase.rpc).toHaveBeenCalledWith('reserva_rechazar_solicitud', { p_solicitud: 'id1', p_motivo: null })
    for (const f of ['reserva_horarios_libres', 'reserva_confirmar_solicitud', 'reserva_rechazar_solicitud', 'reserva_solicitar_cita', 'reserva_publica_info']) expect(SQL).toContain(`function ${f}(`)
  })
})

describe('Agenda', () => {
  const s = { id: 'a1', inicio: '2026-11-03T15:00:00Z', fin: '2026-11-03T16:00:00Z', nombre: 'Laura', servicio_nombre: 'Limpieza', dentista_id: 'd1', sucursal_id: null }
  it('una solicitud se dibuja como cita «pendiente de confirmar» y respeta los filtros de la Agenda', () => {
    const c = solicitudComoCita(s)
    expect(c).toMatchObject({ id: 'solicitud-a1', esSolicitud: true, estado: 'pendiente_confirmar', paciente: { nombre_completo: 'Laura' } })
    const rango = { desde: '2026-11-03T00:00:00Z', hasta: '2026-11-04T00:00:00Z' }
    expect(solicitudesVisiblesEnAgenda([s], rango)).toHaveLength(1)
    expect(solicitudesVisiblesEnAgenda([s], { ...rango, dentistaId: 'otro' })).toHaveLength(0)
    expect(solicitudesVisiblesEnAgenda([s], { ...rango, estado: 'confirmada' })).toHaveLength(0)
    expect(solicitudesVisiblesEnAgenda([s], { ...rango, estado: 'pendiente_confirmar' })).toHaveLength(1)
    expect(solicitudesVisiblesEnAgenda([s], { desde: '2026-11-04T00:00:00Z', hasta: '2026-11-05T00:00:00Z' })).toHaveLength(0)
  })
  it('las solicitudes no se arrastran y se abren en su propio panel', () => {
    expect(leer('../../agenda/CuadriculaCalendario.jsx')).toContain('draggable={!finalizada && !cita.esSolicitud}')
    const agenda = leer('../../../pages/Agenda.jsx')
    expect(agenda).toContain("c.esSolicitud ? setSolicitudAbierta(c.solicitud) : setCitaSeleccionada(c)")
    expect(agenda).toContain("disponible('reserva_en_linea')")
  })
  it('esDiaDeAtencion usa lunes = 1 … domingo = 7', () => {
    expect(esDiaDeAtencion('2026-11-02', [1])).toBe(true)   // lunes
    expect(esDiaDeAtencion('2026-11-08', [1, 2, 3, 4, 5])).toBe(false) // domingo
    expect(esDiaDeAtencion('2026-11-08', [7])).toBe(true)
  })
})

describe('página pública y configuración', () => {
  const pagina = leer('../../../pages/ReservarCita.jsx')
  it('es pública, perezosa y con «Volver a SIRO» para quien tiene sesión', () => {
    const app = leer('../../../App.jsx')
    expect(app).toContain("const ReservarCita = pagina(() => import('./pages/ReservarCita'), 'ReservarCita')")
    expect(app).toContain('<Route path="/reservar/:slug" element={<ReservarCita />} />')
    expect(pagina).toContain('<BarraRegresoPublica />')
  })
  it('tiene campo trampa invisible y fuera del teclado, y limita lo que se puede escribir', () => {
    expect(pagina).toMatch(/aria-hidden="true"[^>]*left: '-10000px'/)
    expect(pagina).toContain('name="sitio_web" tabIndex={-1} autoComplete="off"')
    for (const c of ['nombre', 'correo', 'telefono', 'motivo']) expect(pagina).toContain(`maxLength={LIMITES_RESERVA.${c}}`)
  })
  it('no lee tablas: solo las funciones públicas del servicio', () => {
    expect(pagina).not.toMatch(/supabase/)
    expect(pagina).toContain("from '../services/reservaEnLinea'")
  })
  it('la configuración va en ConfiguracionClinica como sección desplegable y depende del plan', () => {
    expect(leer('../../../pages/ConfiguracionClinica.jsx')).toContain('<SeccionReservaEnLinea clinicaId={perfil.clinica_id} nombreClinica={form.nombre} />')
    const seccion = leer('../../reserva/SeccionReservaEnLinea.jsx')
    expect(seccion).toContain('<SeccionDesplegable id="reserva-en-linea"')
    expect(seccion).toContain("useFuncionalidad('reserva_en_linea')")
  })
})
