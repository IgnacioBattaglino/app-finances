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

// ── El tipo de una fila, en un solo lugar ───────────────────────────────────
//
// No son cinco tipos de movimiento: son siete (ver docs/ux/movimientos.md,
// sección 3.1), y hasta acá "¿qué es esta fila?" se respondía en cuatro
// lugares con cuatro criterios parciales —monthTotals y savedByCurrency
// (lib/movements.js), el switch de filas de Movements.jsx, y
// groupExpensesByCategory (lib/transactions.js)—, cada uno mirando un
// subconjunto de las señales que hacen falta (system_key, transfer_id,
// account.is_savings, asset.savings_account_id). movementType es la única
// función que las mira todas: mismo rol que isMovedMoney, un nivel más
// completo, y los cuatro lugares pasan a usarla.
export const EXPENSE = 'expense'
export const INCOME = 'income'
// El reparto de un conteo comparte categoría con una transferencia real
// (account_transfer) pero no lleva transfer_id — es la única diferencia entre
// los tipos 4 y 5 de la sección 3.1.
export const RECONCILIATION_SPLIT = 'reconciliation_split'
export const CONTRIBUTION = 'contribution'

const MOVED_MONEY_TYPES = new Set([ACCOUNT_TRANSFER, RECONCILIATION_SPLIT, SAVINGS_MOVEMENT])

// ¿Este TIPO (ya calculado por movementType) es plata que solo cambió de
// lugar? Mismo criterio que isMovedMoney, pero sobre el tipo en vez de la
// categoría sola: hace falta para poder excluir el reparto de un conteo, que
// isMovedMoney ya identifica bien por categoría pero sin distinguirlo de una
// transferencia real (no hace falta distinguirlos para excluirlos: los dos
// quedan afuera de los totales igual).
export function isMovedMoneyType(type) {
  return MOVED_MONEY_TYPES.has(type)
}

// Recibe una fila de `transactions` (con `kind`, `category` y `transfer_id`
// embebidos, como las trae getTransactions) o de `contributions` (con
// `direction`, como las trae getLiquidContributions) y devuelve uno de los
// siete tipos.
//
// El orden de las preguntas importa:
//
// 1. `direction` solo lo tienen las contributions — no hace falta mirar nada
//    más para saber que es una inversión o un retiro (si es Invertido o
//    Ahorrado ya no es una pregunta de TIPO, sino de a qué se convirtió el
//    activo: la sigue resolviendo monthTotals con asset.savings_account_id).
// 2. `transfer_id` decide una transferencia entre cuentas SIN mirar la
//    categoría: hasta la migración 0041 create_account_transfer anotaba
//    'savings_movement' en vez de 'account_transfer' (mentía: transferir
//    entre dos cuentas del día a día no es un ahorro), así que una fila vieja
//    puede tener esa categoría con transfer_id igual — y sigue siendo una
//    transferencia, nunca un movimiento "de afuera" (que jamás lleva
//    transfer_id, los escribe una sola fila).
// 3. Sin transfer_id, la categoría separa el ajuste (plata real) del reparto
//    de un conteo y del movimiento de ahorro "de afuera" — mismas llaves que
//    ya usan isBalanceAdjustment/isMovedMoney.
// 4. Lo que queda es un gasto o un ingreso común: categoría del usuario, y el
//    `kind` de la fila dice cuál.
export function movementType(row) {
  if (row.direction !== undefined) return CONTRIBUTION
  if (row.transfer_id) return ACCOUNT_TRANSFER
  if (isBalanceAdjustment(row.category)) return BALANCE_ADJUSTMENT
  if (isMovedMoney(row.category)) {
    return row.category.system_key === ACCOUNT_TRANSFER ? RECONCILIATION_SPLIT : SAVINGS_MOVEMENT
  }
  return row.kind === 'income' ? INCOME : EXPENSE
}
