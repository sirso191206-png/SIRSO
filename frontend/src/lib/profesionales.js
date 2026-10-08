// ¿Quién atiende pacientes como odontólogo? Un dentista, y también el propietario que lo indica
// (usuarios.ejerce_como_dentista, migración 084). Un solo criterio para toda la interfaz: la base de datos aplica el
// mismo con fn_es_dentista_de_clinica().
export function ejerceComoDentista(perfil) {
  return perfil?.rol === 'dentista' || (perfil?.rol === 'owner' && perfil?.ejerce_como_dentista === true)
}

// Cómo se muestra en los selectores: el propietario se distingue para no confundirlo con un dentista de la plantilla.
export function nombreParaSelector(usuario) {
  return usuario?.rol === 'owner' ? `${usuario.nombre} (propietario)` : usuario?.nombre
}
