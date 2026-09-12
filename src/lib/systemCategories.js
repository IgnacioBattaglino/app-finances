// Las categorías del sistema, por su llave estable (categories.system_key,
// migración 0037) — nunca por el nombre visible, que el usuario puede cambiar,
// ni por `is_system` a secas, que dice QUE es del sistema pero no CUÁL.
//
// ── LA DISTINCIÓN QUE ORDENA TODO ──────────────────────────────────────────
// No todas las categorías del sistema significan lo mismo, y tratarlas igual
// es lo que tenía a Inicio y a Movimientos diciendo cosas distintas sobre el
// mismo mes: Inicio escondía los ajustes enteros (`!is_system`) y Movimientos
// los contaba enteros, reparto incluido.
//
//   · 'balance_adjustment' ("Ajuste de saldo") es PLATA QUE SE FUE O APARECIÓ.
//     Desde la migración 0041 lleva el NETO de un conteo: el gasto real que no
//     habías cargado. Cuenta como gasto o ingreso en todas las pantallas,
//     igual que cualquier otro.
//   · 'savings_movement' ("Movimiento de ahorro") y 'account_transfer'
//     ("Transferencia de cuenta") son PLATA QUE CAMBIÓ DE LUGAR. El patrimonio
//     no se movió: salió de una cuenta y entró a otra, o pasó del bolsillo a
//     lo guardado. No cuentan en ningún total ni en ningún desglose por
//     categoría, en ninguna pantalla — pero sí aparecen en el historial de
//     cada cuenta, que es donde la pregunta es "qué pasó acá".
export const BALANCE_ADJUSTMENT = 'balance_adjustment'
export const SAVINGS_MOVEMENT = 'savings_movement'
export const ACCOUNT_TRANSFER = 'account_transfer'

const MOVED_MONEY = new Set([SAVINGS_MOVEMENT, ACCOUNT_TRANSFER])

// ¿Esta fila solo movió plata de lugar? Lo preguntan los cuatro lugares que
// suman o agrupan movimientos (los totales del mes y el desglose de
// Movimientos, el bloque de Gastos de Inicio y su desglose), y por eso la
// respuesta vive en un solo lado: hasta acá cada uno filtraba con un criterio
// propio.
//
// Recibe la categoría embebida de la fila (`t.category`), que puede faltar si
// la consulta no la trajo: sin categoría, no hay nada que excluir.
export function isMovedMoney(category) {
  return MOVED_MONEY.has(category?.system_key)
}

// ¿Es el ajuste de un conteo? Lo pregunta getTransactions para no esconderlo
// cuando cayó en una cuenta de ahorro (ver ahí por qué).
export function isBalanceAdjustment(category) {
  return category?.system_key === BALANCE_ADJUSTMENT
}
