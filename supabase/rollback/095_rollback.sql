-- ROLLBACK de la migración 095: restituye EXACTAMENTE los privilegios que la 095 revocó (según su instantánea en plataforma_config) y los privilegios por defecto, y borra la clave.
-- Si se ejecuta sin instantánea (ya se hizo el rollback) no cambia nada. Seguro de re-ejecutar.
begin;
do $$ declare r record; v text; begin
  select valor into v from public.plataforma_config where clave = 'rollback_095_privilegios';
  if v is not null then
    for r in select e ->> 'r' as relname, e ->> 'rol' as rol, e ->> 'p' as privilegio from jsonb_array_elements(v::jsonb) e where e ->> 'r' <> '*default*' loop
      if to_regclass(format('public.%I', r.relname)) is not null then
        execute format('grant %s on public.%I to %I', r.privilegio, r.relname, r.rol);
      end if;
    end loop;
    for r in select e ->> 'rol' as rol, e ->> 'p' as privilegio from jsonb_array_elements(v::jsonb) e where e ->> 'r' = '*default*' loop
      execute format('alter default privileges in schema public grant %s on tables to %I', r.privilegio, r.rol);
    end loop;
    delete from public.plataforma_config where clave = 'rollback_095_privilegios';
  end if;
end $$;
commit;
