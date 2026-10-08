-- Datos de demostración para la prueba de recuperación: dos clínicas con pacientes, citas, pagos, notas y archivos.
-- Se CONFIRMAN en la base (no hay rollback): es lo que luego se respalda y se restaura.
begin;
insert into auth.users (id, email) select ('f1000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'rec'||g||'@x.mx' from generate_series(1,4) g on conflict do nothing;
insert into clinicas (id, nombre) values ('f2000000-0000-0000-0000-00000000000a','Recuperación A'),('f2000000-0000-0000-0000-00000000000b','Recuperación B') on conflict do nothing;
select fn_asignar_plan_interno(null, c, 'empresarial', 'mensual') from unnest(array['f2000000-0000-0000-0000-00000000000a','f2000000-0000-0000-0000-00000000000b']::uuid[]) c
  where not exists (select 1 from suscripciones s where s.clinica_id = c);
insert into usuarios (id, clinica_id, nombre, correo, rol) values
 ('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-00000000000a','Owner A','rec1@x.mx','owner'),
 ('f1000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-00000000000a','Dentista A','rec2@x.mx','dentista'),
 ('f1000000-0000-0000-0000-000000000003','f2000000-0000-0000-0000-00000000000b','Owner B','rec3@x.mx','owner') on conflict do nothing;
insert into pacientes (clinica_id, nombre_completo, telefono, dentista_responsable_id)
  select 'f2000000-0000-0000-0000-00000000000a', 'Paciente A'||g, '55'||lpad(g::text,8,'0'), 'f1000000-0000-0000-0000-000000000002' from generate_series(1,200) g;
insert into pacientes (clinica_id, nombre_completo) select 'f2000000-0000-0000-0000-00000000000b', 'Paciente B'||g from generate_series(1,50) g;
insert into citas (paciente_id, inicio, fin, dentista_id)
  select id, now() + (row_number() over ())::int * interval '1 hour', now() + (row_number() over ())::int * interval '1 hour' + interval '30 minutes', 'f1000000-0000-0000-0000-000000000002'
    from pacientes where clinica_id = 'f2000000-0000-0000-0000-00000000000a' limit 120;
insert into tratamientos (paciente_id, descripcion, costo, estado) select id, 'Limpieza', 500, 'completado' from pacientes where clinica_id = 'f2000000-0000-0000-0000-00000000000a' limit 150;
insert into pagos (paciente_id, monto) select id, 500 from pacientes where clinica_id = 'f2000000-0000-0000-0000-00000000000a' limit 100;
insert into notas_clinicas (expediente_id, contenido, usuario_id)
  select e.id, 'Nota de recuperación', 'f1000000-0000-0000-0000-000000000002' from expedientes e join pacientes p on p.id = e.paciente_id where p.clinica_id = 'f2000000-0000-0000-0000-00000000000a' limit 80;
insert into storage.objects (bucket_id, name, metadata)
  select 'fotos-clinicas', id::text||'/foto.jpg', jsonb_build_object('size', 1048576) from pacientes where clinica_id = 'f2000000-0000-0000-0000-00000000000a' limit 40;
commit;
