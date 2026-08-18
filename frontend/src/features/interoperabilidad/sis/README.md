# Interoperabilidad SIS — Consulta Externa de Salud Bucal

Capa independiente para generar el documento de intercambio del
**Subsistema de Prestación de Servicios (SIS)** de la DGIS.

**Referencia oficial:** GIIS-B016-04-08, versión 4.8 (01/nov/2024).

> Este módulo **no** implica que SIRO esté certificado ante la DGIS, ni el
> cumplimiento de esta guía equivale a certificación. Solo produce un archivo
> con la estructura descrita en la guía, apto para pruebas de carga en el
> ambiente de la DGIS.

La lógica del reporte vive aquí, **aislada de los componentes React** de
pacientes/expediente. No modifica datos clínicos: solo lee y genera el archivo.

## Módulos

| Módulo | Estado | Qué hace |
| --- | --- | --- |
| `sis-types` | ✅ Corte A | Orden canónico de las 77 variables, encabezado oficial exacto y tipos del registro. |
| `sis-exporter` | ✅ Corte A | Genera el TXT (orden, `|`/`&`, CRLF, Windows-1252) y la nomenclatura del archivo. Incluye parser para round-trip. |
| `sis-catalogs` | ✅ Datos reales de la DGIS | `PAIS` (225) y `ENTIDAD_FEDERATIVA` (35) embebidos completos. `DIAGNOSTICO_SIS` (9,076 códigos vigentes) cargado de forma diferida. `ESTABLECIMIENTO_SALUD` (CLUES) vive en Supabase — ver `sis-catalogos-supabase.ts`. |
| `sis-mapper` | ✅ Corte B + C | Arma un registro SIS desde los datos reales de SIRO, prefiriendo las columnas nuevas del corte C cuando existen y cayendo a los defaults oficiales cuando no. |
| Migración 031 | ✅ Corte C | Columnas nuevas (aditivas) para capturar lo que el mapper necesitaba asumir: nombres separados, demográficos, presión dividida, checklist de salud bucal. |
| UI: Acciones de salud bucal | ✅ Corte C | Checklist dentro de la consulta (`AccionSaludBucal.jsx`), conectado a `notas_clinicas.accion_salud_bucal`. |
| `sis-validator` | ✅ Corte D + catálogos reales | Las 77 reglas de validación. Los 10 registros oficiales de ejemplo pasan sin ningún error — incluida la validación de sexo/edad de sus diagnósticos contra el catálogo real cargado. |
| Migración 032 | ✅ Catálogo de Establecimientos | Tabla `sis_catalogo_establecimientos` (64,006 filas nacionales) — ver sección dedicada abajo. |
| `sis-report-history` | ⏳ Pendiente | Tabla `sis_reportes` (quién, clínica, periodo, fecha, hash) + descarga. |

## Catálogos oficiales de la DGIS: qué se cargó y de dónde

Fuente: catálogos maestros de `gobi.salud.gob.mx/gobi/catalogos/catalogosmaestros/`.

| Catálogo | Archivo fuente | Filas | Dónde vive | Notas |
| --- | --- | --- | --- | --- |
| PAIS | `PAIS_2021_Rev_20241101.xlsx` | 225 | `sis-catalogs.ts` (constante) | Completo, sin filtrar. |
| ENTIDAD FEDERATIVA | `ENTIDAD_FEDERATIVA_201602.xlsx` | 35 | `sis-catalogs.ts` (constante) | Incluye los códigos especiales 00/88/99 que usa la guía. |
| DIAGNOSTICO_SIS | `DIAGNOSTICOS_20240416.zip` | 9,076 de 14,498 | `data/diagnosticos-sis.json` (carga diferida) | Filtrado a `VALID='SI'` y `DIA_SIS='SI'` (vigentes, válidos para consulta externa). **No trae la columna `VALIDO_SB`** (qué código es válido por tipo de personal) — esa relación específica sigue sin conseguirse; el catálogo real solo tiene `LSEX`/`LINF`/`LSUP` (sexo y edad), que sí se está validando. |
| ESTABLECIMIENTO DE SALUD (CLUES) | `ESTABLECIMIENTO_SALUD_202606.xlsx` | 64,006 | Tabla `sis_catalogo_establecimientos` en Supabase (migración 032) | Demasiado grande para el frontend (~10 MB incluso recortado). El mapper solo necesita consultar UNA CLUES a la vez — ver `cargarEstablecimientoPorClues()`. |

**Faltante:** el catálogo `SERVICIOS DE ATENCIÓN POR TIPO DE PERSONAL SIS-SB` no aparece en la lista de catálogos maestros — sigue sin conseguirse. Por eso `servicioAtencion` en `sis-mapper.ts` sigue marcado `bloqueante`.

