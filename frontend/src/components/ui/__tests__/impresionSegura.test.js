// Documentos imprimibles: un dato capturado (nombre, nota, medicamento…) NUNCA se interpreta como HTML. La ventana de
// impresión comparte origen y sesión con SIRO, así que un «<img onerror>» ahí equivaldría a robar la sesión.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const ATAQUE = '"><img src=x onerror="alert(1)"><script>alert(2)</script>'
const h = vi.hoisted(() => ({ escrito: [] }))

// Cualquier campo de texto que llegue de la base trae el ataque.
const conAtaque = (obj) => new Proxy(obj, { get: (o, k) => (k in o ? o[k] : ATAQUE) })
const clinica = { nombre: ATAQUE, direccion: ATAQUE, telefono: ATAQUE, responsable_sanitario: ATAQUE, logo_url: 'javascript:alert(3)' }

vi.mock('../../../lib/supabase', () => {
  const cadena = { select: () => cadena, eq: () => cadena, single: async () => ({ data: clinica }) }
  return { supabase: { from: () => cadena } }
})
vi.mock('../../../services/signosVitales', () => ({ obtenerSignosVitales: async () => [{ creado_en: '2026-01-01', presion_arterial: ATAQUE, peso: ATAQUE }] }))
vi.mock('../../../services/expedientes', () => ({
  obtenerExpediente: async () => ({ id: 'e', alergias: [{ sustancia: ATAQUE }], enfermedades: [ATAQUE], antecedentes_familiares: ATAQUE, antecedentes_heredofamiliares: [{ parentesco: ATAQUE, enfermedades: [ATAQUE], notas: ATAQUE }], antecedentes_odontologicos: ATAQUE, higiene_dental: ATAQUE }),
  obtenerNotasClinicas: async () => [{ creado_en: '2026-01-01', usuario: { nombre: ATAQUE }, diagnostico_cie10_codigo: ATAQUE, hallazgos: ATAQUE, contenido: ATAQUE, editado: true }]
}))
vi.mock('../../../services/odontograma', () => ({ obtenerOdontogramaCompleto: async () => [{ numero_pieza: '11', estado: ATAQUE, caras: [] }] }))
vi.mock('../../../services/tratamientos', () => ({ obtenerTratamientos: async () => [{ descripcion: ATAQUE, pieza_dental: ATAQUE, estado: ATAQUE, dentista: { nombre: ATAQUE }, costo: 1, creado_en: '2026-01-01' }] }))
vi.mock('../../../services/consentimientos', () => ({ obtenerConsentimientos: async () => [{ creado_en: '2026-01-01', procedimiento: ATAQUE, dentista: { nombre: ATAQUE } }] }))

import { documentoConPolitica, escaparHtml, html, urlImagenSegura, abrirVentanaImpresion } from '../../../lib/imprimir'
import { imprimirRecibo } from '../../tratamientos/imprimirRecibo'
import { imprimirPresupuesto } from '../../tratamientos/imprimirPresupuesto'
import { imprimirReferencia } from '../../referencias/imprimirReferencia'
import { imprimirCorteDeCaja } from '../../pagos/imprimirCorteDeCaja'
import { imprimirConsentimiento } from '../../consentimientos/imprimirConsentimiento'
import { imprimirReceta } from '../../recetas/imprimirReceta'
import { imprimirExpedienteCompleto } from '../../expediente/imprimirExpedienteCompleto'

beforeEach(() => {
  h.escrito = []
  globalThis.window = { open: () => ({ document: { write: (t) => h.escrito.push(t), close: () => {} } }) }
})

const paciente = conAtaque({ id: 'p', fecha_nacimiento: '1990-01-01', sexo: 'F', contacto_emergencia: { nombre: ATAQUE, telefono: ATAQUE } })
const firma = 'data:image/png;base64,iVBORw0KGgo='

