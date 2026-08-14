-- ============================================================
-- SIRO — FASE 1 (Seguridad y estabilidad)
-- Migración 028: índices en columnas de llave foránea faltantes.
-- ------------------------------------------------------------
-- Postgres crea índice automático para la PRIMARY KEY y para las
-- restricciones UNIQUE, pero NO para las llaves foráneas. Sin estos
-- índices, cada JOIN o filtro por *_id hace un recorrido secuencial
-- de la tabla. Estos son justo los caminos calientes (agenda, saldos,
-- historial clínico, corte de caja).
--
-- Solo se agregan índices sobre FK/columnas de fecha realmente
-- consultadas. Los FK que ya tenían índice en migraciones previas
-- (odontograma, periodontograma, recetas.paciente_id, referencias.
-- paciente_id, consentimientos.paciente_id) NO se duplican aquí.
--
-- Es 100% aditiva y reversible: no toca datos ni esquema.
-- `if not exists` la hace segura de re-ejecutar.
--
-- NOTA sobre bloqueo de escrituras:
-- `create index` normal toma un lock breve de escritura sobre la tabla
-- mientras construye el índice. En clínicas con pocos registros esto es
-- instantáneo. Si tu base ya tiene VOLUMEN y no quieres ni ese bloqueo,
-- NO uses esta migración para esas tablas: ejecuta a mano en el SQL
-- Editor la versión `create index concurrently if not exists ...`
-- (misma definición, agregando la palabra `concurrently`). `concurrently`
-- NO puede correr dentro de una migración transaccional, por eso aquí va
-- la versión normal.
-- ============================================================

-- ---------- Agenda / citas ----------
create index if not exists idx_citas_paciente_id
  on citas (paciente_id);
-- Compuesto: sirve para "citas de este dentista en tal rango" y también
-- para filtrar solo por dentista_id (prefijo izquierdo del índice).
create index if not exists idx_citas_dentista_inicio
  on citas (dentista_id, inicio);

-- ---------- Sistema financiero / pagos ----------
create index if not exists idx_pagos_paciente_id
  on pagos (paciente_id);
-- Corte de caja: se consulta por fecha.
create index if not exists idx_pagos_creado_en
  on pagos (creado_en);

-- ---------- Tratamientos ----------
create index if not exists idx_tratamientos_paciente_id
  on tratamientos (paciente_id);
create index if not exists idx_tratamientos_dentista_id
  on tratamientos (dentista_id);

-- ---------- Expediente clínico ----------
create index if not exists idx_notas_clinicas_expediente_id
  on notas_clinicas (expediente_id);
create index if not exists idx_expedientes_paciente_id
  on expedientes (paciente_id);
create index if not exists idx_signos_vitales_paciente_id
  on signos_vitales (paciente_id);

-- ---------- Documentos y fotografías ----------
create index if not exists idx_documentos_clinicos_paciente_id
  on documentos_clinicos (paciente_id);
create index if not exists idx_fotografias_paciente_id
  on fotografias (paciente_id);

-- ---------- Cola de espera / urgencias ----------
create index if not exists idx_lista_espera_paciente_id
  on lista_espera (paciente_id);
create index if not exists idx_lista_espera_dentista_id
  on lista_espera (dentista_id);

-- ---------- FK dentista_id sin índice en otros módulos ----------
create index if not exists idx_recetas_dentista_id
  on recetas (dentista_id);
create index if not exists idx_referencias_medicas_dentista_id
  on referencias_medicas (dentista_id);
create index if not exists idx_consentimientos_informados_dentista_id
  on consentimientos_informados (dentista_id);
