# Sistema de Gestión Odontológica — Fase 1 (Supabase)

MVP funcional: pacientes, expediente clínico, tratamientos, pagos, agenda,
fotografías y gestión de usuarios. Backend = Supabase (Postgres + Auth +
Storage + RLS + Edge Functions). Frontend = React + Vite + Tailwind + Zustand.

## 1. Levantar el proyecto de Supabase

1. Crea un proyecto en https://supabase.com (o usa Supabase CLI local).
2. En el **SQL Editor** del dashboard, corre el contenido de
   `supabase/migrations/001_fase1_schema.sql` completo, de arriba hacia abajo.
3. Crea la primera clínica y el primer usuario owner:

```sql
insert into clinicas (nombre) values ('Consultorio Demo') returning id;
-- copia el id que regresa, lo usas abajo
```

4. Ve a **Authentication → Users** y crea un usuario (correo + password).
   Copia su UUID.
5. Vincúlalo como owner de la clínica:

```sql
insert into usuarios (id, clinica_id, nombre, correo, rol)
values (
  '<uuid-del-usuario-de-auth>',
  '<id-de-la-clinica>',
  'Tu Nombre',
  'tu-correo@ejemplo.com',
  'owner'
);
```

Sin esta fila en `usuarios`, el login funciona pero la app no puede
determinar clínica/rol y las policies de RLS bloquean todo — es intencional.
Este es el único usuario que necesitas crear a mano; el resto se crea desde
la app (ver sección 3).

## 2. Levantar el frontend

```bash
cd frontend
npm install
cp .env.example .env
```

Edita `.env` con la URL y `anon key` de tu proyecto (Settings → API en el
dashboard de Supabase):

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

```bash
npm run dev
```

Abre http://localhost:5173 e inicia sesión con el usuario que creaste.

## 3. Gestión de usuarios (Edge Function)

Crear usuarios desde la app requiere la `service_role key`, que nunca debe
llegar al navegador — por eso vive en una Edge Function que corre en el
servidor de Supabase, no en el frontend.

Necesitas [Supabase CLI](https://supabase.com/docs/guides/cli) instalado:

```bash
npx supabase login
npx supabase link --project-ref <tu-project-ref>
npx supabase functions deploy crear-usuario
```

No hace falta configurar variables de entorno para la función: `SUPABASE_URL`,
`SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase
automáticamente en tiempo de ejecución.

Una vez desplegada, entra a la app como owner → menú "Usuarios" → "+ Nuevo
usuario". Al crearlo se muestra una contraseña temporal una sola vez —
compártela por un medio seguro (no por correo sin cifrar) y pide que la
cambien en su primer inicio de sesión.

## 4. Estructura

```
dental-erp/
├── supabase/
│   ├── migrations/
│   │   └── 001_fase1_schema.sql   -- tablas, RLS, triggers, storage
│   └── functions/
│       └── crear-usuario/          -- Edge Function (service role, alta de usuarios)
└── frontend/
    └── src/
        ├── lib/supabase.js         -- cliente Supabase
        ├── store/useAuthStore.js   -- sesión + perfil + rol (Zustand)
        ├── services/                -- una función por operación de BD
        ├── hooks/                   -- capa React sobre los services
        ├── components/ui/           -- Button, Input, Badge, Modal
        ├── components/layout/       -- Sidebar, ProtectedRoute
        └── pages/                   -- Login, Pacientes, PacienteDetalle, Agenda, Usuarios, Dashboard
```

## 5. Qué SÍ cubre esta Fase 1

- Alta rápida de pacientes con aviso de posibles duplicados.
- Expediente clínico con banner de alergias y notas append-only
  (no se pueden editar ni borrar, solo corregir con una nota nueva).
- Tratamientos con estado y costo, saldo calculado en vivo (vista SQL,
  nunca un campo cacheado).
- Pagos (efectivo/tarjeta/transferencia/otro).
- Agenda mensual agrupada por día, con posponer / cancelar / desagendar,
  y bloqueo de traslapes a nivel de base de datos (`EXCLUDE USING gist`,
  no solo validación en JS).
- Fotografías clínicas con URLs firmadas de 10 minutos (bucket privado).
- Gestión de usuarios (alta con contraseña temporal vía Edge Function,
  desactivar/reactivar) — solo accesible para el rol owner.
- Auditoría automática vía triggers de Postgres — nadie puede "olvidar"
  loguear una acción sensible.
- RLS por clínica y por rol (owner / dentista / recepción / asistente) en
  cada tabla.

## 6. Qué falta a propósito (fuera de alcance de Fase 1)

- Odontograma interactivo, radiografías, portal del paciente,
  multi-sucursal, cualquier IA — todo eso es Fase 2+ según el documento
  de arquitectura original.
- Recuperación de contraseña desde la UI (Supabase Auth ya lo soporta por
  API, solo falta la pantalla).
- Subida de fotos desde cámara móvil directa (hoy es input de archivo
  estándar; el componente de captura queda para pulir).

## 7. Siguientes pasos sugeridos

1. Probar el flujo completo con datos reales de un consultorio por una
   semana antes de invitar a más usuarios.
2. Cuando esto esté estable, continuar con Fase 2 (odontograma,
   radiografías, recetas, consentimientos digitales).