### Instalar el catálogo de Establecimientos (CLUES)

1. Corre la migración `032_sirso_catalogo_establecimientos.sql` (crea la tabla, vacía).
2. Importa las 64,006 filas desde `establecimientos_sis.csv` (adjunto en esta entrega) usando el SQL Editor de Supabase o `psql`:
   ```sql
   \copy sis_catalogo_establecimientos (clues, institucion, entidad, en_operacion, nombre_unidad) from 'establecimientos_sis.csv' with (format csv, header true);
   ```
   Si usas el SQL Editor del dashboard (que no soporta `\copy` de archivos locales), sube el CSV a un bucket de Storage y usa `copy ... from program` o el importador de tablas del propio dashboard de Supabase (Table Editor → Import data from CSV).
3. Verifica: `select count(*) from sis_catalogo_establecimientos;` debe dar 64,006.
4. Actualización futura: la DGIS publica este catálogo mensualmente. Repetir el proceso con el archivo nuevo — la tabla no tiene lógica que dependa de una versión específica.



`sis-validator.ts` implementa las 77 reglas del diccionario de datos —
formato, rangos numéricos, catálogos cerrados, y las dependencias entre
variables que la guía describe (ej. "si `sistolica`≠0, `diastolica` debe
estar entre 20 y 200"; "si `migrante` es internacional, `paisProcedencia`
no puede ser México"). No valida contra los catálogos externos grandes
(`DIAGNOSTICO_SIS`, `ENTIDAD FEDERATIVA`, etc.) porque SIRO aún no los
tiene cargados.

**Prueba dorada:** los 10 registros del archivo oficial de ejemplo de la
DGIS (`CSB-EJEMPLOS-2410.txt`) se parsean y validan uno por uno — los 10
pasan sin ningún error. Es la confirmación más fuerte posible de que las
reglas están bien interpretadas.

**Bugs reales que la integración mapper+validator encontró y corrigió**
en este mismo corte (documentados aquí porque son la prueba de que vale
la pena tener ambos módulos probándose entre sí):
- El regex de nombres rechazaba patrones válidos como `"J. FRANCISCO"`
  (punto seguido de espacio) — la guía dice explícitamente que el
  espacio no cuenta como carácter especial, así que no son "dos
  especiales seguidos". Se encontró gracias a que el archivo oficial
  de ejemplo trae nombres así.
- `sis-mapper` no normalizaba nombres a MAYÚSCULAS SIN ACENTOS antes de
  emitirlos — los datos reales de SIRO vienen en mayúsculas/minúsculas
  mixtas y con acentos ("María", "Pérez"). Se agregó `normalizarTextoSis()`,
  con cuidado de **preservar la Ñ** (Unicode la descompone como "N" +
  acento al quitar diacríticos, y hay que protegerla explícitamente
  porque la guía sí la acepta como letra).

## Corte C: qué se agregó y qué falta de UI

**Migración 031** (aditiva, sin backfill, cero riesgo): nombres separados y
demográficos SIS en `pacientes`/`usuarios`, presión sistólica/diastólica y
otros signos vitales en `signos_vitales`, y `accion_salud_bucal` (jsonb) en
`notas_clinicas`.

**UI construida en este corte:** solo el checklist de **Acciones de salud
bucal**, dentro de la Consulta — era el hueco que bloqueaba *todo* registro
(la guía exige al menos una acción distinta de "0").

**UI pendiente** (el esquema ya está listo, falta el formulario):
- Separar nombre/apellidos de pacientes y prestadores.
- Demográficos del paciente (indígena, afromexicano, migrante, género,
  derechohabiencia, entidad/país de nacimiento).
- Datos SIS del prestador (CURP, tipo de personal, país de nacimiento).
- Presión arterial dividida en sistólica/diastólica en el formulario de
  signos vitales (hoy solo existe el campo de texto libre).

Mientras no exista esa UI, `sis-mapper` sigue funcionando con la heurística
y los defaults oficiales de antes — nada se rompe, la calidad del dato
mejora conforme se vaya construyendo cada formulario.

## Corte D: el validador y lo que encontró

`sis-validator.ts` implementa las 77 reglas del diccionario de datos —
formato, rangos numéricos, catálogos cerrados, y las dependencias entre
variables que la guía describe (ej. "si `sistolica`≠0, `diastolica` debe
estar entre 20 y 200"; "si `migrante` es internacional, `paisProcedencia`
no puede ser México"). Desde que se cargaron los catálogos reales (ver
sección de arriba), también valida sexo/edad de los diagnósticos contra
`DIAGNOSTICO_SIS` de verdad.

**Prueba dorada:** los 10 registros del archivo oficial de ejemplo de la
DGIS (`CSB-EJEMPLOS-2410.txt`) se parsean y validan uno por uno — los 10
pasan sin ningún error, incluida la validación de sexo/edad de sus propios
diagnósticos contra el catálogo real.

**Bugs reales que la integración mapper+validator encontró y corrigió**
en este mismo corte (documentados aquí porque son la prueba de que vale
la pena tener ambos módulos probándose entre sí):
- El regex de nombres rechazaba patrones válidos como `"J. FRANCISCO"`
  (punto seguido de espacio) — la guía dice explícitamente que el
  espacio no cuenta como carácter especial, así que no son "dos
  especiales seguidos". Se encontró gracias a que el archivo oficial
  de ejemplo trae nombres así.
- `sis-mapper` no normalizaba nombres a MAYÚSCULAS SIN ACENTOS antes de
  emitirlos — los datos reales de SIRO vienen en mayúsculas/minúsculas
  mixtas y con acentos ("María", "Pérez"). Se agregó `normalizarTextoSis()`,
  con cuidado de **preservar la Ñ** (Unicode la descompone como "N" +
  acento al quitar diacríticos, y hay que protegerla explícitamente
  porque la guía sí la acepta como letra).

## Advertencias del mapper (`sis-mapper`)

Cada campo que SIRO no captura directamente genera una advertencia con severidad:

- **`oficial`** — la guía define su propio valor de "desconocido/no aplica" (ej. `99` para entidad, `-1` para "se desconoce"). Seguro de enviar tal cual.
- **`supuesto`** — no hay valor oficial de "desconocido" para esa variable; el mapper asumió algo razonable (ej. `tipoPersonal = 13`, país = México). **Debe revisarse a mano** o resolverse con captura real.
- **`bloqueante`** — no hay dato ni valor de reemplazo válido. El registro **no debería enviarse** así. Hoy esto incluye siempre **toda la sección Salud Bucal** (SIRO no captura ninguna de sus 25 variables) y, según el paciente, CLUES/fecha de nacimiento/sexo si faltan.

## Catálogo pendiente

Solo falta **SERVICIOS DE ATENCIÓN POR TIPO DE PERSONAL SIS-SB** — no
aparece en la lista de catálogos maestros de la DGIS; probablemente sea
un anexo específico de la guía GIIS-B016, no un catálogo general. Sin él,
`servicioAtencion` en `sis-mapper.ts` sigue marcado `bloqueante`.

## Detalles que importan (verificados contra el archivo oficial)

- **77 columnas**, líneas **CRLF** (`\r\n`) incluido el final del archivo.
- Encabezado en **MAYÚSCULAS**. La columna 24 es `FECHACONSULTA ` **con un
  espacio final intencional**: viene así en el archivo de la DGIS. No lo quites.
- Codificación **ANSI / Windows-1252**, no UTF-8 (relevante para Ñ y `¨`).
- Solo `codigoCIEDiagnostico2` y `codigoCIEDiagnostico3` pueden ir vacías.
- Multivalor con `&` (p. ej. `derechohabiencia = 2&3`).

## Probar

```bash
npm install          # instala vitest (devDependency)
npx vitest run       # corre la prueba dorada + unitarias
```

La **prueba dorada** parsea `__tests__/fixtures/CSB-EJEMPLOS-2410.txt` (archivo
oficial de ejemplo), lo reexporta y verifica que el resultado es **idéntico byte
a byte** al original.

## Siguientes cortes

- **C-UI** — formularios para los campos que la migración 031 ya soporta
  pero aún no tienen pantalla: nombres separados, demográficos del
  paciente, datos SIS del prestador, presión dividida.
- **E** — cifrado 3DES y carga oficial (el `sis-exporter` ya deja el punto de
  extensión con las extensiones `.CIF` y `.ZIP`). Ya se tiene identificada
  la herramienta oficial de cifrado de la DGIS (`cifrado.jar` +
  `transferencia.jks`, en el paquete "Transferencia_2024" del portal) —
  pendiente de integrar.
- **Importar el catálogo de Establecimientos** — la migración 032 y el CSV
  ya están listos (ver sección de arriba); falta correr la importación
  contra la base real.
- **SERVICIOS DE ATENCIÓN POR TIPO DE PERSONAL SIS-SB** — sigue sin
  encontrarse; resolvería la advertencia `bloqueante` de `servicioAtencion`.
- **Wiring a la UI** — nada de esto todavía se llama desde ninguna pantalla
  real (por eso el bundle de producción no incluye el módulo SIS todavía).
  El siguiente paso natural es una pantalla de "Generar reporte SIS" que
  conecte mapper → validator → exporter con datos reales de una consulta.
