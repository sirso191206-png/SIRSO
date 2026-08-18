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
| `_shared/sis-cifrado.ts` | ✅ Corte E | DES-EDE3/ECB/PKCS5, reimplementado en TS puro tras ingeniería inversa de `cifrado.jar` (la herramienta oficial de la DGIS). Vive en `supabase/functions/_shared/`, nunca en el frontend. |
| `sis-cifrar-archivo` (Edge Function) | ✅ Corte E | Endpoint que cifra un `.TXT` a `.CIF`. La llave real vive como secreto de Supabase (`SIS_CIFRADO_LLAVE_B64`), nunca en el código. |
| `sis-cifrado-cliente.ts` | ✅ Corte E | Cliente frontend que llama a la Edge Function — el cifrado real nunca ocurre en el navegador. |
| `sis-report-history` | ⏳ Pendiente | Tabla `sis_reportes` (quién, clínica, periodo, fecha, hash) + descarga. |
| Pantalla "Generar reporte SIS" | ✅ | `pages/ReporteSis.jsx` (`/reporte-sis`) — conecta mapper → validator → exporter → cifrado con datos reales de un periodo. Requiere `cita_id` en `notas_clinicas` (migración 033) para correlacionar diagnóstico↔cita. |

## Catálogos oficiales de la DGIS: qué se cargó y de dónde

Fuente: catálogos maestros de `gobi.salud.gob.mx/gobi/catalogos/catalogosmaestros/`.

| Catálogo | Archivo fuente | Filas | Dónde vive | Notas |
| --- | --- | --- | --- | --- |
| PAIS | `PAIS_2021_Rev_20241101.xlsx` | 225 | `sis-catalogs.ts` (constante) | Completo, sin filtrar. |
| ENTIDAD FEDERATIVA | `ENTIDAD_FEDERATIVA_201602.xlsx` | 35 | `sis-catalogs.ts` (constante) | Incluye los códigos especiales 00/88/99 que usa la guía. |
| DIAGNOSTICO_SIS | `DIAGNOSTICOS_20240416.zip` | 9,076 de 14,498 | `data/diagnosticos-sis.json` (carga diferida) | Filtrado a `VALID='SI'` y `DIA_SIS='SI'` (vigentes, válidos para consulta externa). |
| TIPO PERSONAL - SIS | `TIPO_PERSONAL-SIS_2024.xlsx` | 4 de 30 (solo dentales) | `sis-catalogs.ts` (constante) | Confirmado: mi transcripción manual del texto de la guía coincidía 100% con el archivo oficial. |
| SERVICIOS DE ATENCIÓN POR TIPO DE PERSONAL SIS-SB | `SERVICIOS_ATENCION_POR_TIPO_PERSONAL_SIS-SB.xlsx` | 4 de 73 (solo dentales) | `sis-catalogs.ts` (constante) | El cruce completo: 10 (Odontología) → pasante/odontólogo/técnico; 11 (Odontología Especializada), 12 (Odontopediatría) y 31 (Cirugía Maxilofacial) → solo especialista. Resuelve `servicioAtencion` en el mapper y lo valida en el validador (incluida la regla "Odontopediatría exige paciente menor de 18 años"). |
| ESTABLECIMIENTO DE SALUD (CLUES, general) | `ESTABLECIMIENTO_SALUD_202606.xlsx` | 64,006 | Tabla `sis_catalogo_establecimientos` en Supabase (migración 032) | Catálogo nacional completo, todos los estatus de operación. |

**Faltante:** ninguno de los catálogos identificados originalmente sigue pendiente. Los 6 de arriba están cargados con datos reales de la DGIS.

### ⚠️ Hallazgo importante: `ESTABLECIMIENTO DE SALUD SIS` (archivo distinto al general)

Existe un **segundo catálogo de establecimientos**, publicado aparte
(`ESTABLECIMIENTO_DE_SALUD_SIS_202606.xlsx`, en la sección de catálogos
específicos del SIS, no en "Catálogos Maestros"). **No es el mismo archivo**
que el general que ya cargamos — es un **subconjunto**: 15,365 de las
64,006 filas (todas presentes también en el general), y solo incluye
establecimientos **actualmente en operación**.

Lo más relevante para SIRO: el campo `institucion` en este catálogo
específico del SIS solo tiene **7 valores, todos de instituciones
públicas** (`SSA`, `IMB`, `SMM`, `SME`, `DIF`, `SMA`, `SMP`) — no aparece
ningún código de consultorio o clínica privada, ni siquiera IMSS/ISSSTE
regulares.

**No tengo forma de confirmar por mi cuenta** si esto significa que el
reporte SIS de Salud Bucal, tal como lo publica la DGIS, está pensado
únicamente para instituciones públicas, o si las clínicas privadas se
incorporan por otra vía (registro aparte, otro convenio, etc.) — es una
pregunta de negocio/regulación, no de código. **Vale la pena confirmarlo
directamente con la DGIS** antes de asumir que cualquier clínica privada
con CLUES puede simplemente empezar a reportar. No cambié la tabla
`sis_catalogo_establecimientos` para usar este archivo filtrado — se
quedó con el catálogo general (64,006, todos los estatus), que es el dato
más completo y neutral mientras se aclara este punto.

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

## Corte E: cifrado — ingeniería inversa de la herramienta oficial

