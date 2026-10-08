// CSV para Excel: UTF-8 con BOM (acentos bien), comillas dobles escapadas y protección contra
// "inyección de fórmulas": una celda que empiece con = + - @ (o tabulador/retorno) se prefija con una
// comilla simple para que Excel/Sheets la traten como texto y no ejecuten nada. Los datos de pacientes
// pueden traer cualquier texto escrito por una persona.
const PELIGROSAS = /^[=+\-@\t\r]/

export function celdaCsv(valor) {
  if (valor === null || valor === undefined) return ''
  let texto = typeof valor === 'object' ? JSON.stringify(valor) : String(valor)
  if (PELIGROSAS.test(texto)) texto = `'${texto}`
  return /[",\n\r;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

// columnas: [{ titulo, valor: (fila) => any }]
export function aCsv(columnas, filas) {
  const encabezado = columnas.map((c) => celdaCsv(c.titulo)).join(',')
  const cuerpo = filas.map((f) => columnas.map((c) => celdaCsv(c.valor(f))).join(','))
  return '\uFEFF' + [encabezado, ...cuerpo].join('\r\n')
}

export function descargarCsv(contenido, nombreArchivo) {
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo.endsWith('.csv') ? nombreArchivo : `${nombreArchivo}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
