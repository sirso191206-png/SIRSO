// Fase 8: límites del formulario de contacto público, alineados con la migración 099.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
vi.mock('../../../lib/supabase', () => ({ supabase: { from: vi.fn(), functions: { invoke: vi.fn() } } }))
import { validarContacto, LIMITES_CONTACTO, enviarMensajeContacto } from '../../../services/contacto.js'
import { supabase } from '../../../lib/supabase'

const ok = { nombre: 'Ana', correo: 'ana@x.mx', mensaje: 'Hola' }
describe('validarContacto', () => {
  it('una entrada normal y los máximos exactos son válidos', () => {
    expect(validarContacto(ok)).toEqual({})
    expect(validarContacto({ nombre: 'n'.repeat(120), correo: `${'c'.repeat(240)}@x.mx`.slice(0, 254), mensaje: 'm'.repeat(5000) })).toEqual({})
  })
  it('un campo de más del máximo, vacío o solo espacios se rechaza con un texto claro (no un error de la base)', () => {
    expect(validarContacto({ ...ok, mensaje: 'm'.repeat(5001) }).mensaje).toMatch(/más de 5000/); expect(validarContacto({ ...ok, nombre: 'n'.repeat(121) }).nombre).toMatch(/más de 120/)
    expect(validarContacto({ ...ok, correo: `${'c'.repeat(250)}@x.mx` }).correo).toMatch(/más de 254/)
    expect(validarContacto({ nombre: '  ', correo: '', mensaje: '   ' })).toEqual({ nombre: 'El nombre es obligatorio.', correo: 'Ingresa un correo válido.', mensaje: 'Escribe tu mensaje.' })
    expect(validarContacto({ ...ok, correo: 'sin-arroba' }).correo).toMatch(/válido/)
  })
  it('cuenta lo que se ENVÍA (sin los espacios de los extremos): 5000 letras con espacios alrededor son válidas', () => { expect(validarContacto({ ...ok, mensaje: `  ${'m'.repeat(5000)}  ` })).toEqual({}) })
})
describe('errores del servidor al guardar el mensaje', () => {
  const falla = (error) => { supabase.from.mockReturnValue({ insert: async () => ({ error }) }); supabase.functions.invoke.mockReset() }
  it('el límite de frecuencia (migración 102) se explica con claridad y no se intenta enviar el correo', async () => {
    falla({ code: 'P0001', hint: 'CONTACTO_DEMASIADOS_MENSAJES', message: 'texto del servidor' })
    await expect(enviarMensajeContacto(ok)).rejects.toThrow('Se han recibido demasiados mensajes. Inténtalo de nuevo más tarde.'); expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })
  it('un campo fuera del límite de tamaño (23514, migración 099) se explica con claridad', async () => {
    falla({ code: '23514', message: 'new row violates check constraint "mensajes_contacto_mensaje_longitud"' })
    await expect(enviarMensajeContacto(ok)).rejects.toThrow(/demasiado largo/)
  })
  it('cualquier otro error se propaga tal cual (no se oculta un fallo real)', async () => { const e = { code: '42501', message: 'x' }; falla(e); await expect(enviarMensajeContacto(ok)).rejects.toBe(e) })
})

describe('coherencia con la base de datos y con la pantalla', () => {
  it('los límites del frontend son EXACTAMENTE los de las restricciones CHECK de la migración 099', () => {
    const sql = readFileSync(new URL('../../../../../supabase/migrations/099_sirso_contacto_limites_de_tamano.sql', import.meta.url), 'utf8')
    const lim = (campo) => Number(sql.match(new RegExp(`char_length\\(${campo}\\) between 1 and (\\d+)`))[1])
    expect(LIMITES_CONTACTO).toEqual({ nombre: lim('nombre'), correo: lim('correo'), mensaje: lim('mensaje') })
  })
  it('la pantalla aplica maxLength a los tres campos (la persona no puede escribir de más)', () => {
    const jsx = readFileSync(new URL('../../../pages/Contacto.jsx', import.meta.url), 'utf8')
    for (const c of ['nombre', 'correo', 'mensaje']) expect(jsx).toContain(`maxLength={LIMITES_CONTACTO.${c}}`)
  })
})
