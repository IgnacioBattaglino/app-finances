# ADR-002: No materializar snapshots mensuales del portafolio

**Estado:** Aceptada — Julio 2026

## Contexto
El dashboard muestra la evolución histórica del patrimonio (aportado vs. valor actual, mensual). Se evaluó almacenar una "foto" mensual precalculada (materialización) versus calcular la curva al vuelo desde asset_valuations.

## Decisión
No materializar. La curva se calcula agrupando asset_valuations por mes (última valuación de cada activo por mes) contra el acumulado de contributions.

## Consecuencias
- (+) Una sola fuente de verdad: corregir una valuación pasada corrige automáticamente la historia.
- (+) Modelo más simple, sin riesgo de desincronización entre el dato base y el agregado.
- (−) Costo de cálculo en cada consulta — evaluado como despreciable: escala de un solo usuario (~600 filas en 5 años; agregación sub-milisegundo en PostgreSQL).
- Revisión: si alguna consulta se volviera medible y molesta, materializar en ese momento es una migración sencilla (agregar tabla de agregados). La inversa (sanear datos desincronizados) no lo es.
