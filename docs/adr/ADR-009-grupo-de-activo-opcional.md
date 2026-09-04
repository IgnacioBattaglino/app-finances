# ADR-009 — El grupo de un activo es opcional

Fecha: 2026-09-01
Estado: aceptado

## Contexto

La migración 0014 creó `asset_types` (bolsas personalizables) y dejó
`assets.asset_type_id` `NOT NULL`: todo activo tenía que vivir en un grupo. Eso
obliga a inventar una bolsa para el activo que no pertenece a ninguno — el caso
típico era "Efectivo USD" con un solo activo adentro —, y el encabezado del
grupo termina repitiendo el nombre de su única fila sin agregar ninguna
información.

## Decisión

`assets.asset_type_id` pasa a ser nullable (migración 0029). Un activo sin
grupo se muestra en Portafolio como tarjeta suelta, al mismo nivel que los
grupos (`portfolioEntries`, `lib/portfolio.js`). Es una decisión del usuario —
dejar "Grupo" vacío en el formulario —, no un dato faltante: por eso no se lo
mete en un grupo fabricado "Sin grupo".

## Lo que no cambia

- La FK a `asset_types` queda igual: un `null` no referencia nada, que es
  justamente lo que significa "sin grupo", y la FK solo valida los valores
  presentes.
- El índice `idx_assets_asset_type` (0014) sigue sirviendo al conteo por grupo
  de `countAssetsForType` (`lib/assetTypes.js`), que siempre filtra por un id
  concreto.
- RLS no se toca: la policy "own rows" de la 0005 es sobre `user_id`, no sobre
  el grupo.
- `get_portfolio_series` (0022, redefinida en la 0026) ya resolvía el caso sin
  cambios: hace `left join asset_types at on at.id = a.asset_type_id` y decide
  con `at.include_in_total is distinct from false`, así que un activo sin
  grupo deja esa columna en `null` y cuenta en el total — la misma regla que
  usa el cliente (`a.asset_type?.include_in_total !== false`).

## Consecuencias en la UI

- Un activo sin grupo cuenta en el valor total del portafolio (no hay
  `include_in_total` que lo excluya) y arranca marcado como que rinde, porque
  no hay bolsa de la que heredar ese default.
- Sacarle el grupo al único activo de un grupo hace desaparecer la tarjeta del
  grupo y deja el activo solo — no queda un grupo vacío colgando en la lista.
- El selector de orden de Portafolio (ver `lib/portfolioSort.js`) mezcla
  grupos y activos sueltos en el mismo nivel: cada grupo pesa por su total (o
  su % agregado), cada suelto por su propio valor y su propio %.
- La regla de archivado/eliminación de grupos de tres niveles (sin activos →
  eliminar; solo archivados → archivar; con algún activo activo → ninguna de
  las dos) no cambia: un activo sin grupo simplemente no participa de esa
  cuenta para ningún grupo.

## Alternativas descartadas

- **Grupo fabricado "Sin grupo".** Convertiría una ausencia de dato en una
  entidad más con la que interactuar (renombrar, archivar, reordenar) — sería
  una bolsa fantasma que nadie creó y que no se puede tratar como las demás.
- **Mantener `NOT NULL` y forzar a elegir un grupo por defecto.** Traslada la
  decisión del usuario a la app, adivinando mal en el caso típico (un activo
  que no encaja en ninguna categoría existente).
