-- ============================================================
-- SIRO — Concurrencia (versión ligera): detectar ediciones
-- simultáneas de un mismo paciente, no perderlas en silencio
-- Migración 069
-- ------------------------------------------------------------
-- IMPORTANTE — lo que esto ES y lo que NO es: esto NO es el sistema de
-- trabajo sin internet ni de sincronización completa que sigue
-- pendiente en la lista grande — esa pieza es mucho más grande
-- (guardar cambios localmente, resolver conflictos al reconectar) y
-- sigue sin construirse, con razón, por el riesgo que implica.
--
-- Esto es más acotado: hoy, si dos personas abren la ficha del mismo
-- paciente y ambas guardan, la segunda en guardar sobrescribe a la
-- primera SIN AVISO — ninguna de las dos se entera de que perdió
-- información. `pacientes` no tenía ninguna columna que registrara
-- cuándo se modificó por última vez, así que ni siquiera había forma
-- de detectar que esto pasó.
--
-- `actualizado_en` se mantiene sola vía trigger (nunca la escribe el
-- frontend directamente) — cada UPDATE real la actualiza. El frontend
-- guarda el valor que tenía al ABRIR el formulario, y lo manda de
-- vuelta al guardar; si alguien más ya actualizó el registro mientras
-- tanto, el UPDATE no encuentra ninguna fila que coincida, y en vez de
-- guardar sobre datos desactualizados, la persona recibe un aviso
-- claro para recargar y revisar qué cambió.
-- ============================================================

alter table pacientes add column if not exists actualizado_en timestamptz default now();

create or replace function fn_set_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_set_actualizado_en_pacientes on pacientes;
create trigger trg_set_actualizado_en_pacientes
before update on pacientes
for each row execute function fn_set_actualizado_en();
