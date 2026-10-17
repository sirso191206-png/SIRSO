-- ROLLBACK del CANDIDATO 111 (v7). Reabre H23 (el borrado de un usuario vuelve a dejar NULL la autoría). No toca datos.
begin;
drop trigger if exists trg_usuario_con_registros_no_se_borra on public.usuarios;
drop function if exists public.fn_usuario_con_registros_no_se_borra();
commit;
