# ADR-005: valuation_mode pasa de la bolsa al activo

**Estado:** Aceptada — Julio 2026

## Contexto
La migración 0014 introdujo las bolsas de activos personalizables (asset_types), generalizando los 5 tipos fijos anteriores. El modo de valuación (`contributed` / `manual` / `live`) quedó como flag de la bolsa: todos los activos de una bolsa compartían el mismo modo.

Al probar la feature contra uso real apareció un error de modelo: el modo de valuación describe cómo se calcula el valor de UN activo, no una propiedad del grupo. Con ese diseño, mover un activo entre bolsas de distinto modo le cambiaba la valuación (ej: un cripto movido a una bolsa manual quedaba "sin valuación", perdiendo su cantidad acumulada y su coingecko_id como fuente de precio), y una bolsa no podía mezclar activos de modos distintos aunque tuviera sentido agruparlos igual (ej: dos activos de renta variable, uno con precio automático y otro sin).

## Decisión
`valuation_mode` se muda a `assets` (migración 0015). `asset_types` (la bolsa) queda como organización + agregación pura: nombre, orden, rendimiento agrupado, `include_in_total`, y sigue sugiriendo un default de `earns_yield` — y ahora también de `valuation_mode` (el modo predominante entre los activos que ya tiene) — al crear un activo nuevo, resuelto en la app, no en la base.

`asset_types.valuation_mode` queda deprecada, mismo tratamiento que `assets.type` en la 0014: se relaja (deja de ser NOT NULL), no se borra; se elimina en una migración futura.

Mover un activo de bolsa deja de tener cualquier efecto sobre su valuación.

## Consecuencias
- (+) Mover un activo entre bolsas es una operación puramente organizativa: nunca rompe ni cambia su valuación.
- (+) Una bolsa puede mezclar activos de distinto modo de valuación, lo cual refleja mejor el uso real (agrupar por criterio propio del usuario, no por restricción técnica).
- (+) El modelo queda más simple de razonar: cada activo es dueño de su propio comportamiento de valuación.
- (−) Segunda migración en poco tiempo sobre la misma área (0014 → 0015): el costo de corregir un error de modelo detectado temprano, antes de tener datos reales en producción.
- (−) `asset_types.valuation_mode` queda como columna deprecada en la base hasta una limpieza futura, igual que `assets.type`.
