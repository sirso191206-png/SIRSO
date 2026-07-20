// Validación y parseo de CURP (Clave Única de Registro de Población,
// México) — 18 caracteres, estructura fija. Ver desglose abajo.

const ENTIDADES = {
  AS: 'Aguascalientes', BC: 'Baja California', BS: 'Baja California Sur',
  CC: 'Campeche', CL: 'Coahuila', CM: 'Colima', CS: 'Chiapas', CH: 'Chihuahua',
  DF: 'Ciudad de México', CX: 'Ciudad de México', DG: 'Durango',
  GT: 'Guanajuato', GR: 'Guerrero', HG: 'Hidalgo', JC: 'Jalisco',
  MC: 'México', MN: 'Michoacán', MS: 'Morelos', NT: 'Nayarit',
  NL: 'Nuevo León', OC: 'Oaxaca', PL: 'Puebla', QO: 'Querétaro',
  QR: 'Quintana Roo', SP: 'San Luis Potosí', SL: 'Sinaloa', SR: 'Sonora',
  TC: 'Tabasco', TS: 'Tamaulipas', TL: 'Tlaxcala', VZ: 'Veracruz',
  YN: 'Yucatán', ZS: 'Zacatecas', NE: 'Nacido en el extranjero'
}

const REGEX_CURP = /^[A-Z]{4}\d{6}[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z]\d$/

export function validarEstructuraCurp(curp) {
  if (!curp) return false
  return REGEX_CURP.test(curp.toUpperCase().trim())
}

// Devuelve { valido, fechaNacimiento ('YYYY-MM-DD'), sexo ('M'|'F'),
// entidad, entidadNombre, error }. No lanza excepción — siempre regresa
// un objeto, para que el formulario decida qué mostrar.
export function parsearCurp(curpOriginal) {
  const curp = (curpOriginal || '').toUpperCase().trim()

  if (curp.length !== 18) {
    return { valido: false, error: `La CURP debe tener 18 caracteres (tiene ${curp.length}).` }
  }
  if (!REGEX_CURP.test(curp)) {
    return { valido: false, error: 'La estructura de la CURP no es válida. Revísala.' }
  }

  const aa = curp.slice(4, 6)
  const mm = curp.slice(6, 8)
  const dd = curp.slice(8, 10)
  const sexoCurp = curp[10] // H o M
  const entidad = curp.slice(11, 13)
  const homoclave = curp[16] // dígito (nacido antes de 2000) o letra (2000 en adelante)

  const esSigloXXI = /[A-Z]/.test(homoclave)
  const siglo = esSigloXXI ? '20' : '19'
  const anioCompleto = `${siglo}${aa}`

  const fecha = new Date(`${anioCompleto}-${mm}-${dd}T00:00:00`)
  const fechaValida =
    fecha.getFullYear() === Number(anioCompleto) &&
    fecha.getMonth() + 1 === Number(mm) &&
    fecha.getDate() === Number(dd)

  if (!fechaValida) {
    return { valido: false, error: 'La fecha de nacimiento dentro de la CURP no es válida.' }
  }

  return {
    valido: true,
    fechaNacimiento: `${anioCompleto}-${mm}-${dd}`,
    sexo: sexoCurp === 'H' ? 'M' : 'F', // H=Hombre→M(asculino), M=Mujer→F(emenino) en nuestra convención
    entidad,
    entidadNombre: ENTIDADES[entidad] ?? null,
    error: null
  }
}
