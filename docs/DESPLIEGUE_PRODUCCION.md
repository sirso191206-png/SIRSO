# SIRO — Despliegue a producción (procedimiento)

**No ejecutes nada de aquí sin haber completado `VERIFICACION_SUPABASE.md` en un proyecto de DESARROLLO y sin haber tomado las decisiones de `CONFIGURACION_PENDIENTE.md`.** Este procedimiento no se probó contra Supabase real ni contra Vercel real: es la secuencia segura derivada de lo que sí se verificó localmente. Ninguna operación de este paquete despliega por sí sola.

## 0. Puertas de entrada (todas deben cumplirse)
☐ `VERIFICACION_SUPABASE.md` completa en desarrollo, con todas las filas en OK. ☐ `CHECKLIST_NAVEGADOR.md` completa. ☐ Decisiones de `CONFIGURACION_PENDIENTE.md` tomadas (o aceptado explícitamente el valor por omisión seguro). ☐ Los 8 documentos legales revisados por tu asesor jurídico. ☐ Respaldo verificado (§1). ☐ `sha256sum -c docs/MANIFIESTO_SHA256.txt` en OK.

## 1. Respaldo (obligatorio)
Sigue `RESPALDO_Y_RECUPERACION.md`: volcado lógico de la base **y** copia de los tres buckets, y una restauración de prueba en una base distinta.

## 2. Ventana de mantenimiento y orden
El orden es **base de datos → Edge Functions → frontend**, en la misma ventana: el frontend nuevo entiende los códigos nuevos de la base y las funciones nuevas siguen respondiendo igual a un frontend anterior (los errores solo cambian de texto y de estado).

## 3. Base de datos
```bash
psql "$DB_URL" -At -f supabase/verificacion/marcadores_de_migraciones_solo_lectura.sql   # antes: ¿cuáles faltan?
# aplica SOLO las pendientes, UNA POR UNA, en orden; detente en la primera que dé error:
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/<archivo>.sql
psql "$DB_URL" -At -f supabase/verificacion/marcadores_de_migraciones_solo_lectura.sql   # después: todas en true
psql "$DB_URL" -f supabase/verificacion/estado_produccion_solo_lectura.sql                # revisa los conteos esperados (ver VERIFICACION_SUPABASE.md §A.2)
```
Cada migración es transaccional: si falla, no queda a medias. Si una falla, **no sigas**: restaura o usa su rollback (§8) y avísame con el mensaje exacto.

## 4. Secretos y Edge Functions
```bash
supabase link --project-ref <ref-de-PRODUCCIÓN>        # comprueba el ref dos veces
supabase secrets set CORS_ALLOWED_ORIGINS="https://tu-dominio.com" CORREO_SOPORTE="soporte@tu-dominio.com" RESEND_API_KEY="..." --project-ref <ref>
supabase secrets set SIS_CIFRADO_LLAVE_B64="..." --project-ref <ref>        # solo si usas el cifrado SIS
for f in admin-actualizar-clinica admin-crear-clinica admin-eliminar-clinica admin-listar-clinicas admin-ver-clinica cambiar-password crear-usuario eliminar-usuario enviar-contacto sis-cifrar-archivo; do supabase functions deploy $f --project-ref <ref>; done
```
Los secretos solo se escriben en tu terminal; no los guardes en archivos. Si el despliegue de una función falla por las importaciones remotas (`deno.land`, `esm.sh`), anótalo: en las pruebas locales se sustituyeron por módulos locales.

## 5. Frontend
En tu hosting (Vercel): variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (solo la clave anon), comando de build `npm run build`, directorio `dist`, raíz `frontend`. `vercel.json` ya trae las reescrituras de la SPA y las cabeceras de seguridad. **Dominios:** añade tu dominio en el hosting, configúralo como «Site URL» y URLs de redirección en Supabase Auth, y asegúrate de que `CORS_ALLOWED_ORIGINS` lo incluye (si no, el navegador bloqueará las llamadas a las funciones).

## 6. Verificación posterior (en este orden)
☐ Marcadores de migraciones: todos `true`. ☐ Entrar como superadministrador; crear una clínica de prueba y comprobar que se recibe la contraseña temporal de 16 caracteres (debe aparecer la pantalla de cambio obligatorio de contraseña al entrar con ella; ver `CAMBIO_PASSWORD_OBLIGATORIO.md`). ☐ Entrar como un dueño y como un odontólogo; ver solo su clínica. ☐ Finalizar una consulta de prueba (una sola nota). ☐ Subir un logo y verlo en la receta (comprueba la migración 096). ☐ `curl` a la URL pública del logo sin credenciales → 200. ☐ Formulario de contacto: un mensaje de prueba llega una sola vez. ☐ Consola del navegador: sin avisos «Refused to…» de la CSP. ☐ Application → Service Workers: `sw.js` activo. ☐ Auditoría: eventos con el actor correcto. Elimina la clínica de prueba solo si está vacía (si tiene datos, queda bloqueada por conservación, que es lo esperado).

## 7. Seguimiento de la CSP
La `Content-Security-Policy` de `vercel.json` está **impuesta** (28/10/2026): solo permite scripts propios (sin scripts en línea ni `eval`), imágenes propias, `data:`, `blob:` y de Supabase, y conexiones a Supabase. Las ventanas de impresión no llevan scripts: SIRO lanza la impresión desde fuera. Si un recurso de otro dominio deja de cargar, la consola lo indica con «Refused to…».

## 8. Rollback
| Qué | Cómo |
|---|---|
| Frontend | vuelve a publicar el despliegue anterior en tu hosting |
| Edge Functions | vuelve a desplegar las versiones anteriores (de tu ZIP anterior) |
| Base de datos | `supabase/rollback/<nnn>_rollback.sql` en orden **inverso** (102 → 094), cada uno con `psql -v ON_ERROR_STOP=1`; verificados localmente: devuelven el esquema exacto anterior. No hay rollback para 001–093: restaura el respaldo. **No borres la fila `rollback_095_privilegios` de `plataforma_config` antes de retroceder la 095.** |
Ante daño de datos: restaura el respaldo (ver `RESPALDO_Y_RECUPERACION.md`) en una base nueva y compara antes de sustituir.

## 9. Lo que este despliegue NO resuelve
Lo listado en `INFORME_FINAL_AUDITORIA.md` (sección «Pendiente de entorno real» y «Riesgos residuales»): entre otros, el CAPTCHA o límite por IP del formulario público y la validación en navegador.
