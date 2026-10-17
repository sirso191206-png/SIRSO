-- ============================================================
-- SIRO — Activar las políticas de CONSERVACIÓN (decisión del propietario del producto con asesoría legal/contable)
-- NO está en `migrations/` y NO se ejecuta sola: SIRO no define ningún plazo legal por ti. Mientras no se ejecute, la eliminación de una clínica con datos clínicos o
-- pagos sigue BLOQUEADA (bloqueo preventivo). Una vez ejecutada, solo se podrán eliminar clínicas cuyo último movimiento sea más antiguo que el plazo.
--
-- Uso (años enteros de 1 a 999; `contractual` es OPCIONAL: sin él solo se avisa y no se bloquea):
--   psql "<conexión>" -v expediente=<años> -v fiscal=<años> [-v contractual=<años>] -f aplicar_politicas_conservacion.sql
-- Si falta `expediente` o `fiscal`, o algún valor no es un entero de 1 a 999, NO SE ESCRIBE NADA. Es seguro de re-ejecutar (reemplaza el valor).
-- Los valores los define tu asesoría: la NOM-004-SSA3-2012 (mínimo de 5 años para el expediente clínico) es solo una referencia que requiere validación legal.
-- ============================================================
\set ON_ERROR_STOP on
\if :{?expediente}
\else
  \echo '✘ Falta -v expediente=<años>. No se escribió nada.'
  \quit
\endif
\if :{?fiscal}
\else
  \echo '✘ Falta -v fiscal=<años>. No se escribió nada.'
  \quit
\endif
-- Dos pasos: PostgreSQL pre-evalúa las constantes al planificar, así que 'abc'::int fallaría con un error crudo aunque estuviera en una rama de CASE que no se toma.
-- Primero se comprueba el PATRÓN; solo si es un entero de 1 a 3 cifras se convierte y se compara el rango.
select :'expediente' ~ '^[0-9]{1,3}$' as pat_exp, :'fiscal' ~ '^[0-9]{1,3}$' as pat_fis \gset
\set ok_exp false
\set ok_fis false
\if :pat_exp
  select :'expediente'::int between 1 and 999 as ok_exp \gset
\endif
\if :pat_fis
  select :'fiscal'::int between 1 and 999 as ok_fis \gset
\endif
\if :ok_exp
\else
  \echo '✘ expediente debe ser un entero de 1 a 999. No se escribió nada.'
  \quit
\endif
\if :ok_fis
\else
  \echo '✘ fiscal debe ser un entero de 1 a 999. No se escribió nada.'
  \quit
\endif
\if :{?contractual}
  select :'contractual' ~ '^[0-9]{1,3}$' as pat_con \gset
  \set ok_con false
  \if :pat_con
    select :'contractual'::int between 1 and 999 as ok_con \gset
  \endif
\else
  \set ok_con true
\endif
\if :ok_con
\else
  \echo '✘ contractual debe ser un entero de 1 a 999 (o no indicarlo). No se escribió nada.'
  \quit
\endif
begin;
insert into plataforma_config (clave, valor) values ('retencion_expediente_anios', :'expediente'), ('retencion_fiscal_anios', :'fiscal') on conflict (clave) do update set valor = excluded.valor;
\if :{?contractual}
  insert into plataforma_config (clave, valor) values ('retencion_contractual_anios', :'contractual') on conflict (clave) do update set valor = excluded.valor;
\endif
commit;
select clave, valor as anios from plataforma_config where clave like 'retencion_%' order by clave;
\echo '✔ Políticas de conservación activadas. Una clínica solo podrá eliminarse cuando su último movimiento supere cada plazo y no tenga solicitudes ARCO ni incidentes abiertos.'
