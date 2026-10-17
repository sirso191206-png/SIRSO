# SIRO — Instalación completa

Esto describe cómo instalar y verificar el paquete. **No** declara que SIRO esté listo para producción: antes de publicar sigue `VERIFICACION_SUPABASE.md` (en un proyecto de DESARROLLO) y toma las decisiones de `CONFIGURACION_PENDIENTE.md`.

## 1. Requisitos
| Componente | Versión probada | Para qué |
|---|---|---|
| Node.js / npm | 22.22 / 10.9 | compilar y probar el frontend |
| Proyecto de Supabase | — | Auth, base de datos PostgreSQL, Storage y Edge Functions |
| Supabase CLI | (no probada aquí) | desplegar las Edge Functions |
| Hosting estático (Vercel u otro) | — | publicar `frontend/dist`; las reglas están en `frontend/vercel.json` |
| `psql` (cliente PostgreSQL) | 16 | aplicar migraciones y ejecutar las consultas de verificación |
| PostgreSQL local y Deno 1.46 | 16 / 1.46 | SOLO si quieres repetir las pruebas SQL, PostgREST y Deno del paquete |

## 2. Antes de nada: comprobar el paquete
```bash
unzip SIRSO-DEFINITIVO-PRODUCCION.zip && cd SIRSO
sha256sum -c docs/MANIFIESTO_SHA256.txt        # todas las líneas deben decir OK (cada archivo del paquete)
# el SHA-256 del ZIP completo viaja en el archivo .sha256 que se entrega junto al ZIP:  sha256sum -c SIRSO-DEFINITIVO-PRODUCCION.sha256
```
El paquete no incluye `.git`, `node_modules`, `dist`, archivos `.env` ni credenciales. Si encuentras alguno, no lo uses y avísame.

## 3. Variables de entorno
**Frontend** (`frontend/.env`, que NO se versiona; parte de `frontend/.env.example`):
| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto, `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | la clave **anon** (pública) del proyecto. Nunca pongas aquí la `service_role` |
**Edge Functions** (secretos de Supabase; se establecen con `supabase secrets set`, nunca en archivos):
| Secreto | Obligatorio | Uso |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | los inyecta Supabase | cada función |
| `RESEND_API_KEY` | para el formulario de contacto | enviar-contacto; sin él responde que falta configurarlo |
| `CORREO_SOPORTE` | recomendado | destino del correo de contacto (por omisión `soporte@siro.app`: cámbialo por uno real) |
| `CORS_ALLOWED_ORIGINS` | sí, si tu dominio no es `https://sirso.vercel.app` | orígenes del navegador permitidos, separados por coma |
| `SIS_CIFRADO_LLAVE_B64` | solo si usas el reporte SIS cifrado | llave de 24 bytes en base64; sin ella el cifrado responde «no configurado» |

## 4. Frontend
```bash
cd frontend
cp .env.example .env            # edita con los datos de tu proyecto de DESARROLLO
npm ci
npm run test:run                # esperado: 147 archivos, 1,972 pruebas, 0 fallos
npx tsc --noEmit && npm run lint && npm run diagnostico:importaciones
npm run build                   # genera dist/ (incluye sw.js, precache-manifest.json y models/odontograma.glb)
```

## 5. Base de datos
* **Instalación NUEVA:** aplica las 107 migraciones de `supabase/migrations/` en orden alfabético (001 → 106; el prefijo 064 aparece dos veces: se aplican ambas). Con `psql`: `for f in $(ls supabase/migrations/*.sql | sort); do psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$f" || break; done`. Ver `INVENTARIO_DE_MIGRACIONES.md`.
* **Instalación EXISTENTE:** ejecuta `supabase/verificacion/marcadores_de_migraciones_solo_lectura.sql`; la primera fila en `false` es la primera migración pendiente. Aplica solo desde ahí. **Nunca re-ejecutes el rango completo.**
* Los **buckets** de Storage (`fotos-clinicas`, `documentos-clinicos` privados; `logos-clinicas` público) y sus políticas los crean las migraciones 001, 006 y 042. Compruébalos con `supabase/verificacion/logos_solo_lectura.sql`.
* **Primer superadministrador:** se da de alta con SQL / `service_role`, nunca desde la aplicación (la migración 077 impide autoasignarse). Crea la cuenta en Authentication y su fila en `usuarios` con `es_super_admin = true` desde el SQL Editor; las columnas obligatorias dependen de tu esquema (`\d usuarios`). Este paso no está automatizado en el paquete y no se pudo probar aquí.

## 6. Edge Functions
Se despliegan con la CLI solo en el proyecto correcto; el procedimiento y las pruebas están en `VERIFICACION_SUPABASE.md` (sección C) y `DESPLIEGUE_PRODUCCION.md`.

## 7. Crear la primera clínica
Como superadministrador: Administración → nueva clínica (plan, modalidad y dueño). El sistema devuelve una contraseña temporal de 16 caracteres (~93 bits de aleatoriedad). **La aplicación obliga a cambiarla antes de usar el sistema** (migración 103; ver `CAMBIO_PASSWORD_OBLIGATORIO.md`, que explica sus límites): entrégala por un canal seguro. Los usuarios creados antes de la 103 NO están marcados. El resto de los usuarios los crea el dueño desde la aplicación.

## 8. Verificación local opcional (requiere PostgreSQL y Deno locales)
Las pruebas SQL, de concurrencia, PostgREST y Deno están en `supabase/tests/` y se describen en `RESULTADOS_DE_PRUEBAS.md`. Suponen una base desechable llamada `siro_test` y el usuario `postgres`; **nunca las apuntes a una base con datos reales**.
