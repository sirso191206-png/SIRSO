-- ============================================================
-- SIRO — Activar el límite de RETROFECHA de las notas clínicas (decisión del propietario del producto con asesoría clínica/legal)
-- NO está en `migrations/` y NO se ejecuta sola: sin esta clave NO hay límite (la captura sin conexión, que puede sincronizar días después, se conserva como siempre).
-- Con límite de N horas, una nota creada por un USUARIO con fecha más antigua que ahora − N horas se RECHAZA (no se corrige en silencio) y la cola offline la conserva
-- como conflicto definitivo con el mensaje del servidor. No afecta a la operación administrativa (importaciones).
--
-- Uso:   psql "<conexión>" -v horas=<N> -f aplicar_limite_retrofecha.sql        (entero de 1 a 999999)
-- Quitar el límite:   psql "<conexión>" -f quitar_limite_retrofecha.sql
-- Si falta `horas` o no es un entero válido, NO SE ESCRIBE NADA. Seguro de re-ejecutar.
-- ============================================================
\set ON_ERROR_STOP on
\if :{?horas}
\else
  \echo '✘ Falta -v horas=<N>. No se escribió nada.'
  \quit
\endif
-- Dos pasos (PostgreSQL pre-evalúa constantes: 'abc'::int fallaría con un error crudo aunque estuviera en una rama de CASE que no se toma).
select :'horas' ~ '^[0-9]{1,6}$' as pat \gset
\set ok false
\if :pat
  select :'horas'::int >= 1 as ok \gset
\endif
\if :ok
\else
  \echo '✘ horas debe ser un entero de 1 a 999999. No se escribió nada.'
  \quit
\endif
insert into plataforma_config (clave, valor) values ('nota_retrofecha_max_horas', :'horas') on conflict (clave) do update set valor = excluded.valor;
select clave, valor as horas from plataforma_config where clave = 'nota_retrofecha_max_horas';
\echo '✔ Límite de retrofecha activado.'
