import { amountInCurrency } from './currencyTotals.js'

const cents = (n) => Math.round(n * 100) / 100

// El efecto de una fila sobre el saldo de su cuenta: la MISMA regla que
// computeLiquidByAccount (lib/liquid.js). `currencyOf(accountId)` es la moneda
// de la cuenta. Devuelve { accountId, delta } o null si la fila no toca
// ninguna cuenta (o no se puede saber de cuánto).
export function effectOf(source, row, currencyOf) {
  if (source === 'transaction') {
    if (!row.account_id) return null
    return { accountId: row.account_id, delta: row.kind === 'income' ? Number(row.amount) : -Number(row.amount) }
  }
  const currency = currencyOf(row.account_id)
  if (!row.account_id || !currency) return null
  if (source === 'contribution') {
    if (!row.affects_liquid && row.affects_liquid !== undefined) return null
    const d = amountInCurrency(Number(row.amount_usd), Number(row.mep_rate), currency)
    return { accountId: row.account_id, delta: row.direction === 'out' ? d : -d }
  }
  if (source === 'debt_payment') {
    if (row.affects_liquid === false || !row.mep_rate) return null
    return { accountId: row.account_id, delta: -amountInCurrency(Number(row.amount_usd), Number(row.mep_rate), currency) }
  }
  return null
}

// Saldo de cada cuenta DESPUÉS de cada movimiento. `balances`: Map
// accountId → saldo actual. `rows`: de la más nueva a la más vieja,
// { key, accountId, delta }; una fila sin key (la cola posterior al período)
// solo se resta. Devuelve Map key → saldo; una cuenta sin saldo conocido no
// aparece, así nunca se muestra un número dudoso.
export function runningBalances(balances, rows) {
  const running = new Map(balances)
  const out = new Map()
  for (const { key, accountId, delta } of rows) {
    if (!running.has(accountId)) continue
    if (key != null) out.set(key, cents(running.get(accountId)))
    running.set(accountId, cents(running.get(accountId) - delta))
  }
  return out
}
