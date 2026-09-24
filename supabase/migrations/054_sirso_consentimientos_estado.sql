-- ============================================================
-- SIRO — Módulo legal, Fase 5: consentimientos — campos y estado
-- Migración 054
-- ------------------------------------------------------------
-- consentimientos_informados ya tenía casi todo lo que pide la
-- sección 7 del documento (procedimiento, riesgos, beneficios,
-- alternativas, diagnóstico, pronóstico, motivo de elección, grado de
-- urgencia, lugar, firmas, revocación con auditoría — migraciones 024,
-- 035, 036). Solo faltaba, comparado campo por campo: indicaciones,
-- contraindicaciones, observaciones, un `estado` explícito, y el
-- vínculo a un tratamiento concreto.
--
-- SOBRE EL FLUJO BORRADOR/PENDIENTE QUE PIDE EL DOCUMENTO: el
-- formulario actual (TabConsentimientos.jsx) captura todo el
-- contenido Y ambas firmas en una sola sesión — no existe hoy un
-- flujo de "enviar al paciente para firmar después". Construir eso
-- bien (probablemente firma remota, notificación, expiración) es una
-- función más grande que no se apuró en esta migración — por eso
-- `estado` solo contempla 'firmado' (el único estado real que el
-- sistema produce hoy), 'revocado' (ya existía) y 'cancelado' (nuevo).
-- No se agregan 'borrador'/'pendiente' porque sería un estado que la
-- interfaz nunca podría alcanzar todavía — hubiera sido peor que no
-- tener el campo.
-- ============================================================

alter table consentimientos_informados add column if not exists indicaciones text;
alter table consentimientos_informados add column if not exists contraindicaciones text;
alter table consentimientos_informados add column if not exists observaciones text;
alter table consentimientos_informados add column if not exists tratamiento_id uuid references tratamientos(id) on delete set null;

alter table consentimientos_informados add column if not exists estado text not null default 'firmado'
  check (estado in ('firmado', 'revocado', 'cancelado'));

alter table consentimientos_informados add column if not exists cancelado_en timestamptz;
alter table consentimientos_informados add column if not exists cancelado_por uuid references usuarios(id) on delete set null;
alter table consentimientos_informados add column if not exists motivo_cancelacion text;

create index idx_consentimientos_tratamiento on consentimientos_informados(tratamiento_id);

-- Se extiende (no se reemplaza a medias) la protección de
-- inmutabilidad de la migración 036 — conserva TODA la lista de campos
-- que ya bloqueaba, y agrega los campos nuevos a esa misma lista de
-- "nunca editables una vez creado". Además:
--   1) cuando se revoca (revocado_en pasa de null a un valor), estado
--      se sincroniza solo a 'revocado' — la app no tiene que acordarse
--      de mandar ambos campos.
--   2) se agrega una segunda transición permitida, independiente de la
--      revocación: cancelado_en/cancelado_por/motivo_cancelacion +
--      estado -> 'cancelado', para un consentimiento que nunca debió
--      existir (creado por error), distinto de uno que sí fue válido y
--      luego se revocó.
create or replace function fn_solo_revocacion_consentimiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sincroniza estado automáticamente cuando se revoca — así la app
  -- solo necesita mandar revocado_en/revocado_por, igual que antes de
  -- esta migración.
  if new.revocado_en is not null and old.revocado_en is null then
    new.estado := 'revocado';
  end if;

  if (
       new.procedimiento is distinct from old.procedimiento
    or new.riesgos is distinct from old.riesgos
    or new.beneficios is distinct from old.beneficios
    or new.alternativas is distinct from old.alternativas
    or new.diagnostico is distinct from old.diagnostico
    or new.pronostico is distinct from old.pronostico
    or new.molestias_efectos_secundarios is distinct from old.molestias_efectos_secundarios
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
    or new.indicaciones is distinct from old.indicaciones
    or new.contraindicaciones is distinct from old.contraindicaciones
    or new.observaciones is distinct from old.observaciones
    or new.tratamiento_id is distinct from old.tratamiento_id
  )
  then
    raise exception 'Un consentimiento ya firmado no se puede editar — solo se puede revocar o cancelar.';
  end if;

  return new;
end;
$$;

-- La política de update (036) ya permitía owner/dentista de la clínica
-- correspondiente; se conserva sin cambios — el trigger de arriba es
-- lo que decide QUÉ campos puede tocar esa política, no ella misma.
