import { describe, it, expect } from 'vitest'
import { datosProfesionalParaImprimir, bloqueSignosVitales, renderEncabezadoMedico } from '../imprimirReceta'

describe('datosProfesionalParaImprimir — snapshot histórico con respaldo a datos en vivo', () => {
  it('usa el snapshot cuando existe (receta ya emitida con los datos correctos)', () => {
    const receta = {
      nombre_medico_snapshot: 'Dra. Ana Gómez',
      rfc_snapshot: 'GOAA800101ABC',
      cedula_profesional_snapshot: '87654321',
      escuela_snapshot: 'UNAM',
      dentista: { nombre: 'Dra. Ana Gómez (nombre actualizado después)', cedula_profesional: '99999999' },
    }
    const resultado = datosProfesionalParaImprimir(receta)
    expect(resultado).toEqual({
      nombre: 'Dra. Ana Gómez',
      rfc: 'GOAA800101ABC',
      cedula: '87654321',
      escuela: 'UNAM',
    })
  })

  it('si el perfil del odontólogo cambia DESPUÉS de emitir la receta, el snapshot NO se ve afectado', () => {
    // Simula: la receta se emitió con la cédula "11111111", luego el
    // odontólogo la corrigió a "22222222" en su perfil (reflejado en
    // receta.dentista, la relación EN VIVO) — la receta ya impresa debe
    // seguir mostrando "11111111".
    const receta = {
      nombre_medico_snapshot: 'Dr. Juan Pérez',
      cedula_profesional_snapshot: '11111111',
      dentista: { nombre: 'Dr. Juan Pérez', cedula_profesional: '22222222' },
    }
    const resultado = datosProfesionalParaImprimir(receta)
    expect(resultado.cedula).toBe('11111111')
    expect(resultado.cedula).not.toBe('22222222')
  })

  it('lo mismo aplica a RFC y escuela — si tienen snapshot, el dato en vivo se ignora aunque exista', () => {
    const receta = {
      rfc_snapshot: 'VIEJO800101AAA',
      escuela_snapshot: 'Universidad Vieja',
      dentista: { rfc: 'NUEVO900101BBB', escuela_procedencia: 'Universidad Nueva' },
    }
    const resultado = datosProfesionalParaImprimir(receta)
    expect(resultado.rfc).toBe('VIEJO800101AAA')
    expect(resultado.escuela).toBe('Universidad Vieja')
  })

  it('receta VIEJA sin snapshot (creada antes de esta funcionalidad): cae al dato en vivo, no queda vacía', () => {
    const receta = {
      nombre_medico_snapshot: null,
      rfc_snapshot: null,
      cedula_profesional_snapshot: null,
      escuela_snapshot: null,
      dentista: { nombre: 'Dr. Histórico', cedula_profesional: '55555555', rfc: 'HIST800101ABC', escuela_procedencia: 'UAEM' },
    }
    const resultado = datosProfesionalParaImprimir(receta)
    expect(resultado.nombre).toBe('Dr. Histórico')
    expect(resultado.cedula).toBe('55555555')
    expect(resultado.rfc).toBe('HIST800101ABC')
    expect(resultado.escuela).toBe('UAEM')
  })

  it('sin snapshot Y sin relación dentista: no truena, devuelve nombre vacío y el resto null', () => {
    const resultado = datosProfesionalParaImprimir({})
    expect(resultado.nombre).toBe('')
    expect(resultado.rfc).toBeNull()
    expect(resultado.cedula).toBeNull()
    expect(resultado.escuela).toBeNull()
  })
})

describe('bloqueSignosVitales — se recuperan solos, sección opcional', () => {
  it('sin registro (paciente sin signos vitales capturados): no genera ninguna sección', () => {
    expect(bloqueSignosVitales(null)).toBe('')
  })

  it('con registro pero sin ningún valor útil: tampoco genera sección vacía', () => {
    expect(bloqueSignosVitales({ paciente_id: 'x', creado_en: '2026-01-01' })).toBe('')
  })

  it('muestra solo los campos que SÍ existen, en el formato pedido', () => {
    const html = bloqueSignosVitales({
      presion_sistolica: 120,
      presion_diastolica: 80,
      frecuencia_cardiaca: 72,
      temperatura: 36.5,
      // sin saturación, sin peso, sin talla — no deben aparecer
    })
    expect(html).toContain('Presión arterial: 120/80 mmHg')
    expect(html).toContain('Frecuencia cardiaca: 72 lpm')
    expect(html).toContain('Temperatura: 36.5 °C')
    expect(html).not.toContain('SpO')
    expect(html).not.toContain('Peso')
    expect(html).not.toContain('Talla')
  })

  it('usa presion_arterial (texto libre) como respaldo si no hay sistólica/diastólica separadas', () => {
    const html = bloqueSignosVitales({ presion_arterial: '118/76' })
    expect(html).toContain('Presión arterial: 118/76')
  })

  it('con todos los campos disponibles, los muestra todos', () => {
    const html = bloqueSignosVitales({
      presion_sistolica: 120, presion_diastolica: 80, frecuencia_cardiaca: 70,
      frecuencia_respiratoria: 16, temperatura: 36.8, saturacion_oxigeno: 98,
      peso: 70.5, estatura: 1.72,
    })
    for (const fragmento of ['Presión arterial', 'Frecuencia cardiaca', 'Frecuencia respiratoria', 'Temperatura', 'SpO₂', 'Peso', 'Talla']) {
      expect(html).toContain(fragmento)
    }
  })
})

