-- Datos mínimos para verificar_postgrest.mjs: dos clínicas, owner, dentista, asistente y una cita en cada una.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email) select ('d2000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0'))::uuid, 'pg'||g||'@x.mx' from generate_series(1,5) g;
insert into clinicas (id, nombre) values ('c2000000-0000-0000-0000-00000000000a','A'),('c2000000-0000-0000-0000-00000000000b','B');
select fn_asignar_plan_interno(null, c, 'empresarial', 'mensual') from unnest(array['c2000000-0000-0000-0000-00000000000a','c2000000-0000-0000-0000-00000000000b']::uuid[]) c;
insert into usuarios (id, clinica_id, nombre, correo, rol) values
 ('d2000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-00000000000a','Owner A','pg1@x.mx','owner'),
 ('d2000000-0000-0000-0000-000000000002','c2000000-0000-0000-0000-00000000000a','Dentista A','pg2@x.mx','dentista'),
 ('d2000000-0000-0000-0000-000000000003','c2000000-0000-0000-0000-00000000000a','Asistente A','pg3@x.mx','asistente'),
 ('d2000000-0000-0000-0000-000000000004','c2000000-0000-0000-0000-00000000000b','Owner B','pg4@x.mx','owner'),
 ('d2000000-0000-0000-0000-000000000005','c2000000-0000-0000-0000-00000000000b','Dentista B','pg5@x.mx','dentista');
insert into asistente_dentista_asignaciones (clinica_id, asistente_id, dentista_id) values ('c2000000-0000-0000-0000-00000000000a','d2000000-0000-0000-0000-000000000003','d2000000-0000-0000-0000-000000000002');
insert into pacientes (id, clinica_id, nombre_completo, dentista_responsable_id) values
 ('e2000000-0000-0000-0000-00000000000a','c2000000-0000-0000-0000-00000000000a','Paciente A','d2000000-0000-0000-0000-000000000002'),
 ('e2000000-0000-0000-0000-00000000000b','c2000000-0000-0000-0000-00000000000b','Paciente B','d2000000-0000-0000-0000-000000000005');
insert into citas (id, paciente_id, dentista_id, inicio, fin, estado) values
 ('a2000000-0000-0000-0000-00000000000a','e2000000-0000-0000-0000-00000000000a','d2000000-0000-0000-0000-000000000002','2031-05-01 10:00+00','2031-05-01 10:30+00','en_consulta'),
 ('a2000000-0000-0000-0000-00000000000b','e2000000-0000-0000-0000-00000000000b','d2000000-0000-0000-0000-000000000005','2031-05-01 10:00+00','2031-05-01 10:30+00','en_consulta');
-- Una nota de la clínica B (para probar que un id AJENO no se confunde con un reintento propio)
insert into notas_clinicas (id, expediente_id, usuario_id, contenido, tipo)
  select 'f2000000-0000-0000-0000-00000000000b', e.id, 'd2000000-0000-0000-0000-000000000005', 'nota de B', 'consulta' from expedientes e where e.paciente_id = 'e2000000-0000-0000-0000-00000000000b';
commit;
