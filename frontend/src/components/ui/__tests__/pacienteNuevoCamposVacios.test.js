// H25 — alta de paciente con campos opcionales vacíos. Antes: el formulario «Nuevo paciente» enviaba '' en fecha_nacimiento, sexo y curp.
// Reproducido en el navegador real contra el stack local (v10): sin fecha de nacimiento el alta fallaba (22007, «invalid input syntax for type
// date»); sin sexo, pacientes_sexo_check (23514); y una CURP '' se guardaba como texto vacío, así que el SIGUIENTE paciente sin CURP chocaba
// con idx_pacientes_curp_por_clinica (que solo excluye NULL) y se presentaba como «CURP duplicada».
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { prepararPacienteNuevo } from '../../../lib/pacienteNuevo'

const fuente = (ruta) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8')
const vacio = { nombre_completo: 'Paciente Sintético', telefono: '5500000000', fecha_nacimiento: '', curp: '', sexo: '', primer_apellido: '', segundo_apellido: '' }

describe('H25 — alta de paciente: los opcionales vacíos se envían como NULL', () => {
  it('fecha_nacimiento, sexo, curp y apellidos vacíos → null (la base acepta NULL, no "")', () => {
    expect(prepararPacienteNuevo(vacio)).toEqual({ nombre_completo: 'Paciente Sintético', telefono: '5500000000', fecha_nacimiento: null, curp: null, sexo: null, primer_apellido: null, segundo_apellido: null })
  })
  it('los valores escritos se conservan tal cual', () => {
    const lleno = { ...vacio, fecha_nacimiento: '1990-05-01', curp: 'XEXX010101HNEXXXA4', sexo: 'F', primer_apellido: 'Uno', segundo_apellido: 'Dos' }
    // Los apellidos capturados aparte se agregan al nombre visible (sin duplicarlos si ya estaban).
    expect(prepararPacienteNuevo(lleno)).toEqual({ ...lleno, nombre_completo: `${vacio.nombre_completo} Uno Dos` })
    expect(prepararPacienteNuevo({ ...lleno, nombre_completo: 'Ana Uno Dos' }).nombre_completo).toBe('Ana Uno Dos')
  })
  it('una CURP de solo espacios tampoco se guarda como texto vacío', () => {
    expect(prepararPacienteNuevo({ ...vacio, curp: '   ' }).curp).toBeNull()
  })
  it('no modifica el objeto del formulario', () => {
    const copia = { ...vacio }
    prepararPacienteNuevo(copia)
    expect(copia).toEqual(vacio)
  })
  it('el formulario «Nuevo paciente» construye el envío con prepararPacienteNuevo', () => {
    const pagina = fuente('../../../pages/Pacientes.jsx')
    expect(pagina).toMatch(/import \{ prepararPacienteNuevo \} from '\.\.\/lib\/pacienteNuevo'/)
    expect(pagina).toMatch(/crearPaciente\(prepararPacienteNuevo\(form\)/)
  })
})
