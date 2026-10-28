# Inventario de materiales ligado a la consulta (migración 118)

## Qué hace
- **Materiales** por clínica y sucursal (`NULL` = almacén general), con stock, mínimo y unidad. El stock **no se edita**:
  solo cambia con un movimiento.
- **Movimientos**: entrada, salida o ajuste por conteo físico. Guardan cuánto cambió, el stock antes y después, quién
  (id y nombre) y cuándo. No se editan ni se borran.
- **Receta por tratamiento del catálogo**: lo que consume **una sesión**.
- **Descuento automático y atómico**: el disparador `trg_inventario_tratamiento` descuenta la receta en la misma
  transacción que registra la sesión o completa el tratamiento, sin importar desde dónde se haga (consulta, ficha del
  paciente o cola sin conexión). Reintentar no descuenta dos veces (`tratamientos.inventario_sesiones_descontadas`).
- **Sin stock suficiente no se bloquea la atención**: el stock queda en negativo y la pantalla avisa
  («Sesión registrada. Inventario — sin stock: …»).
- **Tablero**: alerta de stock bajo en *Mi día* (propietario y asistente).
- **Pantalla** `/inventario` (propietario y asistente): existencias, entradas, salidas y ajustes, recetas, historial,
  CSV (existencias y movimientos) y reporte imprimible.
- **Plan**: funcionalidad `inventario`. La migración la agrega a las plantillas Profesional, Clínica y Empresarial.
  **Las suscripciones vigentes no cambian** (GUIA_PLANES §5).
- **Sin conexión**: entradas y salidas pasan por la cola offline (con id idempotente). Los ajustes necesitan conexión,
  porque un conteo físico subido tarde pisaría los descuentos hechos mientras tanto.

## Pruebas
- `supabase/tests/inventario_materiales_test.sql`: 42/42 (planes, roles, idempotencia, descuento, atomicidad, avisos,
  aislamiento entre clínicas y plan sin inventario).
- `aislamiento_clinicas_test.sql` (C1, lista explícita, escrituras e inserciones hacia B): 36/36. D1 de sesiones: 28/28.
- Regresión local igual a la referencia. El rollback deja una huella idéntica a la de una base 001–117 donde nunca se
  aplicó la 118; se puede repetir, y la 118 se puede volver a aplicar.

## Pasos para producción (cada uno requiere autorización del responsable)
1. **Respaldo** con el procedimiento diario (`ops/respaldo_diario`) y verificar su SHA-256.
2. **Orden**: va después de la 117 (reserva en línea), que ocupó ese número en `main`; se renumeró a 118.
3. **Aplicar** `supabase/migrations/118_sirso_inventario_materiales.sql` con el mismo método de las anteriores
   (pooler de sesión + TLS, escribiendo la ref). Requiere la 116; aplicar antes la 117.
4. **Verificar en solo lectura**: las 3 tablas tienen RLS y las políticas `sesion_activa_*` y `plan_func_*`;
   `funcionalidades.inventario` existe; `authenticated` no tiene EXECUTE sobre `fn_inventario_aplicar` ni
   `fn_inventario_descontar_tratamiento`; el disparador `trg_inventario_tratamiento` existe; no cambió ninguna fila de
   `tratamientos`.
5. **Decidir quién lo recibe**: desde `/superadmin/planes`, dar `inventario` a las clínicas vigentes que correspondan
   («Aplicar condiciones»). Si no se hace, ninguna clínica existente lo verá.
6. **Frontend**: integrar la rama a `main` y hacer push (Vercel publica). Hacerlo **después** del paso 3: el frontend nuevo
   sin la 118 mostraría el menú solo si el plan ya trae la funcionalidad, así que no rompe nada, pero el orden evita errores.
7. **Prueba de humo** con una clínica de prueba: material con stock 1 y mínimo 1 → receta de 2 por sesión → registrar
   sesión en la consulta → aviso de stock negativo, movimiento con el odontólogo como autor y alerta en *Mi día*.

Rollback: `supabase/rollback/siro_v3/rollback_118.sql` (borra el inventario y quita la funcionalidad de planes y
suscripciones; los tratamientos no se tocan).

## Límites conocidos
- Los tratamientos no tienen sucursal: la receta apunta a un material concreto, y ese material (su sucursal) es de donde
  se descuenta. Una clínica con almacenes separados por sucursal necesita recetas por sucursal (pendiente de diseño).
- Cancelar o reabrir un tratamiento no devuelve material: lo usado ya se usó. Para corregir, se hace un ajuste.
