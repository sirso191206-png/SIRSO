# Sesiones por dispositivo — control real (migración 078)

## Qué había y por qué no bastaba
"Sesión" era una fila de `sesiones_usuario` que **escribe el propio navegador**, sin relación con la sesión real de
Supabase Auth. Por eso no se podía cerrar una sesión concreta de otro dispositivo (solo "cerrar todas"), y el límite
del plan solo marcaba una fila: el dispositivo "cerrado" se enteraba por Realtime y se cerraba *si quería*. Uno que
estaba sin conexión en ese momento, o un cliente alterado, conservaba su sesión y su refresh token.

## Cómo funciona ahora
La fuente de verdad es `auth.sessions` (la tabla donde Supabase Auth guarda cada sesión). Todo access token trae el
claim `session_id`.

| Pieza | Qué hace |
|---|---|
| `mis_sesiones_activas()` | Lista las sesiones reales del usuario (dispositivo, fechas, cuál es la actual, cuál excede el plan). Solo las propias. |
| `cerrar_sesion_remota(id)` | Borra ESA sesión de `auth.sessions`: su refresh token deja de servir. Solo sesiones propias; no la actual; queda en `auditoria`. |
| Límite del plan | Solo valen las **N sesiones más recientes** del usuario (N = límite de la suscripción; NULL = ilimitado). La más antigua queda inválida sola, sin triggers sobre `auth`. Cambiar el plan cambia el cupo al instante. |
| Políticas `sesion_activa_<tabla>` | RESTRICTIVAS en las 41 tablas con RLS: con el interruptor encendido, un token ya emitido de una sesión cerrada **deja de leer y escribir de inmediato** (sin esperar a que caduque, normalmente 1 h). |
| `mi_sesion_estado()` | Lo consulta el dispositivo (cada minuto, al volver a la pestaña y al reconectar) para cerrar su sesión local. |

Un dispositivo **sin conexión** cuando lo cierran: al reconectar su siguiente revisión (o su intento de renovar la sesión)
falla y cae a login. `logout()` forzado **conserva los cambios pendientes de subir**.

Sin red la revisión no cierra nada: SIRO trabaja offline y sin red no se puede saber.

## Despliegue (en este orden)
1. **Staging primero.** La 078 asume cosas de Supabase que aquí solo se probaron contra un PostgreSQL local:
   - que el rol que ejecuta las funciones puede leer y borrar en `auth.sessions`;
   - que el access token trae `session_id`.
2. Aplica la **078**. Viene con el interruptor **APAGADO**: listar y cerrar sesiones ya funciona y los dispositivos se
   enteran, pero la base todavía no corta nada.
3. Verifica (SQL Editor):
   ```sql
   select count(*) from auth.sessions;                          -- debe responder (no error de permisos)
   select clave, valor from plataforma_config;                   -- control_sesiones_estricto = off
   select count(*) from pg_policies where policyname like 'sesion_activa_%';   -- 41
   ```
   En el navegador, con sesión iniciada: `JSON.parse(atob(JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.includes('auth-token')))).access_token.split('.')[1])).session_id` → debe dar un UUID.
4. Prueba con **dos dispositivos**: Seguridad → aparecen los dos → en uno, "Cerrar esta sesión" sobre el otro → el otro vuelve a login en menos de un minuto y avisa que sus cambios se conservan.
5. **Enciende el corte** (el cierre pasa a ser inmediato en la base):
   ```sql
   update plataforma_config set valor = 'on' where clave = 'control_sesiones_estricto';
   ```
   Repite la prueba: el dispositivo cerrado ya no lee ni escribe nada desde ese instante.
6. **Para apagarlo** si algo sale mal: `update plataforma_config set valor = 'off' where clave = 'control_sesiones_estricto';` (efecto inmediato, sin redeploy).

## Garantías y límites
- **Falla abierta:** si `auth.sessions` no se puede leer (permisos o estructura), las funciones consideran la sesión válida. Nunca dejan a todos afuera por un problema de infraestructura (eso también significa que, en ese caso, el control no aplica).
- Tokens sin `session_id` (service_role, tokens antiguos) no se cortan.
- **Storage** (esquema `storage`, administrado por Supabase) no pasa por estas políticas: un token revocado podría seguir usándolo hasta que caduque.
- **Tablas nuevas con RLS** necesitan su política: corre `select fn_proteger_tablas_con_sesion();` después de crearlas (idempotente). La prueba `sesiones_reales_test.sql` (D1) falla si alguna no la tiene.
- Una cuenta compartida entre varias personas se estorba a sí misma: cada inicio de sesión nuevo, sobre el límite, saca al más antiguo. Es el comportamiento pedido, pero conviene decírselo a la clínica.
- El registro viejo `sesiones_usuario` sigue existiendo (auditoría, aviso por Realtime) pero ya no es la fuente de verdad.
- En `usuarios` la política se escribe sin `(select …)` porque con él da "infinite recursion detected" en UPDATE (medido; es la única de las 41).

## Pruebas
`supabase/tests/sesiones_reales_test.sql` — 28 verificaciones sobre PostgreSQL real (9 mutaciones atrapadas): interruptor, corte, límite, cambio de plan, cierre remoto y sus protecciones, cobertura de tablas, barrido anti-recursión y falla abierta.
Frontend: `sesionesReales.test.js` — 19 pruebas (6 mutaciones atrapadas).
