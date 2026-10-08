# SIRO — Roles y permisos

Este documento describe **qué puede hacer cada rol**. Hay dos capas, y la segunda es la que manda:

1. **Pantallas** (interfaz): qué secciones ve cada rol y a cuáles puede entrar escribiendo la dirección. Es comodidad y orden;
   no es seguridad. La tabla vive en `frontend/src/lib/accesoPorRol.js` y la usan el menú y el guardián de rutas, de modo que no
   pueden contradecirse. **La matriz de abajo se genera desde esa misma tabla.**
2. **Datos** (base de datos): qué filas puede leer o escribir cada rol. Lo decide la base (RLS y triggers) y **se verifica con
   pruebas automáticas** (`supabase/tests/aislamiento_clinicas_test.sql`: 36 verificaciones por rol, incluidos archivos de Storage).
   Aunque alguien manipulara la interfaz, la base no le devuelve ni le deja guardar nada ajeno.

## Roles

| Rol | Quién es |
|---|---|
| **Superadmin** | Personal de SIRO. Administra clínicas, planes, suscripciones y ve la auditoría administrativa. No se puede otorgar por la aplicación: se da de alta solo con SQL o `service_role` (migración 077). |
| **Owner** (propietario) | Dueño de **una** clínica. Administra su clínica y su equipo. **No puede** crear otra clínica, crear otro superadmin, ni cambiar planes, límites o suscripciones. |
| **Dentista** | Atiende a **sus** pacientes asignados. |
| **Asistente** | Apoya a uno o varios dentistas (los asigna el owner). |
| **Recepción** | Agenda, datos administrativos de pacientes y cobros. Sin información clínica. |

## Pantallas por rol

| Pantalla | Owner | Dentista | Asistente | Recepción | Superadmin |
|---|---|---|---|---|---|
| `/` (solo inicio) | ✔ | ✔ | ✔ | — | ✔ |
| `/agenda` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `/pacientes` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `/consulta` | ✔ | ✔ | ✔ | — | ✔ |
| `/catalogo` | ✔ | ✔ | — | — | ✔ |
| `/corte-de-caja` | ✔ | — | — | ✔ | ✔ |
| `/reportes` | ✔ | — | — | — | ✔ |
| `/auditoria` | ✔ | — | — | — | ✔ |
| `/usuarios` | ✔ | — | — | — | ✔ |
| `/sucursales` | ✔ | — | — | — | ✔ |
| `/configuracion` | ✔ | — | — | — | ✔ |
| `/configuracion/seguridad` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `/ayuda` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `/administracion/arco` | ✔ | — | — | — | ✔ |
| `/administracion/incidentes` | ✔ | — | — | — | ✔ |
| `/administracion` | —|—|—|—| ✔ |
| `/superadmin` | —|—|—|—| ✔ |
| `/admin` | —|—|—|—| ✔ |

Notas: `/consulta/<id>` es la pantalla de atención de una cita (la recepción no entra a lo clínico); `/configuracion/seguridad` es
personal (cambiar contraseña y cerrar sesiones propias); las rutas que cuelgan de un patrón (p. ej. `/pacientes/<id>`) heredan su regla.
Además, cada pantalla se muestra solo si **el plan de la clínica incluye la funcionalidad** (agenda, tratamientos, caja, estadísticas,
auditoría, sucursales…); eso también es de interfaz, y las funcionalidades con datos (recetas, pagos, odontograma, etc.) se aplican en la base.

## El propietario que también es dentista (migración 084)
Muchas veces el dueño de la clínica atiende pacientes. Para eso existe una **marca por propietario**: `usuarios.ejerce_como_dentista`
(se activa en el menú del nombre → "Datos profesionales" → "Atiendo pacientes como dentista").
- **Apagada por omisión**: el dueño que no atiende pacientes no aparece en las listas de odontólogos.
- **Solo un propietario puede tenerla** (restricción en la base): un dentista, un asistente o recepción no pueden marcarse ni ser marcados.
- Con la marca el propietario aparece (como "Nombre (propietario)") en: odontólogo de una cita, odontólogo responsable de un paciente,
  filtros de reportes y asignación de asistentes; y la base acepta asignarlo (antes lo rechazaba: exigía `rol = 'dentista'`).
- **No cambia lo que ve**: el propietario ya veía todos los pacientes de su clínica; la marca no lo limita a "los suyos". Al agendar,
  se preselecciona a sí mismo.
- Quitar la marca no desasigna a nadie: los pacientes ya asignados siguen con él (se muestra como "actual"); solo deja de poder asignarse nuevos.
- Todo cambio queda en la auditoría (`editar_usuarios`). Lo cubren 25 pruebas SQL (`owner_dentista_test.sql`).

## Datos por rol (lo que decide la base)

| Rol | Pacientes | Expediente clínico | Recetas | Odontograma/periodontograma | Citas/pagos |
|---|---|---|---|---|---|
| **Owner** | Todos los de su clínica | Todos | Todas | Todos | Todos |
| **Dentista** | Solo los asignados a él | Solo de sus pacientes | Solo de sus pacientes | Solo de sus pacientes | Solo de sus pacientes |
| **Asistente** | Solo de los dentistas que apoya | Limitado, según asignación | No | No | Según asignación |
| **Recepción** | Todos (datos administrativos) | No | No | No | Todos (administrativo) |

- **Nadie ve datos de otra clínica**, en ningún rol: ni pacientes, citas, pagos, expedientes, usuarios, archivos ni la auditoría.
- **Auditoría**: la leen el owner (solo la de su clínica) y el superadmin (todas). Dentista, asistente y recepción no la leen. Nadie
  puede modificarla ni borrarla, y un usuario no puede escribir eventos en la bitácora de otra clínica (migración 081).
- **Archivos clínicos** (fotos y documentos): solo quien tiene acceso al paciente. Subir documentos clínicos: owner y dentista.
  El logo: solo el owner de esa clínica. No hay política de borrado desde la aplicación (ver "Riesgos conocidos").
- **Reasignar un paciente a otro dentista**: solo el owner (protegido con un trigger, no solo con RLS).
- **Recepción** solo puede modificar una lista blanca de columnas del paciente (nombre, teléfonos, correo, domicilio, nacionalidad, CURP,
  tipo de paciente); nunca columnas clínicas, ni las que se agreguen en el futuro.
- **Planes, suscripciones, `es_super_admin`**: solo el superadmin (y solo mediante las funciones `sa_*`).
- **Sesiones**: cada persona solo ve y cierra sus propias sesiones. El plan limita cuántas puede tener abiertas a la vez.

## Cómo verificarlo

```bash
cd supabase/tests && ./run_planes_tests.sh                       # planes, límites, funcionalidades, clínicas heredadas
for f in aislamiento_clinicas auditoria_aislamiento planes_auditoria_hotfix sesiones_reales \
         sucursales_multisucursal vencimiento_almacenamiento ranking_tratamientos; do
  psql -d <base_migrada> -f ${f}_test.sql; done
cd ../../frontend && npx vitest run src/components/ui/__tests__/accesoPorRol.test.js   # matriz rol × pantalla
```

## Riesgos conocidos
- Todo esto está probado contra PostgreSQL local, **no contra un Supabase real**: validar en staging antes de producción.
- Un owner puede dar de alta a otro owner **dentro de su propia clínica** por la API directa (no crea clínicas y cuenta contra el límite de usuarios).
- Los archivos clínicos no se pueden borrar desde la aplicación (no existe política de borrado): quedan huérfanos si se elimina el registro.
