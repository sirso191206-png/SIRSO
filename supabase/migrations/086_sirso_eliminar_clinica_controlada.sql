-- ============================================================
-- SIRO — Eliminación DEFINITIVA de una clínica: controlada, autorizada y atómica
-- Migración 086
-- ------------------------------------------------------------
-- PROBLEMA: "Eliminar esta clínica" fallaba con
--     update or delete on table "clinicas" violates foreign key constraint "usuarios_clinica_id_fkey" on table "usuarios".
-- Causa: `usuarios.clinica_id → clinicas` es NO ACTION (igual que pacientes, catalogo_tratamientos, horarios_bloqueados y
-- lista_espera). La Edge Function borraba primero las CUENTAS de Auth (que cascadan a `usuarios`) y, si alguna no se podía
-- borrar, solo lo anotaba como "advertencia" y seguía: acababa borrando datos clínicos y fallando al final contra la FK,
-- sin transacción — dejando la clínica a medias. No se añade ON DELETE CASCADE global (decidiría por cualquier DELETE
-- futuro); el borrado queda en UN procedimiento explícito, en el orden correcto y todo en una transacción.
--
-- QUÉ CONSERVA (a propósito, y sin vínculo a la clínica porque sus FK son ON DELETE SET NULL):
--   auditoría, solicitudes ARCO e incidentes de seguridad. Son registros de cumplimiento, no datos de la clínica.
-- QUÉ BORRA: pacientes y todo lo que cuelga de ellos (expedientes, notas, tratamientos, odontograma, periodontograma,
--   citas, pagos, fotografías, documentos, recetas, consentimientos, referencias, signos vitales), usuarios (filas),
--   catálogo, horarios bloqueados, lista de espera, sucursales, suscripciones, documentos y aceptaciones legales.
--
-- CICLO DE VIDA (distinto en cada paso): suspender (reversible) → [eliminar definitivamente]. Aquí SOLO se puede eliminar
-- una clínica YA suspendida; una activa no.
-- AUTORIZACIÓN: ambas funciones son SECURITY DEFINER y solo ejecutables por service_role (la Edge Function, que antes
-- verifica que quien llama es superadmin). `authenticated` — un propietario incluido — NO puede llamarlas, y comprueban
-- además que `p_solicitante` sea superadmin. No hay ninguna política DELETE sobre `clinicas` para nadie más.
-- Lo que NO se puede hacer en SQL: borrar las cuentas de Auth y los ARCHIVOS de Storage. La función devuelve la lista
-- (rutas e ids) para que la Edge Function los limpie DESPUÉS del commit; si eso falla, la base ya es consistente.
-- Seguro de re-ejecutar.
-- ============================================================
begin;