describe('renderEncabezadoMedico — formato exacto pedido: nombre + cada dato en su propia línea, orden Cédula → RFC → Universidad', () => {
  it('con los 4 datos completos, reproduce exactamente el ejemplo dado', () => {
    const html = renderEncabezadoMedico({
      nombre: 'Eduardo Iglesias Arines',
      cedula: '91425012',
      rfc: 'AISB750521',
      escuela: 'Universidad Autónoma del Estado de México',
    })
    expect(html).toContain('Eduardo Iglesias Arines')
    expect(html).toContain('Cédula profesional: 91425012')
    expect(html).toContain('RFC: AISB750521')
    // La universidad va SIN el prefijo "Universidad:" — solo el nombre
    // de la institución tal como está guardado.
    expect(html).toContain('Universidad Autónoma del Estado de México')
    expect(html).not.toContain('Universidad:')

    // Orden: cédula antes que RFC, RFC antes que la línea de escuela.
    const posCedula = html.indexOf('Cédula profesional')
    const posRfc = html.indexOf('RFC:')
    const posEscuela = html.indexOf('Universidad Autónoma del Estado de México')
    expect(posCedula).toBeLessThan(posRfc)
    expect(posRfc).toBeLessThan(posEscuela)
  })

  it('sin RFC: omite esa línea por completo, no deja un hueco ni "No disponible"', () => {
    const html = renderEncabezadoMedico({ nombre: 'Dra. Ana Gómez', cedula: '12345678', rfc: null, escuela: 'UNAM' })
    expect(html).not.toContain('RFC')
    expect(html).not.toContain('No disponible')
    expect(html).toContain('Cédula profesional: 12345678')
    expect(html).toContain('UNAM')
    expect(html).not.toContain('Universidad:')
  })

  it('sin cédula ni universidad, solo con RFC: solo aparece esa línea', () => {
    const html = renderEncabezadoMedico({ nombre: 'Dr. Juan Pérez', cedula: null, rfc: 'PEJU850101XYZ', escuela: null })
    expect(html).not.toContain('Cédula profesional')
    expect(html).not.toContain('Universidad')
    expect(html).toContain('RFC: PEJU850101XYZ')
  })

  it('sin ningún dato profesional capturado: solo aparece el nombre, sin ninguna línea vacía', () => {
    const html = renderEncabezadoMedico({ nombre: 'Dr. Sin Datos', cedula: null, rfc: null, escuela: null })
    expect(html).toContain('Dr. Sin Datos')
    expect(html).not.toContain('Cédula profesional')
    expect(html).not.toContain('RFC')
    expect(html).not.toContain('Universidad')
    expect(html).not.toContain('No disponible')
  })

  it('acepta un bloque opcional de datos de la clínica y lo coloca entre el nombre y la cédula (como en el formato de recetario impreso)', () => {
    const html = renderEncabezadoMedico(
      { nombre: 'Dr. Jose Gabino Gerardo Avilés', cedula: '8068097', rfc: null, escuela: null },
      '<div class="clinica-datos">Domicilio: calle Sinaloa — La Paz BCS</div>'
    )
    expect(html).toContain('Domicilio: calle Sinaloa — La Paz BCS')
    const posNombre = html.indexOf('Dr. Jose Gabino Gerardo Avilés')
    const posClinica = html.indexOf('Domicilio: calle Sinaloa')
    const posCedula = html.indexOf('Cédula profesional')
    expect(posNombre).toBeLessThan(posClinica)
    expect(posClinica).toBeLessThan(posCedula)
  })

  it('sin bloque de datos de la clínica (parámetro omitido): no rompe y no agrega nada extra', () => {
    const html = renderEncabezadoMedico({ nombre: 'Dra. Ana Gómez', cedula: '12345678', rfc: null, escuela: null })
    expect(html).toContain('Dra. Ana Gómez')
    expect(html).toContain('Cédula profesional: 12345678')
  })
})