const CASOS = {
  recibo: () => imprimirRecibo({ pago: conAtaque({ creado_en: '2026-01-01', monto: 10 }), paciente, clinicaId: 'c' }),
  presupuesto: () => imprimirPresupuesto({ paciente, tratamientos: [conAtaque({ costo: 10, descuento: 0, numero_sesiones: 1 })], clinicaId: 'c' }),
  referencia: () => imprimirReferencia({ referencia: conAtaque({ dentista: { nombre: ATAQUE, cedula_profesional: ATAQUE } }), paciente, clinicaId: 'c' }),
  corte: () => imprimirCorteDeCaja({ pagos: [conAtaque({ monto: 10, paciente: { nombre_completo: ATAQUE } })], desde: '2026-01-01', hasta: '2026-01-02', clinicaId: 'c', totalesPorMetodo: { [ATAQUE]: 10 }, totalGeneral: 10, nombreSucursal: ATAQUE }),
  consentimiento: () => imprimirConsentimiento({ consentimiento: conAtaque({ creado_en: '2026-01-01', fecha_procedimiento: null, revocado_en: '2026-01-02', firma_paciente_png: ATAQUE, firma_medico_png: firma, dentista: { nombre: ATAQUE } }), paciente, clinicaId: 'c' }),
  receta: () => imprimirReceta({ receta: conAtaque({ creado_en: '2026-01-01', medicamentos: [conAtaque({})], firma_paciente_png: ATAQUE, firma_dentista_png: firma, nombre_medico_snapshot: ATAQUE, rfc_snapshot: ATAQUE, cedula_profesional_snapshot: ATAQUE, escuela_snapshot: ATAQUE }), paciente, clinicaId: 'c' }),
  expediente: () => imprimirExpedienteCompleto({ paciente, clinicaId: 'c' })
}

describe('documentos imprimibles: los datos se escapan', () => {
  for (const [nombre, imprimir] of Object.entries(CASOS)) {
    it(`${nombre}: el ataque aparece como texto, nunca como etiqueta o atributo`, async () => {
      await imprimir()
      expect(h.escrito).toHaveLength(1)
      const doc = h.escrito[0]
      expect(doc).toContain(escaparHtml(ATAQUE).slice(0, 20))
      expect(doc).not.toMatch(/<img src=x/i)
      // Como texto (o dentro de un atributo, escapado) puede aparecer; como atributo propio de una etiqueta, nunca.
      expect(doc.replace(/"[^"]*"/g, '""')).not.toMatch(/<[^>]*onerror/i)
      expect(doc).not.toMatch(/<img(?![^>]*src="(data:image\/png;base64,|https:\/\/))/i)
      expect(doc).not.toContain('<script>alert')
      expect(doc).not.toContain('javascript:')
      expect(doc).not.toContain('&amp;nbsp;')
      expect(doc).not.toContain('[object Object]')
      // Solo los <script> propios, firmados con el nonce de la CSP.
      const scripts = doc.match(/<script[^>]*>/gi) ?? []
      expect(scripts.every((s) => /nonce="[0-9a-f]{32}"/.test(s))).toBe(true)
      expect(doc).toMatch(/Content-Security-Policy" content="default-src 'none';[^"]*script-src 'nonce-[0-9a-f]{32}'/)
    })
  }
})

describe('lib/imprimir', () => {
  it('html escapa valores y deja pasar fragmentos html y listas de ellos', () => {
    const lista = [html`<li>${'<b>'}</li>`, html`<li>2</li>`]
    expect(String(html`<ul>${lista}${null}${false}${0}</ul>`)).toBe('<ul><li>&lt;b&gt;</li><li>2</li>0</ul>')
    expect(String(html`<p>${'<b>texto</b>'}</p>`)).toBe('<p>&lt;b&gt;texto&lt;/b&gt;</p>')
  })
  it('abrirVentanaImpresion rechaza un documento que no se armó con html', () => {
    expect(() => abrirVentanaImpresion('<html><body>x</body></html>')).toThrow(/sin escapar/)
    expect(() => documentoConPolitica('<p>x</p>')).toThrow()
  })
  it('urlImagenSegura solo admite imágenes embebidas o https', () => {
    expect(urlImagenSegura('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(urlImagenSegura('https://x.supabase.co/logo.png')).toBe('https://x.supabase.co/logo.png')
    for (const malo of ['javascript:alert(1)', 'data:text/html;base64,AAAA', 'http://x/y.png', '" onerror="x', null]) expect(urlImagenSegura(malo)).toBe('')
  })
})
