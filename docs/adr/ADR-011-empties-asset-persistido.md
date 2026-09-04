# ADR-011 — `empties_asset` se guarda en la fila, y los retiros viejos se dejan como están

Fecha: 2026-09-04
Estado: aceptado

## Contexto

La ganancia realizada de un retiro (`contributions.realized_gain`) se calcula
en el cliente con `decomposeWithdrawal` (`lib/portfolio.js`) y se congela en la
fila. Esa cuenta tiene dos insumos: el aportado vigente del activo y **si el
retiro vacía o no la posición**:

```js
if (amount > contributedBefore || emptiesAsset) {
  return { realizedGain: round(amount - contributedBefore) }
}
return { realizedGain: 0 }
```

`emptiesAsset` es una declaración del formulario que origina la operación —
`true` en Liquidar, `false` en Retirar—, nunca una inferencia contra la
valuación (una valuación vieja cristalizaría una ganancia falsa para siempre).

El problema: ese insumo no se guardaba. La columna `empties_asset` existe desde
la migración 0017 (nullable, "lógica pendiente") pero ningún código la escribía,
así que al editar un retiro no había de dónde sacarla y
`ContributionFormModal` mandaba `emptiesAsset: false` fijo. Entonces reabrir un
retiro nacido de Liquidar y guardarlo sin tocar nada lo recalculaba con la
regla equivocada: medido, un retiro con `realized_gain` −60,68 pasaba a 0. Y
como el aportado neto es lo que decide si una posición está cerrada (ADR-010),
ese 0 devolvía a la vida una posición liquidada.

La regla que se violaba es simple y vale para todo formulario de la app:
**guardar sin tocar nada deja la fila idéntica**.

## Decisión

1. **`empties_asset` se persiste** con el retiro (`toRow` en `lib/contributions
   .js`), y al editar se lee de la fila en vez de asumir `false`. No hace falta
   migración: la columna ya existe y es nullable.
2. **Los retiros anteriores a esto (con `empties_asset` en null) no se tocan.**
   No se infiere si vaciaron mirando el historial, no se hace backfill y no se
   muestra ningún aviso en la UI. Se comportan exactamente como hasta hoy
   (`null` se lee como "no vació", que es el `false` de antes).

## Por qué no inferirlos

Se podría deducir cuáles vaciaron recorriendo el historial, igual que hace
`classifyOperations` para etiquetar "Liquidación" en la pantalla del activo.
Pero esa inferencia es aproximada: depende del orden de las filas y de que toda
entrada de un activo de precio en vivo traiga `quantity` (invariante que el
propio código documenta como frágil). Una inferencia equivocada acá no pinta
mal una etiqueta: **cristaliza una ganancia falsa para siempre**, porque el
`realized_gain` recalculado se guarda y no se vuelve a recalcular.

Además, la app tiene hoy un solo usuario, que sabe cuáles son sus retiros
viejos y no los va a reeditar. El costo de equivocarse es alto y permanente; el
de no hacer nada es que un puñado de filas históricas conserven el
comportamiento que ya tenían. Un aviso en la UI tampoco aporta: le pediría al
usuario que confirme un dato que la app no puede verificar, en un formulario
que se abre para corregir otra cosa.

## Consecuencias

- Un retiro nuevo (Retirar o Liquidar) se guarda con la marca, y reeditarlo
  conserva su ganancia realizada.
- Un aporte guarda `null`: la columna no aplica a las entradas, y null ahí
  significa "no aplica", no "no vació".
- Las dos patas de una transferencia quedan en `null`: `create_transfer`
  (migración 0017) no setea la columna y no hace falta cambiarla — una
  transferencia nunca vacía el activo y sus patas son de solo lectura, así que
  nunca vuelven a pasar por un recálculo.
- `classifyOperations` sigue infiriendo la etiqueta "Liquidación" por posición.
  Es un cambio aparte: mientras existan filas con `empties_asset` en null, la
  etiqueta no puede salir de la columna sin empeorar lo que hoy se muestra bien.

## Verificación

Tests en `src/lib/contributions.test.js`: la liquidación se guarda marcada y con
su ganancia (−60,68 sobre el caso medido), el retiro parcial sin marcar y sin
cristalizar nada, y reeditar la liquidación con el dato guardado conserva la
ganancia mientras que hacerlo con `false` (el bug) la borra.