create or replace function fn_clinica_resumen_eliminacion(p_clinica uuid, p_solicitante uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_cl clinicas%rowtype;
  v_bloqueos jsonb := '[]'::jsonb;
  v_pacientes uuid[];
  v_conteos jsonb;
  v_conservado jsonb;
begin
  select * into v_cl from clinicas where id = p_clinica;
  if not found then
    return jsonb_build_object('existe', false, 'puede_eliminar', false,
      'bloqueos', jsonb_build_array(jsonb_build_object('codigo', 'CLINICA_NO_ENCONTRADA', 'mensaje', 'La clínica no existe.')));
  end if;

  if v_cl.estado <> 'suspendida' then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'NO_SUSPENDIDA',
      'mensaje', 'La clínica está activa. Suspéndela primero (es reversible) y, si de verdad quieres borrarla, elimínala después.');
  end if;
  if exists (select 1 from usuarios where clinica_id = p_clinica and es_super_admin) then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'TIENE_SUPERADMIN',
      'mensaje', 'Esta clínica aloja una cuenta de superadministrador de la plataforma; eliminarla la borraría. Muévela o elimina esa cuenta aparte.');
  end if;
  if p_solicitante is not null and exists (select 1 from usuarios where id = p_solicitante and clinica_id = p_clinica) then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'ES_TU_CLINICA',
      'mensaje', 'No puedes eliminar la clínica a la que pertenece tu propia cuenta.');
  end if;

  select coalesce(array_agg(id), '{}') into v_pacientes from pacientes where clinica_id = p_clinica;
  v_conteos := jsonb_build_object(
    'usuarios', (select count(*) from usuarios where clinica_id = p_clinica),
    'pacientes', cardinality(v_pacientes),
    'citas', (select count(*) from citas where paciente_id = any (v_pacientes)),
    'tratamientos', (select count(*) from tratamientos where paciente_id = any (v_pacientes)),
    'pagos', (select count(*) from pagos where paciente_id = any (v_pacientes)),
    'notas_clinicas', (select count(*) from notas_clinicas n join expedientes e on e.id = n.expediente_id where e.paciente_id = any (v_pacientes)),
    'recetas', (select count(*) from recetas where paciente_id = any (v_pacientes)),
    'consentimientos', (select count(*) from consentimientos_informados where paciente_id = any (v_pacientes)),
    'fotografias', (select count(*) from fotografias where paciente_id = any (v_pacientes)),
    'documentos_clinicos', (select count(*) from documentos_clinicos where paciente_id = any (v_pacientes)),
    'sucursales', (select count(*) from sucursales where clinica_id = p_clinica));
  v_conservado := jsonb_build_object(
    'auditoria', (select count(*) from auditoria where clinica_id = p_clinica),
    'solicitudes_arco', (select count(*) from arco_solicitudes where clinica_id = p_clinica),
    'incidentes_seguridad', (select count(*) from incidentes_seguridad where clinica_id = p_clinica));

  return jsonb_build_object('existe', true, 'nombre', v_cl.nombre, 'estado', v_cl.estado,
    'conteos', v_conteos, 'se_conserva', v_conservado, 'bloqueos', v_bloqueos, 'puede_eliminar', jsonb_array_length(v_bloqueos) = 0);
end;
$$;

