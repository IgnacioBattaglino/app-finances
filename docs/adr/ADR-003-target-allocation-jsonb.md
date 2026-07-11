# ADR-003: Distribución objetivo como JSONB en settings

**Estado:** Aceptada — Julio 2026

## Contexto
La distribución objetivo del portafolio (% por tipo de activo) necesita persistirse. Se evaluó una tabla propia (target_allocations con una fila por tipo) versus un campo JSONB dentro de settings.

## Decisión
Campo JSONB en settings: {"crypto": 15, "cedear": 65, "bond": 10, "fund": 10, "cash": 0}.

## Consecuencias
- (+) Los 5 valores se leen y escriben siempre juntos como una unidad de configuración; se evita un join sin beneficio.
- (+) Settings queda como único punto de configuración global.
- (−) La validación (suma = 100) vive en la aplicación, no en la base.
- Revisión: si la asignación necesitara historia propia (ej: trackear cambios de estrategia en el tiempo), migrar a tabla con vigencias.

## Nota (migración 0014 — bolsas personalizables)
Los tipos de activo dejaron de ser 5 valores fijos: ahora son `asset_types`, una bolsa por fila, personalizable por usuario (crear, renombrar, archivar). El JSONB de esta decisión sigue sin usarse en el código (el rebalanceo se sacó de la UI, ver FUNCTIONAL.md) y no se toca en esta migración. Pero el día que el rebalanceo vuelva como vista propia, `target_allocation` no puede seguir keyed por el nombre del tipo (`{"crypto":15,...}`): las bolsas son arbitrarias y renombrables por usuario. Va a necesitar indexarse por `asset_type_id`, no por string fijo.