El paquete "Transferencia_2024.zip" (Manuales → Cifrado → Módulo de cifrado,
en gobi.salud.gob.mx) trae `cifrado.jar` + `transferencia.jks` — la
herramienta Java oficial para convertir `.TXT` en `.CIF` antes de subirlo a
SINBA 2.0. Como es Java, no corre en Deno (donde viven las Edge Functions de
Supabase) ni en el navegador — hubo que reimplementarla.

**El algoritmo se determinó por ingeniería inversa** (decompilando el jar
con `javap`) y se verificó de tres formas independientes antes de escribir
una sola línea de la reimplementación:

1. Se corrió `cifrado.jar` de verdad (con Java 21 instalado en este entorno)
   sobre un archivo de prueba real, obteniendo un `.cif` real.
2. Se descifró ese mismo `.cif` usando las clases reales del jar
   (`cifrado.EncriptaArchivo.decrypt`) y se recuperó el texto original
   exacto — confirmando el ciclo completo.
3. Se reprodujo el mismo resultado con Node.js
   (`crypto.createCipheriv('des-ede3-ecb', ...)`), que sí soporta este
   cifrado nativamente (a diferencia de Deno) — confirmación independiente
   de que el algoritmo es **DESede (Triple DES) en modo ECB, con relleno
   PKCS5**.

**Hallazgo importante sobre la "llave":** `transferencia.jks` pesa 2,340
bytes pese a su nombre, **no es un Java KeyStore real**. La herramienta
original solo usa los **primeros 24 bytes del archivo** directamente como
material de llave 3DES (así es como `DESedeKeySpec` de Java trata un
arreglo de bytes). Se verificó generando un `.cif` con un archivo que solo
contenía esos 24 bytes: el resultado fue byte a byte idéntico al original.

**Deno no soporta DES/3DES** (ni siquiera vía su compatibilidad con
`node:crypto` — se probó directamente y lanza `"Unknown cipher"`), así que
`_shared/sis-cifrado.ts` es una implementación **pura en TypeScript** del
algoritmo (DES desde las tablas públicas FIPS 46-3), sin ninguna
dependencia externa. Se probó con `deno test` — 12/12 pruebas en verde,
incluida cifrar/descifrar el archivo oficial de ejemplo completo
(`CSB-EJEMPLOS-2410.txt`) sin perder un solo byte.

**Arquitectura:** el cifrado vive en `supabase/functions/_shared/`, **nunca
en el frontend** — si la llave llegara al navegador, cualquiera podría
verla con las herramientas de desarrollador. La Edge Function
`sis-cifrar-archivo` es el único lugar donde se cifra de verdad; el
frontend (`sis-cifrado-cliente.ts`) solo llama y recibe el `.CIF` ya listo.

### Configurar la llave en producción

```bash
# primeros 24 bytes de transferencia.jks, en base64
supabase secrets set SIS_CIFRADO_LLAVE_B64="<...>"
supabase functions deploy sis-cifrar-archivo
```

⚠️ **Nota de seguridad honesta:** la llave usada en las pruebas
(`sis-cifrado.test.ts`) viene de un archivo de **descarga pública** (sin
registro previo) en gobi.salud.gob.mx — por eso se trata ahí como
constante de prueba compartida, no como secreto personal. Si la DGIS la
trata como confidencial pese a ser descargable, hay que sacarla del código
de prueba y moverla a una variable de entorno de prueba.

## Catálogos: estado final

Los 6 catálogos que necesita la guía de Salud Bucal están cargados con
datos reales de la DGIS. No queda ningún catálogo pendiente de
conseguir — ver el hallazgo sobre `ESTABLECIMIENTO DE SALUD SIS` arriba,
que es una pregunta abierta de negocio, no de datos faltantes.

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

El módulo de cifrado (`_shared/sis-cifrado.ts`) vive fuera del árbol del
frontend a propósito, así que se prueba aparte con el test runner nativo de
Deno:

```bash
cd supabase/functions/_shared
deno test --allow-read sis-cifrado.test.ts
```

## Siguientes cortes

- **Confirmar con la DGIS** si las clínicas privadas reportan por esta
  misma vía o necesitan otro registro — ver el hallazgo sobre
  `ESTABLECIMIENTO DE SALUD SIS` más arriba. Correo redactado y listo para
  enviar a `dgis@salud.gob.mx` / `soporte.sinba@salud.gob.mx`.
- **Carga a SINBA — no hay API pública.** SINBA 2.0 es un portal web con
  usuario/contraseña; el acceso se solicita por correo a `dgis@salud.gob.mx`
  o `soporte.sinba@salud.gob.mx` (asunto "Solicitud de Usuario para Módulo
  de Carga Masiva", con CURP y datos del solicitante — es un alta manual,
  no autoservicio). No existe documentación de una API de carga programática
  en ninguno de los manuales oficiales revisados (Manual de Carga Masiva,
  Manual de Cifrado). "Automatizar" la carga en este punto significaría
  automatizar el navegador contra un portal de login (RPA) — frágil, se
  rompe con cualquier cambio de UI del portal, y no se evaluaron sus
  implicaciones de términos de uso. No se construyó sin decisión explícita
  al respecto. Mientras tanto, el flujo real es: generar el `.CIF` desde
  "Generar reporte SIS" → subirlo a mano en el portal.
- Editar pacientes/prestadores ya creados (hoy los datos SIS solo se
  capturan al dar de alta) — gap pre-existente, no específico de SIS.

