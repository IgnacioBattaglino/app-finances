# ADR-022: conteo retroactivo, opción A (preguntar y absorber)

Estado: Aceptada (sin implementar)
Fecha: 2026-09-25 (fecha del informe de origen)

Redactada a partir de: `docs/informe-conteo-retroactivo.md`, `docs/mudanza-reglas.md` («Pendiente atado a un paso») y `docs/traspaso-2026-10.md` §4 y §5.1.

## Contexto
Un conteo compara lo declarado contra el saldo calculado con todos los movimientos cargados en ese momento, sin mirar su fecha. Un gasto cargado después de contar, con fecha igual o anterior, queda contado dos veces: como gasto y dentro del ajuste. Hoy solo hay un aviso, y solo al editar.

## Decisión
Opción A más el aviso al crear: al crear un gasto o ingreso con fecha igual o anterior a un conteo que encontró diferencia en esa cuenta y moneda, la app pregunta «¿Esto es parte de esa diferencia?». «Sí» achica el ajuste; «No» lo carga aparte, como hoy. Si el conteo no encontró diferencia, solo un aviso chico.
- Solo gastos e ingresos (aportes y pagos de deuda quedan para después).
- Solo conteos de la 0041 en adelante (los que tienen neteo); para los anteriores, solo el aviso.
- Si el gasto es mayor que la diferencia, se absorbe entero y el ajuste da vuelta.
- «Cargado después de contar» se decide con `transactions.captured_at` (0060), no con `created_at`.
- En la interfaz es un interruptor apagado por defecto (`docs/traspaso-2026-10.md` §4).
- Se implementa junto con la vista previa del conteo en SQL (`planReconciliation`, paso 5 de la mudanza), en SQL como regla de escritura.

## Consecuencias
- Hacen falta dos datos nuevos (la diferencia original de cada cuenta en `liquid_reconciliations` y el vínculo en `transactions`), una función `recompute_reconciliation(batch_id)` y un trigger que reescribe hasta tres movimientos. El informe califica el riesgo de medio-alto.
- Con varios conteos posteriores alcanza con tocar el primero; en otra moneda no se absorbe nada.
- Borrar o editar el gasto absorbido devuelve o recalcula el ajuste; borrar el conteo entero deja los gastos y borra el vínculo.

## Alternativas
B (monto contado fijo, ajuste recalculado solo: cambia ajustes viejos sin pedirlo); C (dejar como hoy: avisar y volver a contar); D (movimiento compensatorio: deja Gastos e Ingresos inflados). Cada una con sus pros y contras en la sección 3 del informe.

## Documentos afectados
`docs/informe-conteo-retroactivo.md`, `docs/mudanza-reglas.md`, `docs/ARCHITECTURE.md` (cuando se implemente), `docs/ROADMAP.md` (todavía no existe).
