// Vista LOCAL del odontograma para un paciente creado sin conexión.
// Las 32 piezas reales las crea un trigger en el servidor en cuanto el
// paciente existe ahí (migración 002_fase2_odontograma.sql) — antes de
// eso no hay ningún `pieza.id` real al que apuntar. Esto genera un
// odontograma "en blanco" (todo 'sano', igual que lo crearía el
// trigger) puramente para que la pantalla tenga algo que mostrar y
// editar mientras tanto; cada pieza usa un id local (`offline-pieza-N`)
// que solo sirve para que la UI sepa CUÁL pieza se está editando —
// nunca se manda a Supabase.

// Notación FDI, mismo orden que usa el trigger fn_crear_odontograma_paciente.
export const NUMEROS_PIEZA_FDI = [
  '18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28',
  '48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'
]

export function idPiezaOffline(numeroPieza) {
  return `offline-pieza-${numeroPieza}`
}

// null si `id` no es un placeholder de pieza offline (id real, o
// cualquier otra cosa) — nunca asume, solo reconoce el formato exacto.
export function numeroDePiezaOffline(id) {
  if (typeof id !== 'string') return null
  const m = /^offline-pieza-(.+)$/.exec(id)
  return m ? m[1] : null
}

export function piezasOfflineIniciales() {
  return NUMEROS_PIEZA_FDI.map((numero_pieza) => ({
    id: idPiezaOffline(numero_pieza),
    numero_pieza,
    estado: 'sano',
    diagnostico: null,
    tratamiento_id: null,
    notas: null,
    material_corona: null,
    tipo_incrustacion: null,
    tipo_ausencia: null,
    caras: [],
    actualizado_en: null,
    _offline: true
  }))
}
