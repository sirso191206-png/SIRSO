-- ============================================================
-- SIRSO — Fix de seguridad: auditoría en `usuarios`
-- ============================================================
-- Todas las demás tablas sensibles (pacientes, expedientes, tratamientos,
-- pagos, citas) ya tenían auditoría automática desde el inicio. `usuarios`
-- se quedó fuera — crear un usuario nuevo o desactivarlo no quedaba
-- registrado, aunque el documento de reorganización lo pide de forma
-- explícita ("Crear o desactivar usuario" en la lista de auditoría).

create trigger trg_auditoria_usuarios
after insert or update on usuarios
for each row execute function fn_auditoria();
