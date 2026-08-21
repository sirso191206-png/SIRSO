# SIRO — Guía de despliegue

Esta es la entrega completa del proyecto tal como quedó al final de esta sesión.
Sigue los pasos en orden — cada uno es necesario para que lo nuevo funcione.

---

## 1. Base de datos (Supabase)

Corre todas las migraciones pendientes de un jalón:

```bash
supabase db push
```

Esto aplica, en orden, todas las que falten hasta la `036`. Están escritas para
ser seguras de volver a correr (usan `if not exists` / `drop policy if exists`),
así que si alguna ya la habías aplicado a mano, no pasa nada por repetirla.

Si prefieres correrlas manualmente en el SQL Editor del dashboard, el orden
importa — respeta la numeración (`031` antes que `032`, etc.).

**Las más recientes de esta sesión, para referencia rápida:**

| Migración | Qué agrega |
|---|---|
| `031` | Captura de datos SIS (nombres separados, demográficos) |
| `032` | Catálogo de Establecimientos (CLUES) — **ya lo importaste, no hace falta repetirlo** |
| `033` | `cita_id` en notas clínicas |
| `034` | Datos completos del paciente: domicilio, contacto de emergencia, ocupación, etc. |
| `035` | Consentimiento informado completo (diagnóstico, pronóstico, grado de urgencia, etc.) |
| `036` | Tutor legal, grupo sanguíneo, toxicomanías, gineco-obstétricos, vigencia/control en recetas, revocación de consentimientos |

---

## 2. Edge Functions

Despliega todas de un jalón:

```bash
supabase functions deploy admin-crear-clinica admin-actualizar-clinica admin-eliminar-clinica admin-listar-clinicas admin-ver-clinica cambiar-password crear-usuario eliminar-usuario enviar-contacto sis-cifrar-archivo
```

**Nueva de esta sesión:** `admin-eliminar-clinica` — la de "Zona de peligro" para
borrar una clínica por completo desde Super Administrador.

---

## 3. Secrets a configurar

La mayoría de las funciones usan `SUPABASE_URL`/`SUPABASE_ANON_KEY`/
`SUPABASE_SERVICE_ROLE_KEY`, que Supabase ya provee automáticamente — **no hay
que configurar nada para esos**.

Los que sí son manuales:

- `CORREO_SOPORTE` y `RESEND_API_KEY` — para el formulario de contacto. Si ya
  los tenías configurados de antes, no hace falta tocarlos.
- `SIS_CIFRADO_LLAVE_B64` — **solo si vas a usar el módulo Reporte SIS**
  (hoy oculto del menú, ver sección de pendientes). Si no lo vas a usar, ignora
  este secret.

```bash
supabase secrets set SIS_CIFRADO_LLAVE_B64="<solo si usas Reporte SIS>"
```

---

## 4. Storage

Los buckets `fotos-clinicas` y `documentos-clinicos` ya deberían existir de
antes de esta sesión — no se creó ningún bucket nuevo. Si por alguna razón no
existen, revisa la migración `001_fase1_schema.sql` y `006_sirso_fase4_expediente.sql`,
que son las que los definen.

---

## 5. Frontend

```bash
cd frontend
npm install
npm run build
```

Sube la carpeta `dist/` a Vercel (o donde despliegues) como siempre. El modelo
3D (`odontograma.glb`, ~1 MB) ya está incluido en `public/models/` — se
empaqueta solo con el build, no requiere ningún paso aparte.

---

## 6. Lo que YA está hecho — no necesitas hacer nada más

- Catálogo de Establecimientos (CLUES) — 64,006 filas, ya lo importaste.
- Módulo SIS completo (cortes A-E) — construido y probado, pero **oculto del
  menú** a propósito (ver pendientes).
- Odontograma 3D con geometría real (ya no son cápsulas placeholder) —
  exportada de tu archivo Blender, conectada a `Diente3D.jsx`.
- `siro_estado()` funcionando en Blender, con los 7 materiales coloreados
  igual que el navegador — archivo de referencia aparte
  (`SIRSO_Odontograma_Interactividad_con_controlador.blend`), no forma parte
  del proyecto web.
- Expediente clínico completo imprimible, consentimientos con firma
  digital/papel y revocación, recetas con vigencia y marca de control,
  antecedentes con autocompletar, tutor legal para menores.
- Eliminar clínica desde Super Administrador (con doble confirmación).

---

## 7. Pendiente — funciones/decisiones que faltan

Esto es lo que **no** está terminado y necesita otra sesión o una decisión tuya:

1. **Dentición temporal/infantil** — confirmaste que la quieres, pero no se
   alcanzó a construir. Es la pieza más grande que queda: nuevo modelo de
   datos (20 piezas temporales, numeración 51-55/61-65/71-75/81-85) y cambios
   en 4 componentes del odontograma (2D, 3D, hoja clínica, expediente
   imprimible).

2. **Escala del modelo 3D real** — quedó con un valor de arranque
   (`FACTOR_ESCALA_MODELO_REAL = 0.2` en `Diente3D.jsx`) calculado por
   matemática, no verificado visualmente (no tengo navegador/GPU en este
   entorno). Ábrelo en tu navegador y, si se ve muy grande o muy chico, ese es
   el único número que hay que ajustar.

3. **Reporte SIS — decisión pendiente de la DGIS**: el correo para preguntar
   si las clínicas privadas pueden reportar (y pedir acceso a SINBA) quedó
   redactado, pero no me confirmaste si lo mandaste.

4. **Edición completa de pacientes ya creados** — se puede editar "Datos
   generales" (identificación, contacto, domicilio, tutor), pero otras partes
   del expediente (antecedentes, odontograma) se editan desde sus propias
   pestañas, no desde un único formulario centralizado.

5. **Carga a SINBA** — sigue siendo manual (generas el `.CIF` desde "Reporte
   SIS" y lo subes tú al portal). No existe una API oficial para automatizarlo
   — quedó documentado en el README del módulo SIS por qué.

---

## 8. Estructura del paquete

```
SIRSO/
├── frontend/           — la app React completa
├── supabase/
│   ├── migrations/      — 001 a 036, en orden
│   └── functions/       — 10 Edge Functions + _shared/
```
