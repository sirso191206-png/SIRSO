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
| `sis-catalogs` | ⏳ Pendiente | Catálogos oficiales DGIS (PAIS, ENTIDAD, AFILIACION, DIAGNOSTICO_SIS, etc.) y lookups. |
| `sis-mapper` | ⏳ Pendiente | Arma un registro SIS desde una consulta de SIRO, con defaults de la guía. |
| `sis-validator` | ⏳ Pendiente | Las 77 reglas de validación con errores legibles. |
| `sis-report-history` | ⏳ Pendiente | Tabla `sis_reportes` (quién, clínica, periodo, fecha, hash) + descarga. |

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

- **B** — `sis-mapper` con lo que SIRO ya captura + defaults de la guía.
- **C** — migración aditiva para capturar los campos SIS faltantes
  (nombres separados, presión sistólica/diastólica, acciones de salud bucal,
  demográficos). No destructiva.
- **D** — `sis-validator` completo + ampliar la prueba dorada.
- **E** — cifrado 3DES y carga oficial (el `sis-exporter` ya deja el punto de
  extensión con las extensiones `.CIF` y `.ZIP`).
