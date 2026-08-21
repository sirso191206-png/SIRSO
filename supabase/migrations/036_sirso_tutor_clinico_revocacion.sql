-- ============================================================
-- SIRO — Huecos legales y clínicos: tutor, datos clínicos
-- adicionales, control de recetas, revocación de consentimientos
-- Migración 036
-- ------------------------------------------------------------
-- Aditiva en su totalidad.
-- ============================================================

-- ---------- 1. Tutor/representante legal (para menores de edad) ----------
-- No es solo un dato más: un menor no puede otorgar consentimiento
-- válido por sí mismo — el consentimiento informado y las decisiones
-- clínicas relevantes las debe firmar/autorizar el tutor. Guardado
-- como jsonb (mismo patrón que contacto_emergencia) porque es
-- información de UNA persona con varios campos, no una lista.
alter table pacientes add column if not exists tutor_legal jsonb;
-- Forma esperada: { nombre, parentesco, identificacion, telefono }

comment on column pacientes.tutor_legal is
  'Tutor/representante legal — obligatorio en la práctica cuando el paciente es menor de edad. Se usa para exigir su firma en consentimientos informados en vez de (o además de) la del paciente.';

-- ---------- 2. Grupo sanguíneo, toxicomanías, antecedentes gineco-obstétricos ----------
alter table expedientes add column if not exists grupo_sanguineo text
  check (grupo_sanguineo is null or grupo_sanguineo in ('O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'));

-- Toxicomanías: mismo patrón jsonb en arreglo que enfermedades/alergias
-- (no solo tabaco/alcohol, que ya viven en columnas propias desde antes).
alter table expedientes add column if not exists toxicomanias jsonb not null default '[]'::jsonb;
-- Cada elemento: string simple, o { sustancia, frecuencia, desde_cuando, notas }

-- Antecedentes gineco-obstétricos: jsonb porque son varios campos
-- relacionados entre sí, no independientes — y solo aplican cuando la
-- clínica decide capturarlos (nunca obligatorio, ni asumido por sexo).
alter table expedientes add column if not exists antecedentes_ginecobstetricos jsonb;
-- Forma esperada: { gestas, partos, cesareas, abortos, fecha_ultima_menstruacion,
--                    metodo_anticonceptivo, notas }

-- ---------- 3. Recetas: vigencia y marca de control ----------
alter table recetas add column if not exists vigencia_dias integer not null default 30 check (vigencia_dias > 0);
alter table recetas add column if not exists es_controlada boolean not null default false;
-- "es_controlada" marca recetas de medicamentos controlados (psicotrópicos,
-- estupefacientes) que en México exigen recetario especial/numerado aparte
-- del recetario común — SIRO no emite ese recetario especial (es un trámite
-- ante COFEPRIS, no algo que un software pueda generar por su cuenta), pero
-- sí debe poder MARCAR y ADVERTIR que una receta lo requiere.

comment on column recetas.es_controlada is
  'Marca informativa: medicamento controlado que legalmente requiere recetario especial numerado (COFEPRIS), no generado por SIRO. Solo advierte, no sustituye el trámite real.';

-- ---------- 4. Consentimientos: fecha de procedimiento y revocación ----------
-- fecha_procedimiento es distinta de creado_en (fecha de FIRMA): el
-- procedimiento puede programarse para después de firmar el consentimiento.
alter table consentimientos_informados add column if not exists fecha_procedimiento date;

alter table consentimientos_informados add column if not exists revocado_en timestamptz;
alter table consentimientos_informados add column if not exists revocado_por uuid references usuarios(id) on delete set null;
alter table consentimientos_informados add column if not exists motivo_revocacion text;

-- Los consentimientos son append-only a propósito (nunca tuvieron
-- policy de UPDATE) — la revocación es la ÚNICA excepción legítima,
-- y debe quedar blindada para que ni siquiera un UPDATE bien
-- intencionado pueda tocar otra cosa (procedimiento, firmas, etc.).
-- El trigger, no solo la policy, es lo que realmente lo garantiza.
create or replace function fn_solo_revocacion_consentimiento()
returns trigger
language plpgsql
as $$
begin
  if new.procedimiento is distinct from old.procedimiento
     or new.diagnostico is distinct from old.diagnostico
     or new.pronostico is distinct from old.pronostico
     or new.riesgos is distinct from old.riesgos
     or new.molestias_efectos_secundarios is distinct from old.molestias_efectos_secundarios
     or new.beneficios is distinct from old.beneficios
     or new.alternativas is distinct from old.alternativas
     or new.motivo_eleccion is distinct from old.motivo_eleccion
     or new.grado_urgencia is distinct from old.grado_urgencia
     or new.lugar is distinct from old.lugar
     or new.fecha_procedimiento is distinct from old.fecha_procedimiento
     or new.firma_paciente_nombre is distinct from old.firma_paciente_nombre
     or new.firma_paciente_png is distinct from old.firma_paciente_png
     or new.firma_medico_nombre is distinct from old.firma_medico_nombre
     or new.firma_medico_png is distinct from old.firma_medico_png
     or new.testigo1_nombre is distinct from old.testigo1_nombre
     or new.testigo2_nombre is distinct from old.testigo2_nombre
     or new.paciente_id is distinct from old.paciente_id
     or new.dentista_id is distinct from old.dentista_id
     or new.creado_en is distinct from old.creado_en
  then
    raise exception 'Un consentimiento ya firmado no se puede editar — solo se puede revocar.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_solo_revocacion_consentimiento on consentimientos_informados;
create trigger trg_solo_revocacion_consentimiento
before update on consentimientos_informados
for each row execute function fn_solo_revocacion_consentimiento();

drop policy if exists consentimientos_update_revocar on consentimientos_informados;
create policy consentimientos_update_revocar on consentimientos_informados
  for update using (
    exists (select 1 from pacientes p where p.id = paciente_id and p.clinica_id = auth_clinica_id())
    and auth_rol() in ('owner', 'dentista')
  );
