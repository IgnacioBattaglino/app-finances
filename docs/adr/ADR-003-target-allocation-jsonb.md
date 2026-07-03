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