create or replace function fn_eliminar_clinica(p_clinica uuid, p_solicitante uuid, p_confirmar_nombre text, p_confirmar_datos_clinicos boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_resumen jsonb;
  v_nombre text;
  v_fotos jsonb; v_docs jsonb; v_logos jsonb; v_cuentas jsonb;
  v_n_pacientes integer;
begin
  -- 1) Autorización: solo un superadmin (la Edge Function ya lo verificó; aquí se vuelve a exigir).
  if p_solicitante is null or not coalesce((select es_super_admin from usuarios where id = p_solicitante), false) then
    raise exception 'Solo un superadministrador de la plataforma puede eliminar una clínica.' using errcode = 'P0001', hint = 'NO_AUTORIZADO';
  end if;

  -- 2) La clínica, bloqueada: nadie la modifica mientras se decide y se borra.
  perform 1 from clinicas where id = p_clinica for update;
  v_resumen := fn_clinica_resumen_eliminacion(p_clinica, p_solicitante);
  if not (v_resumen ->> 'existe')::boolean then
    raise exception 'La clínica no existe.' using errcode = 'P0001', hint = 'CLINICA_NO_ENCONTRADA';
  end if;

  -- 3) Comprobaciones previas: si algo lo impide, se dice QUÉ y no se borra nada.
  if not (v_resumen ->> 'puede_eliminar')::boolean then
    raise exception '%', (select string_agg(b ->> 'mensaje', ' ') from jsonb_array_elements(v_resumen -> 'bloqueos') b)
      using errcode = 'P0001', hint = 'ELIMINACION_BLOQUEADA';
  end if;
  v_nombre := v_resumen ->> 'nombre';
  if btrim(coalesce(p_confirmar_nombre, '')) <> v_nombre then
    raise exception 'El nombre no coincide: escribe el nombre exacto de la clínica para confirmar.' using errcode = 'P0001', hint = 'NOMBRE_NO_COINCIDE';
  end if;
  v_n_pacientes := (v_resumen -> 'conteos' ->> 'pacientes')::int;
  if v_n_pacientes > 0 and not coalesce(p_confirmar_datos_clinicos, false) then
    raise exception 'La clínica tiene % paciente(s) con información clínica. Confirma explícitamente que se destruirá de forma permanente.', v_n_pacientes
      using errcode = 'P0001', hint = 'CONFIRMACION_DATOS_CLINICOS';
  end if;

  -- 4) Lo que la base NO puede borrar por sí sola: se anota ANTES de borrar (después ya no habría de dónde sacarlo).
  select coalesce(jsonb_agg(o.name), '[]'::jsonb) into v_fotos from storage.objects o
   where o.bucket_id = 'fotos-clinicas' and (storage.foldername(o.name))[1] in (select id::text from pacientes where clinica_id = p_clinica);
  select coalesce(jsonb_agg(o.name), '[]'::jsonb) into v_docs from storage.objects o
   where o.bucket_id = 'documentos-clinicos' and (storage.foldername(o.name))[1] in (select id::text from pacientes where clinica_id = p_clinica);
  select coalesce(jsonb_agg(o.name), '[]'::jsonb) into v_logos from storage.objects o
   where o.bucket_id = 'logos-clinicas' and (storage.foldername(o.name))[1] = p_clinica::text;
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_cuentas from usuarios where clinica_id = p_clinica;

  -- 5) El borrado, en el orden que respeta las FK (todo o nada: cualquier error deshace TODO).
  -- Las aceptaciones legales primero: su FK a pacientes/usuarios es SET NULL pero tiene CHECK (usuario_id O paciente_id no
  -- nulo), así que al borrar al paciente o al usuario quedarían inválidas y TODO el borrado fallaría.
  delete from legal_acceptances where clinica_id = p_clinica
     or paciente_id in (select id from pacientes where clinica_id = p_clinica)
     or usuario_id in (select id from usuarios where clinica_id = p_clinica);
  delete from pacientes where clinica_id = p_clinica;            -- cascada: expediente, notas, tratamientos, odontograma, citas, pagos…
  delete from catalogo_tratamientos where clinica_id = p_clinica;
  delete from horarios_bloqueados where clinica_id = p_clinica;
  delete from lista_espera where clinica_id = p_clinica;
  delete from usuarios where clinica_id = p_clinica;             -- las filas; las cuentas de Auth las borra la Edge Function
  delete from clinicas where id = p_clinica;                     -- cascada: sucursales, suscripciones, legal…; SET NULL: auditoría, ARCO, incidentes

  -- 6) Constancia (sobrevive a la clínica). El solicitante es quien responde.
  insert into auditoria (usuario_id, accion, entidad, entidad_id, detalle)
  values (p_solicitante, 'eliminar_clinica', 'clinicas', p_clinica,
          jsonb_build_object('nombre', v_nombre, 'conteos', v_resumen -> 'conteos', 'se_conserva', v_resumen -> 'se_conserva',
                             'archivos_pendientes', jsonb_build_object('fotos', jsonb_array_length(v_fotos), 'documentos', jsonb_array_length(v_docs), 'logos', jsonb_array_length(v_logos)),
                             'cuentas_auth_pendientes', jsonb_array_length(v_cuentas), 'via', 'fn_eliminar_clinica'));

  return jsonb_build_object('ok', true, 'nombre', v_nombre, 'conteos', v_resumen -> 'conteos', 'se_conserva', v_resumen -> 'se_conserva',
    'rutas_storage', jsonb_build_object('fotos-clinicas', v_fotos, 'documentos-clinicos', v_docs, 'logos-clinicas', v_logos),
    'cuentas_auth', v_cuentas);
end;
$$;

-- Solo la Edge Function (service_role). NADIE más: ni anónimos, ni authenticated (un propietario incluido).
revoke all on function fn_clinica_resumen_eliminacion(uuid, uuid) from public, anon, authenticated;
revoke all on function fn_eliminar_clinica(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function fn_clinica_resumen_eliminacion(uuid, uuid) to service_role;
grant execute on function fn_eliminar_clinica(uuid, uuid, text, boolean) to service_role;

commit;
