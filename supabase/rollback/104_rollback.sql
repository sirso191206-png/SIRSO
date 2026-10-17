-- ROLLBACK de la migración 104: retira disparadores, funciones y las tres tablas (política, retenciones legales e historial de decisiones).
-- ATENCIÓN: se PIERDE el historial de decisiones de conservación y las retenciones legales registradas: respáldalos antes. Tras esto, un paciente con registros clínicos
-- vuelve a poder borrarse físicamente por una vía privilegiada (con ON DELETE CASCADE). Seguro de re-ejecutar.
begin;
-- Restituye fn_eliminar_clinica a su definición anterior (089), sin la autorización del borrado de pacientes.
CREATE OR REPLACE FUNCTION public.fn_eliminar_clinica(p_clinica uuid, p_solicitante uuid, p_confirmar_nombre text, p_confirmar_datos_clinicos boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                             -- Lo que se evaluó en el SERVIDOR al decidir (políticas, fechas y avisos): para poder investigar después.
                             'conservacion', v_resumen -> 'conservacion', 'advertencias', v_resumen -> 'advertencias',
                             'confirmo_datos_clinicos', coalesce(p_confirmar_datos_clinicos, false),
                             -- LAS LISTAS COMPLETAS de lo que la base no puede borrar (Storage y Auth), guardadas en la MISMA transacción: si la
                             -- Edge Function se interrumpe tras el commit, nada se pierde y se puede reanudar (fn_limpieza_pendiente_clinica).
                             'limpieza', jsonb_build_object('estado', 'pendiente',
                                'archivos', jsonb_build_object('fotos-clinicas', v_fotos, 'documentos-clinicos', v_docs, 'logos-clinicas', v_logos),
                                'cuentas_auth', v_cuentas),
                             'via', 'fn_eliminar_clinica'));

  return jsonb_build_object('ok', true, 'nombre', v_nombre, 'conteos', v_resumen -> 'conteos', 'se_conserva', v_resumen -> 'se_conserva',
    'rutas_storage', jsonb_build_object('fotos-clinicas', v_fotos, 'documentos-clinicos', v_docs, 'logos-clinicas', v_logos),
    'cuentas_auth', v_cuentas);
end;
$function$;

drop trigger if exists trg_proteger_paciente_conservacion on public.pacientes;
drop trigger if exists trg_proteger_clinica_retencion on public.clinicas;
drop table if exists public.retenciones_legales;
drop table if exists public.conservacion_historial;
drop table if exists public.politicas_conservacion;
drop function if exists fn_proteger_paciente_conservacion();
drop function if exists fn_proteger_clinica_retencion();
drop function if exists fn_historial_conservacion_inmutable();
drop function if exists fn_historial_politica_conservacion();
drop function if exists fn_suprimir_paciente_autorizado(uuid, text, uuid);
drop function if exists fn_liberar_retencion_legal(uuid, text, uuid);
drop function if exists fn_colocar_retencion_legal(uuid, uuid, text, text, text, uuid);
drop function if exists fn_establecer_plazo_conservacion(text, integer, text, text, uuid);
drop function if exists fn_conservacion_paciente(uuid);
drop function if exists fn_plazo_expediente_anios();
drop function if exists fn_retencion_legal_clinica(uuid);
drop function if exists fn_retencion_legal_activa(uuid, uuid);
drop function if exists fn_paciente_tiene_registros_clinicos(uuid);
drop function if exists fn_ultimo_acto_medico(uuid);
commit;
